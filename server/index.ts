import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { configureSendGrid } from "./notifications";
import { initializeTelegram } from "./telegram";
import { bootstrapUsers, initializeBadgeCatalog, initializeOperationsSchema } from "./bootstrap";

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Bildirim servisi kurulumu 
  console.log("Bildirim servisi yapılandırması başlatılıyor...");
  const emailConfigured = configureSendGrid();
  if (!emailConfigured) {
    console.log("SENDGRID_API_KEY bulunamadı - E-posta bildirimleri devre dışı.");
    console.log("E-posta bildirimi için bir API anahtarı ayarlayın.");
  }
  
  // Telegram Bot servisi başlatma
  console.log("Telegram servisi başlatılıyor...");
  try {
    // Telegram servisini asenkron olarak başlat
    initializeTelegram()
      .then(success => {
        if (success) {
          console.log("Telegram servisi başarıyla başlatıldı.");
        } else {
          console.log("Telegram servisi başlatılamadı, bot token ayarlarını kontrol edin.");
        }
      })
      .catch(err => {
        console.error("Telegram başlatma hatası:", err);
      });
  } catch (error) {
    console.error("Telegram servisi başlatılamadı:", error);
  }

  // Lightweight health check for Render/local monitoring.
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok", service: "hotel-task-management" });
  });

  const server = await registerRoutes(app);

  // Ensure production database has the tables/columns required by the operations modules.
  // This is idempotent and does not remove or rewrite existing data.
  try {
    await initializeOperationsSchema();
  } catch (error) {
    console.error("Bootstrap operations schema kurulumu başarısız:", error);
    throw error;
  }

  // Initialize the badge catalog independently from privileged-user bootstrap.
  // This ensures badges are available even if account bootstrap configuration changes.
  console.log("Bootstrap: invoking badge catalog initialization...");
  try {
    await initializeBadgeCatalog();
  } catch (error) {
    console.error("Bootstrap rozet kataloğu kurulumu başarısız:", error);
    throw error;
  }

  // Create initial privileged users on a fresh deployment.
  // This runs after the schema is available and before the server starts accepting traffic.
  console.log("Bootstrap: invoking privileged-user initialization...");
  try {
    await bootstrapUsers();
  } catch (error) {
    console.error("Bootstrap kullanıcı kurulumu başarısız:", error);
    throw error;
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV !== "production") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Render supplies PORT; local development falls back to 5000.
  const port = Number(process.env.PORT || 5000);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
