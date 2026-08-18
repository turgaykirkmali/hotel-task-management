import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import * as expressSession from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  // Eğer stored (saklanan şifre) değeri geçersizse, doğrulama başarısız olacak
  if (!stored || !stored.includes('.')) {
    console.error('Geçersiz şifre formatı:', stored);
    return false;
  }
  
  const [hashed, salt] = stored.split(".");
  
  // Hem hash hem de salt değerlerinin varlığını kontrol et
  if (!hashed || !salt) {
    console.error('Hash veya salt eksik:', { hashed, salt });
    return false;
  }
  
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  if (hashedBuf.length !== suppliedBuf.length) return false;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: expressSession.SessionOptions = {
    secret: process.env.SESSION_SECRET || "otel-istek-sistemi-gizli-anahtar",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 1 gün
    },
    store: storage.sessionStore
  };
  
  console.log("Yeni oturum yapılandırması uygulanıyor...");

  app.set("trust proxy", 1);
  app.use(expressSession.default(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log('Giriş denemesi:', username);
        const user = await storage.getUserByUsername(username);
        
        if (!user) {
          console.log('Kullanıcı bulunamadı:', username);
          return done(null, false);
        }
        
        console.log('Kullanıcı bulundu, şifre kontrol ediliyor...');
        // Şifre kontrolü yapmadan önce format kontrolü
        if (!user.password || typeof user.password !== 'string' || !user.password.includes('.')) {
          console.error('Geçersiz şifre formatı:', user.password);
          return done(null, false);
        }
        
        const isValid = await comparePasswords(password, user.password);
        if (!isValid) {
          console.log('Şifre eşleşmedi');
          return done(null, false);
        }
        
        console.log('Giriş başarılı:', username);
        return done(null, user);
      } catch (error) {
        console.error('Kimlik doğrulama hatası:', error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const currentUser = req.user;
      if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
        return res.status(403).json({ message: "Yeni kullanıcı oluşturmak için yönetici yetkisi gereklidir" });
      }

      const requestedRole = req.body.role || "staff";
      if (!(["staff", "admin", "superadmin"] as const).includes(requestedRole)) {
        return res.status(400).json({ message: "Geçersiz kullanıcı rolü" });
      }

      if (requestedRole === "superadmin" && currentUser.role !== "superadmin") {
        return res.status(403).json({ message: "Superadmin oluşturma yetkiniz bulunmuyor" });
      }

      if (requestedRole === "admin" && currentUser.role !== "superadmin") {
        return res.status(403).json({ message: "Admin oluşturmak için superadmin yetkisi gereklidir" });
      }

      if (!req.body.username || !req.body.password) {
        return res.status(400).json({ message: "Kullanıcı adı ve şifre gereklidir" });
      }

      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Kullanıcı adı zaten var" });
      }

      const roleToUse = requestedRole;
      const hotelId = currentUser.role === "admin" ? currentUser.hotelId : req.body.hotelId;
      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
        role: roleToUse,
        hotelId: roleToUse === "superadmin" ? null : (hotelId ?? null),
      });

      const userWithoutPassword = { ...user } as any;
      delete userWithoutPassword.password;

      // Registration is an administrative action; do not automatically sign the creator in as the new user.
      return res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Kayıt hatası:", error);
      res.status(500).json({ message: "Kayıt sırasında bir hata oluştu" });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: "Geçersiz kullanıcı adı veya şifre" });
      
      req.login(user, (err: Error) => {
        if (err) return next(err);
        // Şifreyi geri döndürmeden önce kaldır
        const userWithoutPassword = { ...user } as any;
        delete userWithoutPassword.password;
        res.json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err: Error) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Oturum açılmamış" });
    
    // Şifreyi geri döndürmeden önce kaldır
    const userWithoutPassword = { ...req.user } as any;
    delete userWithoutPassword.password;
    res.json(userWithoutPassword);
  });
}