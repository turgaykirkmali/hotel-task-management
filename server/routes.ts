import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import crypto from "crypto";
import { 
  insertRequestSchema, 
  insertEmployeeSchema, 
  insertUserSchema,
  insertHotelSchema,
  statusTypes, 
  departments,
  roleTypes,
  users
} from "@shared/schema";
import { setupAuth, hashPassword } from "./auth";
import { WebSocketServer } from "ws";
import { db } from "./db";
import { auditLogs, roomStatuses, slaPolicies, requests as requestsTable } from "@shared/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { notifyNewRequest, notifyStatusUpdate, notifyOverdueRequest } from "./notifications";
import { 
  addTelegramUserMapping, 
  sendTaskAssignmentNotification, 
  getTelegramStatus,
  setRequestUpdateCallback,
  getTelegramBotUsername
} from "./telegram";
import { pool } from "./db";
import { listIntegrations, saveIntegration, sendConfiguredEmail, sendConfiguredSms, sendConfiguredWhatsapp, sendConfiguredInstagram, setConsent, getInventorySnapshot, consumeRecipe, notifyPurchasingAndStorekeepers } from "./enterprise";

async function getSlaMinutes(hotelId: number | null | undefined, department: string, priority = "normal") {
  if (!hotelId) return 30;
  const [policy] = await db.select().from(slaPolicies)
    .where(and(eq(slaPolicies.hotelId, hotelId), eq(slaPolicies.department, department), eq(slaPolicies.priority, priority), eq(slaPolicies.active, true)))
    .limit(1);
  if (policy) return policy.minutes;
  const [fallback] = await db.select().from(slaPolicies)
    .where(and(eq(slaPolicies.hotelId, hotelId), eq(slaPolicies.department, department), eq(slaPolicies.priority, "normal"), eq(slaPolicies.active, true)))
    .limit(1);
  return fallback?.minutes ?? 30;
}

async function writeAudit(hotelId: number | null | undefined, userId: number | null | undefined, requestId: number | null | undefined, action: string, details: Record<string, unknown> = {}, source = "web") {
  try {
    await db.insert(auditLogs).values({
      hotelId: hotelId ?? null,
      userId: userId ?? null,
      requestId: requestId ?? null,
      action,
      details: JSON.stringify(details),
      source,
      entityType: source === 'inventory' ? 'inventory' : 'request'
    });
  } catch (error) {
    console.error("Audit log yazılamadı:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  setupAuth(app);

  // Telegram durumu endpoint
  app.get("/api/telegram-status", (req: Request, res: Response) => {
    try {
      const status = getTelegramStatus();
      res.json({ status });
    } catch (error) {
      console.error("Telegram durumu alınırken hata:", error);
      res.status(500).json({ message: "Telegram durumu alınamadı" });
    }
  });
  
  // Personele özel Telegram bağlantı linki
  app.post("/api/users/:id/telegram-link", async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      const id = parseInt(req.params.id);
      if (!currentUser || !["admin", "superadmin"].includes(currentUser.role)) return res.status(403).json({ message: "Yetkiniz yok" });
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      if (currentUser.role === "admin" && currentUser.hotelId !== target.hotelId) return res.status(403).json({ message: "Bu personel için işlem yapamazsınız" });
      const token = crypto.randomBytes(24).toString("hex");
      await db.update(users).set({ telegramLinkToken: token }).where(eq(users.id, id));
      const botUsername = getTelegramBotUsername() || process.env.TELEGRAM_BOT_USERNAME;
      if (!botUsername) return res.status(503).json({ message: "Telegram bot hazır değil veya bot kullanıcı adı bulunamadı" });
      res.json({ link: `https://t.me/${botUsername}?start=link_${token}` });
    } catch (error) {
      console.error("Telegram link oluşturma hatası:", error);
      res.status(500).json({ message: "Telegram bağlantı linki oluşturulamadı" });
    }
  });

  // Telegram kullanıcı eşleştirme endpoint
  app.post("/api/telegram-connect", async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
        return res.status(403).json({ message: "Bu işlem için yetkiniz bulunmuyor" });
      }
      
      const { userId, chatId, telegramUsername } = req.body;
      
      if (!userId || !chatId || !telegramUsername) {
        return res.status(400).json({ message: "userId, chatId ve telegramUsername parametreleri gereklidir" });
      }
      
      // Kullanıcı-Telegram bağlantısını ekle
      addTelegramUserMapping(parseInt(userId), parseInt(chatId), telegramUsername);
      
      res.json({ message: "Telegram kullanıcı eşleştirmesi başarıyla eklendi" });
    } catch (error) {
      console.error("Telegram kullanıcı eşleştirme hatası:", error);
      res.status(500).json({ message: "Telegram kullanıcı eşleştirmesi eklenemedi" });
    }
  });
  
  // TEST: Telegram bildirim gönderme endpoint (sadece geliştirme için)
  app.post("/api/test-telegram-notification", async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (process.env.NODE_ENV === "production" || !currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
        return res.status(404).json({ message: "Not found" });
      }

      const { telegramUsername, roomNumber, requestDetails, department, requestId } = req.body;
      
      if (!telegramUsername || !roomNumber || !requestDetails || !department) {
        return res.status(400).json({ message: "Eksik parametreler" });
      }
      
      const success = await sendTaskAssignmentNotification(
        telegramUsername,
        roomNumber,
        requestDetails,
        department,
        new Date(Date.now() + 3600000), // Şu andan 1 saat sonra
        requestId ? parseInt(requestId) : undefined
      );
      
      if (success) {
        res.json({ message: "Telegram bildirimi başarıyla gönderildi" });
      } else {
        res.status(500).json({ message: "Telegram bildirimi gönderilemedi" });
      }
    } catch (error) {
      console.error("Telegram test bildirimi gönderilirken hata:", error);
      res.status(500).json({ message: "Telegram test bildirimi gönderilemedi" });
    }
  });
  // GET all requests with optional hotel filter
  app.get("/api/requests", async (req: Request, res: Response) => {
    try {
      const hotelId = req.query.hotelId ? parseInt(req.query.hotelId as string) : undefined;
      
      let requests;
      if (hotelId) {
        requests = await storage.getRequestsByHotelId(hotelId);
      } else {
        // Super admin can see all requests
        const currentUser = req.user;
        if (currentUser && currentUser.role === 'superadmin') {
          requests = await storage.getAllRequests();
        } else if (currentUser && currentUser.hotelId) {
          // Regular users can only see requests from their hotel
          requests = await storage.getRequestsByHotelId(currentUser.hotelId);
        } else {
          requests = [];
        }
      }
      
      res.json(requests);
    } catch (error) {
      console.error("Error fetching requests:", error);
      res.status(500).json({ message: "Error fetching requests" });
    }
  });

  // GET request by ID
  app.get("/api/requests/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      const request = await storage.getRequestById(id);
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }
      
      res.json(request);
    } catch (error) {
      console.error("Error fetching request:", error);
      res.status(500).json({ message: "Error fetching request" });
    }
  });

  // POST create new request
  app.post("/api/requests", async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Oturum açmanız gerekiyor" });
      }

      const validatedData = insertRequestSchema.parse(req.body);
      const department = validatedData.department;
      const priority = (validatedData.priority || req.body.priority || "normal") as string;

      // Hotel is taken from the authenticated user for normal users.
      // Superadmins may create a request for the selected hotel via hotelId.
      let hotelId: number | null = currentUser.hotelId ?? null;
      if (currentUser.role === "superadmin" && req.body.hotelId) {
        const requestedHotelId = Number(req.body.hotelId);
        if (Number.isInteger(requestedHotelId) && requestedHotelId > 0) {
          hotelId = requestedHotelId;
        }
      }
      if (!hotelId) {
        return res.status(400).json({ message: "İstek oluşturmak için otel seçilmelidir" });
      }

      const slaMinutes = await getSlaMinutes(hotelId, department, priority);
      const computedDeadline = new Date(Date.now() + slaMinutes * 60 * 1000);

      // Assignment remains optional. The existing Telegram/web assignment workflow
      // can assign the request afterwards through assignedToId.
      const newRequest = await storage.createRequest({
        ...validatedData,
        hotelId,
        priority,
        deadline: computedDeadline,
        assignedToId: validatedData.assignedToId ?? null,
        createdById: currentUser.id
      });

      await writeAudit(newRequest.hotelId, currentUser.id, newRequest.id, "request_created", {
        department: newRequest.department,
        priority: newRequest.priority,
        slaMinutes
      });

      // Send notification via WebSocket
      if (app.locals.notifyClients && newRequest.hotelId) {
        app.locals.notifyClients({
          type: 'new_request',
          request: newRequest
        }, newRequest.hotelId);

        try {
          await notifyNewRequest(newRequest);
        } catch (emailError) {
          console.error("Email notification error:", emailError);
        }
      }

      res.status(201).json(newRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error creating request:", error);
      res.status(500).json({ message: "Error creating request" });
    }
  });

  // PATCH update request status
  app.patch("/api/requests/:id/status", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      const { status } = req.body;
      
      if (!status || !statusTypes.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      const request = await storage.getRequestById(id);
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }
      
      // Check user permissions based on hotel
      const currentUser = req.user;
      if (currentUser && currentUser.role !== "superadmin" && 
          request.hotelId && currentUser.hotelId !== request.hotelId) {
        return res.status(403).json({ message: "Unauthorized: You don't have permission to update this request" });
      }
      
      // Update status, completedAt, and completedById if status is "tamamlandı"
      const completedAt = status === "tamamlandı" ? new Date() : null;
      const completedById = req.user?.id; // İşlemi tamamlayan kullanıcının bilgisi
      const updatedRequest = await storage.updateRequestStatus(id, status, completedAt, completedById);
      if (status === "işlemde") {
        await db.update(requestsTable).set({ startedAt: new Date() }).where(eq(requestsTable.id, id));
      } else if (status === "tamamlandı") {
        await db.update(requestsTable).set({ startedAt: updatedRequest.startedAt ?? request.createdAt }).where(eq(requestsTable.id, id));
      }
      if (status !== "tamamlandı" && updatedRequest.deadline && new Date() > new Date(updatedRequest.deadline)) {
        await db.update(requestsTable).set({ slaBreachedAt: updatedRequest.slaBreachedAt ?? new Date(), status: "geciken" }).where(eq(requestsTable.id, id));
      }
      await writeAudit(updatedRequest.hotelId, req.user?.id, id, "status_changed", { from: request.status, to: status });
      
      // Send status update notification via WebSocket
      if (app.locals.notifyClients && updatedRequest.hotelId) {
        app.locals.notifyClients({
          type: 'status_update',
          request: updatedRequest
        }, updatedRequest.hotelId);
        
        // Send email notification for status update
        try {
          // Pass the old status for comparison in the notification
          await notifyStatusUpdate(updatedRequest, request.status);
        } catch (emailError) {
          console.error("Email notification error:", emailError);
          // Continue even if email fails
        }
      }
      
      res.json(updatedRequest);
    } catch (error) {
      console.error("Error updating request status:", error);
      res.status(500).json({ message: "Error updating request status" });
    }
  });
  
  // PATCH update request priority
  app.patch("/api/requests/:id/priority", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      const { priority } = req.body;
      
      if (!priority || !["low", "normal", "high"].includes(priority)) {
        return res.status(400).json({ message: "Invalid priority" });
      }
      
      const request = await storage.getRequestById(id);
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }
      
      // Check user permissions based on hotel
      const currentUser = req.user;
      if (currentUser && currentUser.role !== "superadmin" && 
          request.hotelId && currentUser.hotelId !== request.hotelId) {
        return res.status(403).json({ message: "Unauthorized: You don't have permission to update this request" });
      }
      
      const updatedRequest = await storage.updateRequestPriority(id, priority);
      await writeAudit(updatedRequest.hotelId, req.user?.id, id, "priority_changed", { from: request.priority, to: priority });
      
      // Send priority update notification via WebSocket
      if (app.locals.notifyClients && updatedRequest.hotelId) {
        app.locals.notifyClients({
          type: 'priority_update',
          request: updatedRequest
        }, updatedRequest.hotelId);
      }
      
      res.json(updatedRequest);
    } catch (error) {
      console.error("Error updating request priority:", error);
      res.status(500).json({ message: "Error updating request priority" });
    }
  });
  
  // PATCH update request deadline
  app.patch("/api/requests/:id/deadline", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      const { deadline } = req.body;
      if (!deadline) {
        return res.status(400).json({ message: "Deadline is required" });
      }
      
      const deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      
      const request = await storage.getRequestById(id);
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }
      
      // Check user permissions based on hotel
      const currentUser = req.user;
      if (currentUser && currentUser.role !== "superadmin" && 
          request.hotelId && currentUser.hotelId !== request.hotelId) {
        return res.status(403).json({ message: "Unauthorized: You don't have permission to update this request" });
      }
      
      const updatedRequest = await storage.updateRequestDeadline(id, deadlineDate);
      await writeAudit(updatedRequest.hotelId, req.user?.id, id, "deadline_changed", { deadline: deadlineDate.toISOString() });
      
      // Send deadline update notification via WebSocket
      if (app.locals.notifyClients && updatedRequest.hotelId) {
        app.locals.notifyClients({
          type: 'deadline_update',
          request: updatedRequest
        }, updatedRequest.hotelId);
      }
      
      res.json(updatedRequest);
    } catch (error) {
      console.error("Error updating request deadline:", error);
      res.status(500).json({ message: "Error updating request deadline" });
    }
  });
  
  // PATCH assign request to user
  app.patch("/api/requests/:id/assign", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      const { assignedToId } = req.body;
      // assignedToId null olabilir (atanmamış durumuna geri dönmek için)
      
      const request = await storage.getRequestById(id);
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }
      
      // Sadece admin veya superadmin'lerin istek ataması yapabilmesini sağla
      const currentUser = req.user;
      if (!currentUser || 
          (currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
        return res.status(403).json({ message: "Unauthorized: Only admins can assign requests" });
      }
      
      // Otel kontrolü yap
      if (currentUser.role !== "superadmin" && 
          request.hotelId && currentUser.hotelId !== request.hotelId) {
        return res.status(403).json({ message: "Unauthorized: You don't have permission to update this request" });
      }
      
      // Atama işlemi
      const updatedRequest = await storage.assignRequestToUser(id, assignedToId);
      await writeAudit(updatedRequest.hotelId, req.user?.id, id, "assigned", { assignedToId: assignedToId ?? null });
      
      // WebSocket bildirimi gönder
      if (app.locals.notifyClients && updatedRequest.hotelId) {
        app.locals.notifyClients({
          type: 'request_assigned',
          request: updatedRequest
        }, updatedRequest.hotelId);
      }
      
      // Eğer bir kullanıcıya atandıysa
      if (assignedToId) {
        try {
          // Atanan kullanıcının bilgilerini al
          const assignedUser = await storage.getUser(assignedToId);
          
          // Opsiyonel: Kullanıcının telegram adını ayarlamak için otel ayarlarını al
          try {
            const hotel = await storage.getHotelById(request.hotelId);
            let hotelSettings = {};
            if (hotel && hotel.settings) {
              try {
                hotelSettings = JSON.parse(hotel.settings);
              } catch (e) {
                console.error("Otel ayarları analiz edilemedi:", e);
              }
            }
            
            // Kullanıcının Telegram kullanıcı adını göster
            console.log(`Kullanıcı Telegram username: ${assignedUser?.telegramUsername || 'Yok'}`);
            
            // Telegram kullanıcı adı var ise bildirim gönder
            if (assignedUser && assignedUser.telegramUsername) {
              // Telegram kullanıcı adını belirle
              let telegramUsername = assignedUser.telegramUsername;
              
              // @ işareti ile başlamıyorsa ekle
              if (!telegramUsername.startsWith('@')) {
                telegramUsername = '@' + telegramUsername;
              }
              
              console.log(`Talep ataması bildirimi gönderiliyor: ${telegramUsername} kullanıcısına...`);
              
              // Telegram bildirimi gönder (inline butonlarla)
              sendTaskAssignmentNotification(
                telegramUsername,
                updatedRequest.roomNumber,
                updatedRequest.request,
                updatedRequest.department,
                updatedRequest.deadline ? new Date(updatedRequest.deadline) : undefined,
                updatedRequest.id
              ).then(success => {
                if (success) {
                  console.log(`Telegram bildirimi gönderildi: ${assignedUser.firstName} ${assignedUser.lastName}`);
                } else {
                  console.log(`Telegram bildirimi gönderilemedi: ${assignedUser.firstName} ${assignedUser.lastName}`);
                }
              }).catch(err => {
                console.error("Telegram bildirimi gönderilirken hata:", err);
              });
            } else {
              console.log(`Kullanıcının Telegram adı olmadığı için bildirim gönderilemiyor: ${assignedUser?.username}`);
            }
          } catch (e) {
            console.error("Otel ayarları veya Telegram bildirimi gönderilirken hata:", e);
          }
          
          // E-posta bildirimi gönderme lojiği de buraya eklenebilir
        } catch (notificationError) {
          console.error("Görev atama bildirimi gönderilemedi:", notificationError);
          // Bildirim hatası olsa da işleme devam et
        }
      }
      
      res.json(updatedRequest);
    } catch (error) {
      console.error("Error assigning request:", error);
      res.status(500).json({ message: "Error assigning request" });
    }
  });
  
  // GET users by department and hotel
  app.get("/api/hotels/:hotelId/department/:department/users", async (req: Request, res: Response) => {
    try {
      const hotelId = parseInt(req.params.hotelId);
      const { department } = req.params;
      
      if (isNaN(hotelId)) {
        return res.status(400).json({ message: "Invalid hotel ID" });
      }
      
      // İzin kontrolü
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Superadmin tüm otellere erişebilir, admin sadece kendi oteline
      if (currentUser.role !== "superadmin" && currentUser.hotelId !== hotelId) {
        return res.status(403).json({ message: "Unauthorized: You can only access users from your hotel" });
      }
      
      // Belirli departmandaki kullanıcıları getir
      const departmentUsers = await storage.getUsersByHotelId(hotelId)
        .then(users => users.filter(user => user.department === department));
      
      res.json(departmentUsers);
    } catch (error) {
      console.error("Error fetching department users:", error);
      res.status(500).json({ message: "Error fetching department users" });
    }
  });

  // Executive Operations Dashboard
  app.get("/api/operations/executive", async (req: Request, res: Response) => {
    try {
      const u = req.user;
      if (!u) return res.status(401).json({ message: "Unauthorized" });
      const hotelId = u.role === "superadmin" && req.query.hotelId ? parseInt(req.query.hotelId as string) : u.hotelId;
      const rows = hotelId ? await storage.getRequestsByHotelId(hotelId) : await storage.getAllRequests();
      const now = Date.now();
      const active = rows.filter(r => r.status !== "tamamlandı");
      const overdue = active.filter(r => r.deadline && new Date(r.deadline).getTime() < now);
      const completed = rows.filter(r => r.status === "tamamlandı" && r.completedAt);
      const avgMinutes = completed.length ? Math.round(completed.reduce((sum, r) => sum + (new Date(r.completedAt!).getTime() - new Date(r.createdAt).getTime()) / 60000, 0) / completed.length) : 0;
      const eligible = completed.filter(r => r.deadline && r.completedAt);
      const slaSuccess = eligible.length ? Math.round(eligible.filter(r => new Date(r.completedAt!).getTime() <= new Date(r.deadline!).getTime()).length / eligible.length * 100) : 100;
      const dept = departments.map(d => {
        const rs = rows.filter(r => r.department === d);
        const done = rs.filter(r => r.status === "tamamlandı" && r.completedAt);
        const e = done.filter(r => r.deadline);
        return {
          department: d,
          total: rs.length,
          completed: done.length,
          overdue: rs.filter(r => r.status === "geciken" || (r.deadline && r.status !== "tamamlandı" && new Date(r.deadline).getTime() < now)).length,
          slaSuccess: e.length ? Math.round(e.filter(r => new Date(r.completedAt!).getTime() <= new Date(r.deadline!).getTime()).length / e.length * 100) : 100,
          avgMinutes: done.length ? Math.round(done.reduce((sum,r)=>sum+(new Date(r.completedAt!).getTime()-new Date(r.createdAt).getTime())/60000,0)/done.length) : 0
        };
      });
      const people = new Map<number, any>();
      for (const r of rows) {
        if (!r.assignedToId || !r.assignedUser) continue;
        const x = people.get(r.assignedToId) ?? { userId: r.assignedToId, name: `${r.assignedUser.firstName || ""} ${r.assignedUser.lastName || ""}`.trim() || r.assignedUser.username, total: 0, completed: 0, overdue: 0, minutes: 0, slaOk: 0, slaEligible: 0 };
        x.total++;
        if (r.status === "tamamlandı" && r.completedAt) {
          x.completed++;
          x.minutes += (new Date(r.completedAt).getTime() - new Date(r.createdAt).getTime()) / 60000;
          if (r.deadline) {
            x.slaEligible++;
            if (new Date(r.completedAt).getTime() <= new Date(r.deadline).getTime()) x.slaOk++;
          }
        }
        if (r.status === "geciken" || (r.deadline && r.status !== "tamamlandı" && new Date(r.deadline).getTime() < now)) x.overdue++;
        people.set(r.assignedToId, x);
      }
      const staff = Array.from(people.values()).map(x => ({
        ...x,
        completionRate: x.total ? Math.round(x.completed / x.total * 100) : 0,
        slaSuccess: x.slaEligible ? Math.round(x.slaOk / x.slaEligible * 100) : 100,
        avgMinutes: x.completed ? Math.round(x.minutes / x.completed) : 0
      })).sort((a,b) => b.slaSuccess - a.slaSuccess || b.completed - a.completed).slice(0,20);
      res.json({ total: rows.length, active: active.length, completed: completed.length, overdue: overdue.length, avgMinutes, slaSuccess, departments: dept, staff, recentOverdue: overdue.sort((a,b)=>new Date(a.deadline!).getTime()-new Date(b.deadline!).getTime()).slice(0,10) });
    } catch (error) {
      console.error("Executive dashboard error:", error);
      res.status(500).json({ message: "Executive dashboard alınamadı" });
    }
  });

  // Audit Trail
  app.get("/api/audit-logs", async (req: Request, res: Response) => {
    try {
      const u = req.user;
      if (!u) return res.status(401).json({ message: "Unauthorized" });
      const hotelId = u.role === "superadmin" && req.query.hotelId ? parseInt(req.query.hotelId as string) : u.hotelId;
      const rows = hotelId
        ? await db.select().from(auditLogs).where(eq(auditLogs.hotelId, hotelId)).orderBy(desc(auditLogs.createdAt)).limit(200)
        : await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200);
      res.json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Audit log alınamadı" });
    }
  });

  // SLA Policies
  app.get("/api/sla-policies", async (req: Request, res: Response) => {
    try {
      const u = req.user;
      if (!u) return res.status(401).json({ message: "Unauthorized" });
      const hotelId = u.role === "superadmin" && req.query.hotelId ? parseInt(req.query.hotelId as string) : u.hotelId;
      if (!hotelId) return res.json([]);
      res.json(await db.select().from(slaPolicies).where(eq(slaPolicies.hotelId, hotelId)).orderBy(slaPolicies.department));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "SLA politikaları alınamadı" });
    }
  });

  app.post("/api/sla-policies", async (req: Request, res: Response) => {
    try {
      const u = req.user;
      if (!u || (u.role !== "admin" && u.role !== "superadmin")) return res.status(403).json({ message: "Yetkisiz" });
      const hotelId = u.role === "superadmin" && req.body.hotelId ? Number(req.body.hotelId) : u.hotelId;
      const { department, priority = "normal", minutes } = req.body;
      if (!hotelId || !department || !minutes) return res.status(400).json({ message: "Eksik alan" });
      const [row] = await db.insert(slaPolicies).values({ hotelId, department, priority, minutes: Number(minutes), active: true }).returning();
      res.status(201).json(row);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "SLA oluşturulamadı" });
    }
  });

  // Room Operations
  app.get("/api/rooms", async (req: Request, res: Response) => {
    try {
      const u = req.user;
      if (!u) return res.status(401).json({ message: "Unauthorized" });
      const hotelId = u.role === "superadmin" && req.query.hotelId ? parseInt(req.query.hotelId as string) : u.hotelId;
      if (!hotelId) return res.json([]);
      res.json(await db.select().from(roomStatuses).where(eq(roomStatuses.hotelId, hotelId)).orderBy(roomStatuses.roomNumber));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Odalar alınamadı" });
    }
  });

  app.post("/api/rooms", async (req: Request, res: Response) => {
    try {
      const u = req.user;
      if (!u || (u.role !== "admin" && u.role !== "superadmin")) return res.status(403).json({ message: "Yetkisiz" });
      let hotelId = u.hotelId ?? null;
      if (u.role === "superadmin" && req.body.hotelId) {
        const requestedHotelId = Number(req.body.hotelId);
        if (Number.isInteger(requestedHotelId) && requestedHotelId > 0) hotelId = requestedHotelId;
      }
      if (!hotelId || !req.body.roomNumber) return res.status(400).json({ message: "Otel ve oda numarası gerekli" });

      const roomNumber = String(req.body.roomNumber).trim();
      if (!roomNumber) return res.status(400).json({ message: "Oda numarası gerekli" });

      const [duplicate] = await db.select({ id: roomStatuses.id })
        .from(roomStatuses)
        .where(and(eq(roomStatuses.hotelId, hotelId), eq(roomStatuses.roomNumber, roomNumber)))
        .limit(1);
      if (duplicate) return res.status(409).json({ message: "Bu oda zaten kayıtlı" });

      const [row] = await db.insert(roomStatuses).values({
        hotelId,
        roomNumber,
        status: req.body.status || "ready",
        note: req.body.note || null,
        updatedById: u.id
      }).returning();
      await writeAudit(hotelId, u.id, null, "room_created", { roomNumber, status: row.status });
      res.status(201).json(row);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Oda oluşturulamadı" });
    }
  });

  app.patch("/api/rooms/:id", async (req: Request, res: Response) => {
    try {
      const u = req.user;
      if (!u) return res.status(401).json({ message: "Unauthorized" });
      const id = Number(req.params.id);
      const [old] = await db.select().from(roomStatuses).where(eq(roomStatuses.id, id));
      if (!old) return res.status(404).json({ message: "Oda bulunamadı" });
      if (u.role !== "superadmin" && u.hotelId !== old.hotelId) return res.status(403).json({ message: "Yetkisiz" });
      const [row] = await db.update(roomStatuses).set({ status: req.body.status ?? old.status, note: req.body.note ?? old.note, updatedById: u.id, updatedAt: new Date() }).where(eq(roomStatuses.id, id)).returning();
      await writeAudit(row.hotelId, u.id, null, "room_status_changed", { roomNumber: row.roomNumber, status: row.status });
      res.json(row);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Oda güncellenemedi" });
    }
  });

  // GET statistics with hotel filtering
  app.get("/api/statistics", async (req: Request, res: Response) => {
    try {
      // Get current user for permission check
      const currentUser = req.user;
      let requests = [];
      
      if (currentUser) {
        if (currentUser.role === 'superadmin') {
          // Superadmin can see all requests
          const hotelId = req.query.hotelId ? parseInt(req.query.hotelId as string) : undefined;
          requests = hotelId ? 
            await storage.getRequestsByHotelId(hotelId) : 
            await storage.getAllRequests();
        } else if (currentUser.hotelId) {
          // Regular users only see their hotel's requests
          requests = await storage.getRequestsByHotelId(currentUser.hotelId);
        }
      }
      
      const statistics = {
        total: requests.length,
        completed: requests.filter(req => req.status === "tamamlandı").length,
        pending: requests.filter(req => req.status === "beklemede").length,
        inProgress: requests.filter(req => req.status === "işlemde").length,
        expiring: requests.filter(req => {
          if (!req.deadline || req.status === "tamamlandı") return false;
          const now = new Date();
          const deadline = new Date(req.deadline);
          const diff = deadline.getTime() - now.getTime();
          // Requests with less than 1 hour left
          return diff > 0 && diff < 3600000;
        }).length,
        expired: requests.filter(req => {
          if (!req.deadline || req.status === "tamamlandı") return false;
          const now = new Date();
          const deadline = new Date(req.deadline);
          return deadline < now;
        }).length,
      };
      
      res.json(statistics);
    } catch (error) {
      console.error("Error fetching statistics:", error);
      res.status(500).json({ message: "Error fetching statistics" });
    }
  });
  
  // GET employees by department with hotel filtering
  app.get("/api/employees", async (req: Request, res: Response) => {
    try {
      const department = req.query.department as string || "all";
      const currentUser = req.user;
      let hotelId: number | undefined;
      
      // If hotelId is explicitly provided in query params
      if (req.query.hotelId) {
        hotelId = parseInt(req.query.hotelId as string);
      }
      // Otherwise, use the user's hotel ID (unless they're superadmin)
      else if (currentUser && currentUser.role !== 'superadmin' && currentUser.hotelId) {
        hotelId = currentUser.hotelId;
      }
      
      const employees = await storage.getEmployeesByDepartment(department, hotelId);
      res.json(employees);
    } catch (error) {
      console.error("Error fetching employees:", error);
      res.status(500).json({ message: "Error fetching employees" });
    }
  });
  
  // POST create new employee
  app.post("/api/employees", async (req: Request, res: Response) => {
    try {
      // Get current user for permission check
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized: Authentication required" });
      }
      
      // Only allow admin or superadmin to create employees
      if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
        return res.status(403).json({ message: "Unauthorized: Only admins can add employees" });
      }
      
      // Set hotel ID for employee based on current user
      let hotelId = req.body.hotelId;
      
      // If not superadmin, enforce hotelId to match admin's hotel
      if (currentUser.role !== "superadmin" && currentUser.hotelId) {
        hotelId = currentUser.hotelId;
      }
      
      const validatedData = insertEmployeeSchema.parse({
        ...req.body,
        hotelId
      });
      
      if (!departments.includes(validatedData.department as any)) {
        return res.status(400).json({ message: "Invalid department" });
      }
      
      const newEmployee = await storage.createEmployee(validatedData);
      res.status(201).json(newEmployee);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error creating employee:", error);
      res.status(500).json({ message: "Error creating employee" });
    }
  });

  // Hotel Management
  
  // GET all hotels
  app.get("/api/hotels", async (req: Request, res: Response) => {
    try {
      const hotels = await storage.getAllHotels();
      res.json(hotels);
    } catch (error) {
      console.error("Error fetching hotels:", error);
      res.status(500).json({ message: "Error fetching hotels" });
    }
  });

  // GET hotel by ID
  app.get("/api/hotels/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      let hotel = await storage.getHotelById(id);
      
      // Superadmin için otel yoksa otomatik oluştur
      if (!hotel) {
        const currentUser = req.user;
        if (currentUser && currentUser.role === "superadmin") {
          hotel = await storage.createHotel({
            name: "Varsayılan Otel",
            address: "",
            phone: "",
            email: "",
            dbPrefix: `hotel_${id}`,
          });
        } else {
          return res.status(404).json({ message: "Hotel not found" });
        }
      }
      
      res.json(hotel);
    } catch (error) {
      console.error("Error fetching hotel:", error);
      res.status(500).json({ message: "Error fetching hotel" });
    }
  });

  // POST create new hotel
  app.post("/api/hotels", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated and is superadmin
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized: Authentication required" });
      }
      
      if (currentUser.role !== "superadmin") {
        return res.status(403).json({ message: "Unauthorized: Only superadmins can create hotels" });
      }
      
      // Ensure db_prefix is set and unique
      if (!req.body.dbPrefix) {
        // Generate a unique prefix if not provided
        req.body.dbPrefix = `hotel_${Date.now().toString(36)}`;
      }
      
      const validatedData = insertHotelSchema.parse(req.body);
      const newHotel = await storage.createHotel(validatedData);
      
      // Create admin user for this hotel if adminUser data is provided
      if (req.body.adminUser) {
        const adminData = {
          ...req.body.adminUser,
          role: "admin",
          hotelId: newHotel.id
        };
        
        try {
          const adminUser = await storage.createUser(adminData);
          res.status(201).json({ hotel: newHotel, admin: adminUser });
        } catch (adminError) {
          console.error("Error creating hotel admin:", adminError);
          // Return the hotel anyway, but with an error message
          res.status(201).json({ 
            hotel: newHotel, 
            admin: null, 
            warning: "Hotel created but admin user creation failed" 
          });
        }
      } else {
        res.status(201).json(newHotel);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error creating hotel:", error);
      res.status(500).json({ message: "Error creating hotel" });
    }
  });
  
  // PATCH update hotel settings
  app.patch("/api/hotels/:id/settings", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      // Check permissions
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized: Authentication required" });
      }
      
      let hotel = await storage.getHotelById(id);
      
      // Superadmin için otel yoksa otomatik oluştur
      if (!hotel) {
        if (currentUser.role === "superadmin") {
          hotel = await storage.createHotel({
            name: "Varsayılan Otel",
            address: "",
            phone: "",
            email: "",
            dbPrefix: "hotel_1",
          });
        } else {
          return res.status(404).json({ message: "Hotel not found" });
        }
      }
      
      // Only superadmin or hotel admin can update settings
      if (currentUser.role !== "superadmin" && 
          (currentUser.role !== "admin" || currentUser.hotelId !== id)) {
        return res.status(403).json({ message: "Unauthorized: Only hotel admins can update settings" });
      }
      
      // Parse existing settings as JSON
      let settingsObj;
      try {
        settingsObj = JSON.parse(hotel.settings || "{}");
      } catch (e) {
        settingsObj = {};
      }
      
      // Settings can be sent directly in the body or in a settings property
      let newSettingsObj;
      
      if (req.body.settings) {
        // If settings is a string, parse it as JSON
        try {
          if (typeof req.body.settings === 'string') {
            newSettingsObj = JSON.parse(req.body.settings);
          } else {
            newSettingsObj = req.body.settings;
          }
        } catch (e) {
          console.error("Error parsing settings JSON:", e);
          return res.status(400).json({ message: "Invalid settings format. Expected valid JSON." });
        }
      } else {
        // If no settings property, use the entire body
        newSettingsObj = req.body;
      }
      
      console.log("Updating hotel settings:", { 
        hotelId: id, 
        existingSettings: settingsObj, 
        newSettings: newSettingsObj 
      });
      
      // Merge existing settings with new ones
      const mergedSettings = { ...settingsObj, ...newSettingsObj };
      
      // Update settings in database
      const updatedHotel = await storage.updateHotelSettings(id, JSON.stringify(mergedSettings));
      
      res.json(updatedHotel);
    } catch (error) {
      console.error("Error updating hotel settings:", error);
      res.status(500).json({ message: "Error updating hotel settings" });
    }
  });

  // PATCH update hotel (name, address, etc.)
  app.patch("/api/hotels/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      // Kullanıcının yetki kontrolü
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized: Authentication required" });
      }
      
      if (currentUser.role !== "superadmin") {
        return res.status(403).json({ message: "Unauthorized: Only superadmins can update hotels" });
      }
      
      const hotel = await storage.getHotelById(id);
      if (!hotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }
      
      const updatedHotel = await storage.updateHotel(id, req.body);
      res.json(updatedHotel);
    } catch (error) {
      console.error("Error updating hotel:", error);
      res.status(500).json({ message: "Error updating hotel details" });
    }
  });
  
  // DELETE hotel
  app.delete("/api/hotels/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      // Kullanıcının yetki kontrolü
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized: Authentication required" });
      }
      
      if (currentUser.role !== "superadmin") {
        return res.status(403).json({ message: "Unauthorized: Only superadmins can delete hotels" });
      }
      
      const hotel = await storage.getHotelById(id);
      if (!hotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }
      
      const success = await storage.deleteHotel(id);
      
      if (success) {
        res.status(200).json({ message: "Hotel deleted successfully" });
      } else {
        res.status(500).json({ message: "Hotel could not be deleted" });
      }
    } catch (error) {
      console.error("Error deleting hotel:", error);
      res.status(500).json({ message: "Error deleting hotel" });
    }
  });
  
  // GET users by hotel ID
  // GET all users (superadmin only)
  app.get("/api/users", async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });
      if (currentUser.role !== "superadmin") return res.status(403).json({ message: "Forbidden" });
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (error) {
      res.status(500).json({ message: "Error fetching users" });
    }
  });

  app.get("/api/hotels/:id/users", async (req: Request, res: Response) => {
    try {
      const hotelId = parseInt(req.params.id);
      if (isNaN(hotelId)) {
        return res.status(400).json({ message: "Invalid hotel ID format" });
      }
      
      const users = await storage.getUsersByHotelId(hotelId);
      res.json(users);
    } catch (error) {
      console.error("Error fetching hotel users:", error);
      res.status(500).json({ message: "Error fetching hotel users" });
    }
  });

  // Staff Management
  
  // POST create new staff member
  app.post("/api/staff", async (req: Request, res: Response) => {
    try {
      // Get the current user
      const currentUser = req.user;
      console.log("Creating staff, current user:", currentUser?.username, "role:", currentUser?.role);
      
      // Check if user is authenticated and has correct permissions
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized: Authentication required" });
      }

      if (currentUser.role === "superadmin") {
        // Superadmin can add staff to any hotel
        const validatedData = insertUserSchema.parse({
          ...req.body,
          role: "staff",  // Force role to be staff
        });
        
        console.log("Superadmin creating staff for hotel:", validatedData.hotelId);
        const newUser = await storage.createUser(validatedData);
        res.status(201).json(newUser);
      } 
      else if (currentUser.role === "admin") {
        // Admin can only add staff to their own hotel
        const validatedData = insertUserSchema.parse({
          ...req.body,
          role: "staff",  // Force role to be staff
          hotelId: currentUser.hotelId  // Force hotel ID to be the same as admin
        });
        
        console.log("Admin creating staff for their hotel:", currentUser.hotelId);
        const newUser = await storage.createUser(validatedData);
        res.status(201).json(newUser);
      }
      else {
        return res.status(403).json({ message: "Unauthorized: Only admins can add staff" });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error creating staff member:", error);
      res.status(500).json({ message: "Error creating staff member" });
    }
  });
  
  // PATCH update user (for updating roles, departments, etc.)
  app.patch("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      // Get the current user
      const currentUser = req.user;
      
      // Get the user to update
      const userToUpdate = await storage.getUser(id);
      if (!userToUpdate) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Permission hierarchy checks:
      // 1. Superadmin can edit anyone
      // 2. Hotel admin can edit staff in their hotel
      // 3. Users can edit themselves
      const isSuperadmin = currentUser && currentUser.role === "superadmin";
      const isHotelAdmin = currentUser && 
                         currentUser.role === "admin" && 
                         currentUser.hotelId === userToUpdate.hotelId;
      const isSelfEdit = currentUser && currentUser.id === id;
      
      if (!currentUser || (!isSuperadmin && !isHotelAdmin && !isSelfEdit)) {
        return res.status(403).json({ 
          message: "Unauthorized: You don't have permission to update this user" 
        });
      }
      
      // Role change permission checks
      if (req.body.role) {
        // Only superadmin can change someone to superadmin
        if (req.body.role === "superadmin" && !isSuperadmin) {
          return res.status(403).json({ 
            message: "Unauthorized: Only superadmins can create superadmin users" 
          });
        }
        
        // Only superadmin or admin can promote to admin
        if (req.body.role === "admin" && !isSuperadmin && !isHotelAdmin) {
          return res.status(403).json({ 
            message: "Unauthorized: Only admins can promote to admin role" 
          });
        }
        
        // Admins can't demote themselves
        if (isSelfEdit && currentUser.role === "admin" && req.body.role === "staff") {
          return res.status(403).json({ 
            message: "Unauthorized: Admins can't demote themselves" 
          });
        }
      }
      
      // Hotel assignment permission checks
      if (req.body.hotelId && req.body.hotelId !== userToUpdate.hotelId) {
        // Only superadmin can change hotel assignment
        if (!isSuperadmin) {
          return res.status(403).json({ 
            message: "Unauthorized: Only superadmins can change hotel assignment" 
          });
        }
      }
      
      // User settings update
      if (req.body.settings) {
        let settingsObj;
        try {
          // Parse existing settings
          settingsObj = JSON.parse(userToUpdate.settings || "{}");
        } catch (e) {
          settingsObj = {};
        }
        
        // Merge with new settings
        req.body.settings = JSON.stringify({
          ...settingsObj,
          ...JSON.parse(req.body.settings)
        });
      }
      
      // Telegram kullanıcı adı yalnızca profil bilgisi olarak güncellenir.
      // Gerçek chat ID sadece Telegram botundaki doğrulanmış /start veya /connect ile kaydedilir.
      if (req.body.telegramUsername !== undefined) {
        const cleanUsername = String(req.body.telegramUsername || '').replace('@', '').trim().toLowerCase() || null;
        await db.update(users).set({ telegramUsername: cleanUsername }).where(eq(users.id, id));
      }
      
      // Şifre varsa hash'le
      const dataToUpdate = { ...req.body };
      if (dataToUpdate.password && typeof dataToUpdate.password === 'string' && dataToUpdate.password.length > 0) {
        dataToUpdate.password = await hashPassword(dataToUpdate.password);
      }
      
      const updatedData = await storage.updateUser(id, dataToUpdate);
      res.json(updatedData);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Error updating user" });
    }
  });
  
  // DELETE user (superadmin or hotel admin only)
  app.delete("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Geçersiz kullanıcı ID'si" });
      }

      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Oturum açılmamış" });
      }

      const userToDelete = await storage.getUser(id);
      if (!userToDelete) {
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      // Superadmin silinemesin
      if (userToDelete.role === 'superadmin') {
        return res.status(403).json({ message: "Superadmin silinemez" });
      }

      // Kendini silemesin
      if (currentUser.id === id) {
        return res.status(403).json({ message: "Kendinizi silemezsiniz" });
      }

      const isSuperadmin = currentUser.role === 'superadmin';
      const isHotelAdmin = currentUser.role === 'admin' && currentUser.hotelId === userToDelete.hotelId;

      if (!isSuperadmin && !isHotelAdmin) {
        return res.status(403).json({ message: "Bu işlem için yetkiniz yok" });
      }

      await storage.deleteUser(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Kullanıcı silinirken hata oluştu" });
    }
  });

  // PATCH update user settings (for theme, notifications, etc)
  app.patch("/api/users/:id/settings", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      // Get the current user
      const currentUser = req.user;
      
      // Users can only update their own settings
      if (!currentUser || currentUser.id !== id) {
        return res.status(403).json({ 
          message: "Unauthorized: You can only update your own settings" 
        });
      }
      
      // Get current user to grab existing settings
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Parse existing settings
      let settings = {};
      try {
        settings = JSON.parse(user.settings || "{}");
      } catch (e) {
        // If parsing fails, start with empty object
      }
      
      // Update settings
      const newSettings = { ...settings, ...req.body };
      const updatedUser = await storage.updateUserSettings(id, JSON.stringify(newSettings));
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user settings:", error);
      res.status(500).json({ message: "Error updating user settings" });
    }
  });
  
  // ------------ Rozet (Badge) Yönetimi API Noktaları ------------
  
  // Tüm rozetleri getir
  app.get("/api/badges", async (req: Request, res: Response) => {
    try {
      const badges = await storage.getAllBadges();
      res.json(badges);
    } catch (error) {
      console.error("Error fetching badges:", error);
      res.status(500).json({ message: "Error fetching badges" });
    }
  });
  
  // Belirli türdeki rozetleri getir
  app.get("/api/badges/type/:type", async (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      const badges = await storage.getBadgesByType(type);
      res.json(badges);
    } catch (error) {
      console.error("Error fetching badges by type:", error);
      res.status(500).json({ message: "Error fetching badges by type" });
    }
  });
  
  // ID'ye göre rozet getir
  app.get("/api/badges/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      const badge = await storage.getBadgeById(id);
      if (!badge) {
        return res.status(404).json({ message: "Badge not found" });
      }
      
      res.json(badge);
    } catch (error) {
      console.error("Error fetching badge:", error);
      res.status(500).json({ message: "Error fetching badge" });
    }
  });
  
  // Yeni rozet oluştur
  app.post("/api/badges", async (req: Request, res: Response) => {
    try {
      // Sadece superadmin ve admin rolündeki kullanıcılar rozet oluşturabilir
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized: Authentication required" });
      }
      
      if (currentUser.role !== "superadmin" && currentUser.role !== "admin") {
        return res.status(403).json({ message: "Unauthorized: Insufficient permissions" });
      }
      
      const newBadge = await storage.createBadge(req.body);
      res.status(201).json(newBadge);
    } catch (error) {
      console.error("Error creating badge:", error);
      res.status(500).json({ message: "Error creating badge" });
    }
  });
  
  // Kullanıcıya ait rozetleri getir
  app.get("/api/users/:userId/badges", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID format" });
      }
      
      // Kullanıcı erişim kontrolü
      const currentUser = req.user;
      const requestedUser = await storage.getUser(userId);
      
      if (!requestedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (currentUser && currentUser.role !== "superadmin" && 
          currentUser.id !== userId && 
          currentUser.hotelId !== requestedUser.hotelId) {
        return res.status(403).json({ message: "Unauthorized: You don't have permission to view this user's badges" });
      }
      
      const userBadges = await storage.getUserBadges(userId);
      res.json(userBadges);
    } catch (error) {
      console.error("Error fetching user badges:", error);
      res.status(500).json({ message: "Error fetching user badges" });
    }
  });
  
  // Kullanıcıya rozet ata
  app.post("/api/users/:userId/badges", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID format" });
      }
      
      // Sadece yönetici roller rozet atayabilir
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized: Authentication required" });
      }
      
      if (currentUser.role !== "superadmin" && currentUser.role !== "admin") {
        return res.status(403).json({ message: "Unauthorized: Insufficient permissions" });
      }
      
      const { badgeId, progress = 0 } = req.body;
      if (!badgeId) {
        return res.status(400).json({ message: "Badge ID is required" });
      }
      
      const userBadge = await storage.assignBadgeToUser({ userId, badgeId, progress });
      res.status(201).json(userBadge);
    } catch (error) {
      console.error("Error assigning badge to user:", error);
      res.status(500).json({ message: "Error assigning badge to user" });
    }
  });
  
  // Kullanıcının rozet ilerlemesini güncelle
  app.put("/api/users/:userId/badges/:badgeId/progress", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const badgeId = parseInt(req.params.badgeId);
      
      if (isNaN(userId) || isNaN(badgeId)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      const { progress } = req.body;
      if (progress === undefined) {
        return res.status(400).json({ message: "Progress value is required" });
      }
      
      // Sadece yönetici roller rozet ilerlemesini güncelleyebilir
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized: Authentication required" });
      }
      
      if (currentUser.role !== "superadmin" && currentUser.role !== "admin") {
        return res.status(403).json({ message: "Unauthorized: Insufficient permissions" });
      }
      
      const updatedBadge = await storage.updateUserBadgeProgress(userId, badgeId, progress);
      res.json(updatedBadge);
    } catch (error) {
      console.error("Error updating badge progress:", error);
      res.status(500).json({ message: "Error updating badge progress" });
    }
  });
  
  // Kullanıcının rozet uygunluğunu kontrol et
  app.post("/api/users/:userId/badges/check-eligibility", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID format" });
      }
      
      // Erişim kontrolü
      const currentUser = req.user;
      const requestedUser = await storage.getUser(userId);
      
      if (!requestedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (currentUser && currentUser.role !== "superadmin" && 
          currentUser.id !== userId && 
          currentUser.hotelId !== requestedUser.hotelId) {
        return res.status(403).json({ message: "Unauthorized: You don't have permission to check this user's badge eligibility" });
      }
      
      await storage.checkBadgeEligibility(userId);
      
      // Güncellenmiş rozetleri döndür
      const updatedBadges = await storage.getUserBadges(userId);
      res.json(updatedBadges);
    } catch (error) {
      console.error("Error checking badge eligibility:", error);
      res.status(500).json({ message: "Error checking badge eligibility" });
    }
  });

  // ------------ Duygu Durum Panosu (Mood Board) API Noktaları ------------
  
  // Duygu durumu girişi oluştur
  app.post("/api/mood-entries", async (req: Request, res: Response) => {
    try {
      const { userId, hotelId, mood, comment, date } = req.body;
      
      // Kullanıcı ve otel ID'leri kontrol et
      if (!userId || !hotelId || !mood || !date) {
        return res.status(400).json({ message: "Kullanıcı, otel, duygu durumu ve tarih zorunludur" });
      }
      
      // Tarih formatını düzelt
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "Geçersiz tarih formatı" });
      }
      
      // Tarih değerini yalnızca yıl, ay ve gün olacak şekilde düzeltme (saat bilgisi olmadan)
      const formattedDate = new Date(parsedDate.toISOString().split('T')[0]);
      
      // Aynı gün için zaten bir giriş var mı kontrol et
      const existingEntry = await storage.getUserMoodByDate(userId, formattedDate);
      if (existingEntry) {
        return res.status(400).json({ message: "Bugün için zaten bir duygu durumu kaydınız bulunmaktadır" });
      }
      
      // Yeni giriş oluştur
      const moodEntry = await storage.createMoodEntry({
        userId,
        hotelId,
        mood,
        comment,
        date: formattedDate
      });
      
      res.status(201).json(moodEntry);
    } catch (error) {
      console.error("Error creating mood entry:", error);
      res.status(500).json({ message: "Duygu durumu kaydedilirken bir hata oluştu" });
    }
  });
  
  // Kullanıcının duygu durumu geçmişini getir
  app.get("/api/users/:userId/mood-entries", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Geçersiz kullanıcı ID" });
      }
      
      // Erişim kontrolü
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Yetkilendirme gerekli" });
      }
      
      // Sadece kendi veya aynı oteldeki adminler erişebilir
      if (currentUser.id !== userId && 
          currentUser.role !== "superadmin" && 
          currentUser.role !== "admin") {
        return res.status(403).json({ message: "Bu kullanıcının duygu durumu geçmişine erişim yetkiniz yok" });
      }
      
      const entries = await storage.getUserMoodEntries(userId);
      res.status(200).json(entries);
    } catch (error) {
      console.error("Error fetching user mood entries:", error);
      res.status(500).json({ message: "Duygu durumu geçmişi alınırken bir hata oluştu" });
    }
  });
  
  // Kullanıcının belirli bir tarihteki duygu durumunu getir
  app.get("/api/users/:userId/mood-entries/:date", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const date = new Date(req.params.date);
      
      if (isNaN(userId) || isNaN(date.getTime())) {
        return res.status(400).json({ message: "Geçersiz kullanıcı ID veya tarih" });
      }
      
      // Erişim kontrolü
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Yetkilendirme gerekli" });
      }
      
      // Sadece kendi veya aynı oteldeki adminler erişebilir
      if (currentUser.id !== userId && 
          currentUser.role !== "superadmin" && 
          currentUser.role !== "admin") {
        return res.status(403).json({ message: "Bu kullanıcının duygu durumu bilgisine erişim yetkiniz yok" });
      }
      
      const entry = await storage.getUserMoodByDate(userId, date);
      
      if (!entry) {
        return res.status(404).json({ message: "Bu tarih için duygu durumu kaydı bulunamadı" });
      }
      
      res.status(200).json(entry);
    } catch (error) {
      console.error("Error fetching user mood entry for date:", error);
      res.status(500).json({ message: "Duygu durumu bilgisi alınırken bir hata oluştu" });
    }
  });
  
  // Bir otel için tüm duygu durumu girdilerini getir
  app.get("/api/hotels/:hotelId/mood-entries", async (req: Request, res: Response) => {
    try {
      const hotelId = parseInt(req.params.hotelId);
      
      if (isNaN(hotelId)) {
        return res.status(400).json({ message: "Geçersiz otel ID" });
      }
      
      // Erişim kontrolü - sadece adminler ve superadminler erişebilir
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Yetkilendirme gerekli" });
      }
      
      if (currentUser.role !== "superadmin" && 
          (currentUser.role !== "admin" || currentUser.hotelId !== hotelId)) {
        return res.status(403).json({ message: "Bu otelin duygu durumu kayıtlarına erişim yetkiniz yok" });
      }
      
      const entries = await storage.getHotelMoodEntries(hotelId);
      res.status(200).json(entries);
    } catch (error) {
      console.error("Error fetching hotel mood entries:", error);
      res.status(500).json({ message: "Otel duygu durumu kayıtları alınırken bir hata oluştu" });
    }
  });
  
  // Bir otel için duygu durumu istatistiklerini getir
  app.get("/api/hotels/:hotelId/mood-stats", async (req: Request, res: Response) => {
    try {
      const hotelId = parseInt(req.params.hotelId);
      let startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      let endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      console.log("Mood stats endpoint called with:", {
        hotelId,
        startDateParam: req.query.startDate,
        endDateParam: req.query.endDate, 
        startDate: startDate ? startDate.toISOString() : undefined,
        endDate: endDate ? endDate.toISOString() : undefined
      });
      
      if (isNaN(hotelId)) {
        return res.status(400).json({ message: "Geçersiz otel ID" });
      }
      
      // Erişim kontrolü - sadece adminler ve superadminler erişebilir
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Yetkilendirme gerekli" });
      }
      
      if (currentUser.role !== "superadmin" && 
          (currentUser.role !== "admin" || currentUser.hotelId !== hotelId)) {
        return res.status(403).json({ message: "Bu otelin duygu durumu istatistiklerine erişim yetkiniz yok" });
      }
      
      const stats = await storage.getMoodStatsByHotelId(hotelId, startDate, endDate);
      console.log("Mood stats result:", stats);
      res.status(200).json(stats);
    } catch (error) {
      console.error("Error fetching hotel mood statistics:", error);
      res.status(500).json({ message: "Duygu durumu istatistikleri alınırken bir hata oluştu" });
    }
  });

  const httpServer = createServer(app);
  
  // Setup WebSocket server for real-time notifications
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // WebSocket connection handling
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connection',
      message: 'Connected to hotel request system'
    }));
    
    // Handle messages from clients
    ws.on('message', (message) => {
      try {
        // Parse message from client
        const data = JSON.parse(message.toString());
        console.log('Received message:', data);
        
        // Handle authentication message
        if (data.type === 'auth') {
          // Store user info and hotel ID in WebSocket connection object
          (ws as any).hotelId = data.hotelId;
          (ws as any).userId = data.userId;
          (ws as any).role = data.role;
          console.log(`User authenticated: ${data.userId}, Hotel: ${data.hotelId}, Role: ${data.role}`);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
    });
  });
  
  // Create a broadcast function that can be used in API endpoints
  // Add it to the app object so it's accessible everywhere
  app.locals.notifyClients = (data: any, hotelId?: number) => {
    wss.clients.forEach((client) => {
      // Only send to clients that are connected
      if (client.readyState === 1) { // WebSocket.OPEN is 1
        // If hotelId is specified, only send to clients from that hotel
        // or superadmins (who should get all notifications)
        if (!hotelId || 
            (client as any).hotelId === hotelId || 
            (client as any).role === 'superadmin') {
          client.send(JSON.stringify(data));
        }
      }
    });
  };

  // Telegram buton aksiyonları DB güncellediğinde WebSocket ile frontend'i bildir
  setRequestUpdateCallback(async (requestId: number, hotelId: number) => {
    try {
      const updatedRequest = await storage.getRequestById(requestId);
      if (updatedRequest) {
        app.locals.notifyClients({
          type: 'request_update',
          request: updatedRequest
        }, hotelId);
        console.log(`[WebSocket] Telegram aksiyonu sonrası talep #${requestId} güncellendi.`);
      }
    } catch (err) {
      console.error('[WebSocket] Telegram callback broadcast hatası:', err);
    }
  });
  
  // Periodically check for delayed requests (every 1 minute)
  setInterval(async () => {
    try {
      const allRequests = await storage.getAllRequests();
      const now = new Date();
      
      // Process each request for its hotel's timeout setting
      for (const req of allRequests) {
        // Skip if not in waiting or processing status
        if (req.status !== "beklemede" && req.status !== "işlemde") continue;
        
        // Get hotel settings for timeout configuration
        let timeoutMinutes = 30; // Default 30 minutes if no settings found
        
        // Try to get the custom timeout from the hotel settings
        if (req.hotelId) {
          const hotel = await storage.getHotelById(req.hotelId);
          if (hotel && hotel.settings) {
            try {
              const hotelSettings = JSON.parse(hotel.settings);
              if (hotelSettings.departmentTimeout) {
                timeoutMinutes = parseInt(hotelSettings.departmentTimeout);
              }
            } catch (e) {
              console.error(`Error parsing hotel settings for hotel ${req.hotelId}:`, e);
            }
          }
        }
        
        // Calculate if the request is older than the configured timeout
        const timeoutAgo = new Date(now.getTime() - timeoutMinutes * 60 * 1000);
        const createdAt = new Date(req.createdAt);
        
        // If request is delayed and not already marked as delayed
        // Check if request should be marked as delayed
        if (createdAt < timeoutAgo) {
          await storage.updateRequestStatus(req.id, "geciken", null);
          
          // Send notification about delayed request
          app.locals.notifyClients({
            type: 'delayed-request',
            requestId: req.id,
            prevStatus: req.status,
            newStatus: "geciken",
            timestamp: now,
            timeoutMinutes: timeoutMinutes  // Include the timeout that was used
          }, req.hotelId);
          
          console.log(`Request #${req.id} marked as delayed after ${timeoutMinutes} minutes of waiting`);
        }
      }
    } catch (error) {
      console.error('Error checking for delayed requests:', error);
    }
  }, 60000); // Check every minute
  

  // =============================================================
  // ENTERPRISE: INTEGRATIONS / REVIEW TRACKER / INVENTORY / RECIPES
  // =============================================================
  const resolveHotelId = (req: Request) => {
    const requested = Number(req.body?.hotelId || req.query?.hotelId || 0);
    if (req.user?.role === 'superadmin' && requested > 0) return requested;
    return Number(req.user?.hotelId || requested || 0);
  };
  const requireHotelAccess = (req: Request, res: Response, hotelId: number) => {
    if (!req.user) { res.status(401).json({message:'Oturum gerekli'}); return false; }
    if (req.user.role !== 'superadmin' && req.user.hotelId !== hotelId) { res.status(403).json({message:'Bu otele erişim yetkiniz yok'}); return false; }
    return true;
  };

  // Integration settings
  app.get('/api/integrations', async (req,res)=>{
    try { const hotelId=resolveHotelId(req); if(!requireHotelAccess(req,res,hotelId)) return; res.json(await listIntegrations(hotelId)); }
    catch(e:any){res.status(500).json({message:e.message});}
  });
  app.put('/api/integrations/:channel', async (req,res)=>{
    try { const hotelId=resolveHotelId(req); if(!requireHotelAccess(req,res,hotelId)) return; const allowed=['email','sms','whatsapp','instagram','telegram']; if(!allowed.includes(req.params.channel)) return res.status(400).json({message:'Geçersiz kanal'}); const result=await saveIntegration(hotelId,req.params.channel,Boolean(req.body.enabled),req.body.settings||{}); res.json(result); }
    catch(e:any){res.status(500).json({message:e.message});}
  });
  app.post('/api/integrations/test', async (req,res)=>{
    try {
      const hotelId=resolveHotelId(req); if(!requireHotelAccess(req,res,hotelId)) return;
      const {channel,to,message='Hotel Operations test mesajı'}=req.body;
      if(channel==='email') return res.json(await sendConfiguredEmail(hotelId,to,'Hotel Operations Test',`<p>${message}</p>`,req.user?.id));
      if(channel==='sms') return res.json(await sendConfiguredSms(hotelId,to,message,req.user?.id));
      if(channel==='whatsapp') return res.json(await sendConfiguredWhatsapp(hotelId,to,message,req.user?.id));
      if(channel==='instagram') return res.json(await sendConfiguredInstagram(hotelId,to,message,req.user?.id));
      return res.status(400).json({message:'Desteklenmeyen kanal'});
    } catch(e:any){res.status(500).json({message:e.message});}
  });
  app.post('/api/integrations/consent', async(req,res)=>{ try {const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;await setConsent(hotelId,String(req.body.contact),String(req.body.channel),Boolean(req.body.optedIn),req.body.source||'manual');res.json({ok:true});}catch(e:any){res.status(500).json({message:e.message});}});
  app.post('/api/integrations/send', async(req,res)=>{ try {const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return; const {channel,to,subject,message,html}=req.body; let result; if(channel==='email') result=await sendConfiguredEmail(hotelId,to,subject||'Hotel Operations',html||`<p>${message}</p>`,req.user?.id); else if(channel==='sms') result=await sendConfiguredSms(hotelId,to,message,req.user?.id); else if(channel==='whatsapp') result=await sendConfiguredWhatsapp(hotelId,to,message,req.user?.id); else if(channel==='instagram') result=await sendConfiguredInstagram(hotelId,to,message,req.user?.id); else return res.status(400).json({message:'Kanal desteklenmiyor'}); res.json(result);}catch(e:any){res.status(500).json({message:e.message});}});

  // Instagram webhook for Meta verification and inbound auto-replies
  app.get('/api/integrations/instagram/webhook', async(req,res)=>{ const mode=req.query['hub.mode']; const token=req.query['hub.verify_token']; const challenge=req.query['hub.challenge']; const hotelId=Number(req.query.hotelId||0); if(mode==='subscribe'&&token&&hotelId){ const cfg=await (await import('./enterprise')).getIntegration(hotelId,'instagram'); if(cfg?.settings?.verifyToken===token) return res.status(200).send(challenge); } res.sendStatus(403); });
  app.post('/api/integrations/instagram/webhook', async(req,res)=>{ res.sendStatus(200); try { const body=req.body; const entries=body?.entry||[]; for(const entry of entries){ for(const messaging of entry.messaging||[]){ const sender=messaging?.sender?.id; const text=messaging?.message?.text; const hotelId=Number(req.query.hotelId||entry?.id||0); if(sender&&text&&hotelId){ const cfg=await (await import('./enterprise')).getIntegration(hotelId,'instagram'); if(cfg?.settings?.autoReplyEnabled && cfg.settings.autoReplyMessage) await sendConfiguredInstagram(hotelId,sender,cfg.settings.autoReplyMessage); } } } } catch(e){console.error('Instagram webhook error',e);} });

  // Review Tracker
  app.get('/api/reviews', async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const from=req.query.from||'1970-01-01';const to=req.query.to||'2999-12-31';const {rows}=await pool.query(`SELECT * FROM reviews WHERE hotel_id=$1 AND review_date::date BETWEEN $2::date AND $3::date ORDER BY review_date DESC`,[hotelId,from,to]);res.json(rows);}catch(e:any){res.status(500).json({message:e.message});}});
  app.post('/api/reviews', async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const r=req.body;const score=Number(r.score);if(!(score>=0&&score<=10))return res.status(400).json({message:'Review score 0-10 aralığında olmalı'});const {rows}=await pool.query(`INSERT INTO reviews(hotel_id,source,external_id,guest_name,score,nps_score,comment,stay_date,review_date,response_status,sentiment,department) VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,NOW()),$10,$11,$12) ON CONFLICT(hotel_id,source,external_id) DO UPDATE SET score=EXCLUDED.score,comment=EXCLUDED.comment,response_status=EXCLUDED.response_status RETURNING *`,[hotelId,r.source||'manual',r.externalId||null,r.guestName||null,score,r.npsScore===undefined?score:Number(r.npsScore),r.comment||null,r.stayDate||null,r.reviewDate||null,r.responseStatus||'unresponded',r.sentiment||null,r.department||null]);res.status(201).json(rows[0]);}catch(e:any){res.status(500).json({message:e.message});}});
  app.get('/api/reviews/stats', async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const {rows}=await pool.query(`SELECT COUNT(*)::int AS total,COALESCE(AVG(score),0)::numeric(10,2) AS avg_score,COUNT(*) FILTER(WHERE nps_score>=9)::int AS promoters,COUNT(*) FILTER(WHERE nps_score BETWEEN 7 AND 8)::int AS passives,COUNT(*) FILTER(WHERE nps_score<=6)::int AS detractors,COUNT(*) FILTER(WHERE response_status='responded')::int AS responded FROM reviews WHERE hotel_id=$1`,[hotelId]);const x=rows[0];const total=Number(x.total);const nps=total?Math.round((Number(x.promoters)-Number(x.detractors))/total*100):0;const performance=Math.max(0,Math.min(100,Math.round((Number(x.avg_score)/10)*70+((nps+100)/200)*30)));const bySource=(await pool.query(`SELECT source,COUNT(*)::int total,ROUND(AVG(score),2) avg_score FROM reviews WHERE hotel_id=$1 GROUP BY source ORDER BY total DESC`,[hotelId])).rows;const monthly=(await pool.query(`SELECT TO_CHAR(date_trunc('month',review_date),'YYYY-MM') month,COUNT(*)::int total,ROUND(AVG(score),2) avg_score FROM reviews WHERE hotel_id=$1 GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,[hotelId])).rows;res.json({total,avgScore:Number(x.avg_score),nps,promoters:Number(x.promoters),passives:Number(x.passives),detractors:Number(x.detractors),responseRate:total?Math.round(Number(x.responded)/total*100):0,performanceScore:performance,bySource,monthly});}catch(e:any){res.status(500).json({message:e.message});}});
  app.patch('/api/reviews/:id', async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const {rows}=await pool.query(`UPDATE reviews SET response_status=COALESCE($1,response_status),sentiment=COALESCE($2,sentiment),department=COALESCE($3,department) WHERE id=$4 AND hotel_id=$5 RETURNING *`,[req.body.responseStatus,req.body.sentiment,req.body.department,req.params.id,hotelId]);res.json(rows[0]);}catch(e:any){res.status(500).json({message:e.message});}});

  // Inventory / Materials Control-inspired stock management
  app.get('/api/inventory/items',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;res.json((await pool.query(`SELECT i.*,s.name preferred_store_name FROM inventory_items i LEFT JOIN inventory_stores s ON s.id=i.preferred_store_id WHERE i.hotel_id=$1 ORDER BY i.active DESC,i.name`,[hotelId])).rows);}catch(e:any){res.status(500).json({message:e.message});}});
  app.post('/api/inventory/items',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const {sku,name,category,inventoryGroup,barcode,unit='adet',minStock=0,parStock=0,cost=0,preferredStoreId}=req.body;if(!sku||!name)return res.status(400).json({message:'SKU ve malzeme adı zorunludur'});const {rows}=await pool.query(`INSERT INTO inventory_items(hotel_id,sku,name,category,inventory_group,barcode,unit,min_stock,par_stock,cost,preferred_store_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[hotelId,sku,name,category||null,inventoryGroup||null,barcode||null,unit,minStock,parStock,cost,preferredStoreId||null]);await writeAudit(hotelId,req.user?.id,null,'inventory_item_created',{itemId:rows[0].id,sku,name,unit},'inventory');res.status(201).json(rows[0]);}catch(e:any){res.status(500).json({message:e.message});}});
  app.patch('/api/inventory/items/:id',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const {rows}=await pool.query(`UPDATE inventory_items SET name=COALESCE($1,name),category=COALESCE($2,category),inventory_group=COALESCE($3,inventory_group),barcode=COALESCE($4,barcode),unit=COALESCE($5,unit),min_stock=COALESCE($6,min_stock),par_stock=COALESCE($7,par_stock),cost=COALESCE($8,cost),preferred_store_id=COALESCE($9,preferred_store_id),active=COALESCE($10,active) WHERE id=$11 AND hotel_id=$12 RETURNING *`,[req.body.name,req.body.category,req.body.inventoryGroup,req.body.barcode,req.body.unit,req.body.minStock,req.body.parStock,req.body.cost,req.body.preferredStoreId,req.body.active,req.params.id,hotelId]);if(!rows[0])return res.status(404).json({message:'Malzeme bulunamadı'});await writeAudit(hotelId,req.user?.id,null,'inventory_item_updated',{itemId:req.params.id,changes:req.body},'inventory');res.json(rows[0]);}catch(e:any){res.status(500).json({message:e.message});}});
  app.delete('/api/inventory/items/:id',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;await pool.query(`UPDATE inventory_items SET active=false WHERE id=$1 AND hotel_id=$2`,[req.params.id,hotelId]);await writeAudit(hotelId,req.user?.id,null,'inventory_item_deleted',{itemId:req.params.id},'inventory');res.json({ok:true});}catch(e:any){res.status(500).json({message:e.message});}});
  app.get('/api/inventory/stores',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;res.json((await pool.query(`SELECT s.*,u.first_name,u.last_name,u.username FROM inventory_stores s LEFT JOIN users u ON u.id=s.storekeeper_user_id WHERE s.hotel_id=$1 ORDER BY CASE s.code WHEN 'ANA' THEN 1 WHEN 'FB' THEN 2 WHEN 'MUTFAK' THEN 3 WHEN 'FO' THEN 4 ELSE 5 END,s.name`,[hotelId])).rows);}catch(e:any){res.status(500).json({message:e.message});}});
  app.post('/api/inventory/stores',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const {rows}=await pool.query(`INSERT INTO inventory_stores(hotel_id,name,code,storekeeper_user_id) VALUES($1,$2,$3,$4) RETURNING *`,[hotelId,req.body.name,req.body.code,req.body.storekeeperUserId||null]);await writeAudit(hotelId,req.user?.id,null,'inventory_store_created',{storeId:rows[0].id,name:req.body.name,code:req.body.code},'inventory');res.status(201).json(rows[0]);}catch(e:any){res.status(500).json({message:e.message});}});
  app.get('/api/inventory/stock',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;res.json(await getInventorySnapshot(hotelId,req.query.storeId?Number(req.query.storeId):undefined));}catch(e:any){res.status(500).json({message:e.message});}});
  app.get('/api/inventory/transactions',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;res.json((await pool.query(`SELECT t.*,i.sku,i.name,i.unit,s.name store_name,ds.name destination_store_name,u.username,COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),' '),u.username) user_display FROM stock_transactions t JOIN inventory_items i ON i.id=t.item_id JOIN inventory_stores s ON s.id=t.store_id LEFT JOIN inventory_stores ds ON ds.id=t.destination_store_id LEFT JOIN users u ON u.id=t.user_id WHERE t.hotel_id=$1 ORDER BY t.created_at DESC LIMIT 1000`,[hotelId])).rows);}catch(e:any){res.status(500).json({message:e.message});}});
  app.post('/api/inventory/transactions',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const q=Math.abs(Number(req.body.quantity));if(!q||q<=0)return res.status(400).json({message:'Geçerli bir miktar girilmelidir'});const type=String(req.body.type);const storeId=Number(req.body.storeId);const targetStoreId=req.body.targetStoreId?Number(req.body.targetStoreId):null;const itemId=Number(req.body.itemId);if(!storeId||!itemId)return res.status(400).json({message:'Depo ve malzeme seçilmelidir'});const client=await pool.connect();try{await client.query('BEGIN');const item=(await client.query(`SELECT * FROM inventory_items WHERE id=$1 AND hotel_id=$2 AND active=true`,[itemId,hotelId])).rows[0];if(!item)throw new Error('Malzeme bulunamadı');const doc=`ST-${Date.now().toString(36).toUpperCase()}`;if(type==='transfer_out'||(targetStoreId&&targetStoreId!==storeId)){if(!targetStoreId||targetStoreId===storeId)throw new Error('Transfer için hedef depo seçilmelidir');const balance=Number((await client.query(`SELECT COALESCE(SUM(quantity),0) stock FROM stock_transactions WHERE hotel_id=$1 AND store_id=$2 AND item_id=$3`,[hotelId,storeId,itemId])).rows[0].stock);if(balance<q)throw new Error(`Yetersiz stok. Mevcut: ${balance} ${item.unit}`);await client.query(`INSERT INTO stock_transactions(hotel_id,store_id,destination_store_id,item_id,type,quantity,unit_cost,reference_type,note,user_id,document_no) VALUES($1,$2,$3,$4,'transfer_out',$5,$6,'transfer',$7,$8,$9)`,[hotelId,storeId,targetStoreId,itemId,-q,item.cost,req.body.note||'Depo transferi',req.user?.id||null,doc]);await client.query(`INSERT INTO stock_transactions(hotel_id,store_id,destination_store_id,item_id,type,quantity,unit_cost,reference_type,note,user_id,document_no) VALUES($1,$2,$3,$4,'transfer_in',$5,$6,'transfer',$7,$8,$9)`,[hotelId,targetStoreId,storeId,itemId,q,item.cost,req.body.note||'Depo transferi',req.user?.id||null,doc]);}else{const sign=['issue','recipe_consumption','waste'].includes(type)?-1:1;if(sign<0){const balance=Number((await client.query(`SELECT COALESCE(SUM(quantity),0) stock FROM stock_transactions WHERE hotel_id=$1 AND store_id=$2 AND item_id=$3`,[hotelId,storeId,itemId])).rows[0].stock);if(balance<q)throw new Error(`Yetersiz stok. Mevcut: ${balance} ${item.unit}`);}await client.query(`INSERT INTO stock_transactions(hotel_id,store_id,item_id,type,quantity,unit_cost,reference_type,reference_id,note,user_id,document_no) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[hotelId,storeId,itemId,type,q*sign,req.body.unitCost||item.cost,req.body.referenceType||'manual',req.body.referenceId||null,req.body.note||null,req.user?.id||null,doc]);}await client.query('COMMIT');await writeAudit(hotelId,req.user?.id,null,'stock_transaction_created',{itemId,storeId,targetStoreId,type,quantity:q,documentNo:doc},'inventory');res.status(201).json({ok:true,documentNo:doc});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}catch(e:any){res.status(400).json({message:e.message});}});
  app.get('/api/inventory/reports',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const stock=await getInventorySnapshot(hotelId);const low=stock.filter((x:any)=>Number(x.stock)<Number(x.min_stock));const value=stock.reduce((s:any,x:any)=>s+Number(x.stock)*Number(x.cost),0);const byStore=(await pool.query(`SELECT s.id store_id,s.name store_name,COUNT(DISTINCT i.id)::int item_count,COALESCE(SUM(t.quantity*i.cost),0)::numeric stock_value FROM inventory_stores s LEFT JOIN stock_transactions t ON t.store_id=s.id LEFT JOIN inventory_items i ON i.id=t.item_id AND i.active=true WHERE s.hotel_id=$1 GROUP BY s.id,s.name ORDER BY s.name`,[hotelId])).rows;const movements=(await pool.query(`SELECT type,COALESCE(SUM(ABS(quantity)),0)::numeric qty,COUNT(*)::int count FROM stock_transactions WHERE hotel_id=$1 GROUP BY type ORDER BY qty DESC`,[hotelId])).rows;const totalMovements=Number((await pool.query(`SELECT COUNT(*)::int c FROM stock_transactions WHERE hotel_id=$1`,[hotelId])).rows[0].c);res.json({stockValue:value,lowStock:low,movements,byStore,totalMovements});}catch(e:any){res.status(500).json({message:e.message});}});
  app.get('/api/inventory/audit',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;res.json((await pool.query(`SELECT a.*,u.username,COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),' '),u.username) user_display FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.hotel_id=$1 AND (a.entity_type='inventory' OR a.action LIKE 'inventory_%' OR a.action LIKE 'stock_%' OR a.action LIKE 'recipe_%') ORDER BY a.created_at DESC LIMIT 1000`,[hotelId])).rows);}catch(e:any){res.status(500).json({message:e.message});}});

  // Inventory requests -> purchasing / warehouse Telegram
  app.get('/api/inventory/requests',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const rows=(await pool.query(`SELECT r.*,u.first_name,u.last_name,u.username FROM inventory_requests r LEFT JOIN users u ON u.id=r.requester_id WHERE r.hotel_id=$1 ORDER BY r.created_at DESC`,[hotelId])).rows;for(const r of rows){r.items=(await pool.query(`SELECT ri.*,i.sku,i.name FROM inventory_request_items ri JOIN inventory_items i ON i.id=ri.item_id WHERE ri.request_id=$1`,[r.id])).rows;}res.json(rows);}catch(e:any){res.status(500).json({message:e.message});}});
  app.post('/api/inventory/requests',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const client=await pool.connect();try{await client.query('BEGIN');const no=`IR-${Date.now().toString(36).toUpperCase()}`;const department=req.body.department||req.user?.department||null;if(!department)throw new Error('Departman seçilmelidir');const r=(await client.query(`INSERT INTO inventory_requests(hotel_id,request_no,requester_id,department,type,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[hotelId,no,req.user?.id||null,department,req.body.type||'issue',req.body.notes||null])).rows[0];for(const item of req.body.items||[]){await client.query(`INSERT INTO inventory_request_items(request_id,item_id,quantity,unit) VALUES($1,$2,$3,$4)`,[r.id,item.itemId,item.quantity,item.unit||'adet']);}await client.query('COMMIT');const itemLines=(req.body.items||[]).map((x:any)=>`• ${x.name||`Malzeme #${x.itemId}`} — ${x.quantity} ${x.unit||''}`).join('\n');await notifyPurchasingAndStorekeepers(hotelId,`📦 *Yeni Stok Talebi*\n\nNo: ${no}\nDepartman: ${department}\nTür: ${req.body.type==='purchase'?'Satınalma':'Depodan Çıkış'}\n\n${itemLines}\n\n${req.body.notes||''}`);await writeAudit(hotelId,req.user?.id,null,'inventory_request_created',{requestId:r.id,requestNo:no,type:req.body.type||'issue',department},'inventory');res.status(201).json(r);}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}catch(e:any){res.status(500).json({message:e.message});}});
  app.patch('/api/inventory/requests/:id/status',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const status=req.body.status;const existing=(await pool.query(`SELECT * FROM inventory_requests WHERE id=$1 AND hotel_id=$2`,[req.params.id,hotelId])).rows[0];if(!existing)return res.status(404).json({message:'Stok talebi bulunamadı'});if(status==='fulfilled' && existing.type==='issue'){const storeId=Number(req.body.storeId);if(!storeId)return res.status(400).json({message:'Depo seçilmelidir'});const items=(await pool.query(`SELECT * FROM inventory_request_items WHERE request_id=$1`,[req.params.id])).rows;for(const item of items){const bal=Number((await pool.query(`SELECT COALESCE(SUM(quantity),0) stock FROM stock_transactions WHERE store_id=$1 AND item_id=$2`,[storeId,item.item_id])).rows[0].stock);if(bal<Number(item.quantity))return res.status(400).json({message:`Yetersiz stok. Malzeme #${item.item_id} mevcut: ${bal}`});await pool.query(`INSERT INTO stock_transactions(hotel_id,store_id,item_id,type,quantity,reference_type,reference_id,note,user_id,document_no) VALUES($1,$2,$3,'issue',$4,'inventory_request',$5,$6,$7,$8)`,[hotelId,storeId,item.item_id,-Math.abs(Number(item.quantity)),req.params.id,`Inventory request ${existing.request_no}`,req.user?.id||null,existing.request_no]);}}const {rows}=await pool.query(`UPDATE inventory_requests SET status=$1,approved_by=CASE WHEN $1 IN ('approved','fulfilled') THEN $2 ELSE approved_by END,approved_at=CASE WHEN $1 IN ('approved','fulfilled') THEN NOW() ELSE approved_at END WHERE id=$3 AND hotel_id=$4 RETURNING *`,[status,req.user?.id||null,req.params.id,hotelId]);await writeAudit(hotelId,req.user?.id,null,'inventory_request_status_changed',{inventoryRequestId:req.params.id,status,stockDeducted:status==='fulfilled'&&existing.type==='issue'},'inventory');res.json(rows[0]);}catch(e:any){res.status(500).json({message:e.message});}});

  // Recipes and F&B consumption
  app.get('/api/recipes',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const recipes=(await pool.query(`SELECT * FROM recipes WHERE hotel_id=$1 ORDER BY name`,[hotelId])).rows;for(const r of recipes){r.items=(await pool.query(`SELECT ri.*,i.sku,i.name,i.unit FROM recipe_items ri JOIN inventory_items i ON i.id=ri.item_id WHERE ri.recipe_id=$1`,[r.id])).rows;}res.json(recipes);}catch(e:any){res.status(500).json({message:e.message});}});
  app.post('/api/recipes',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;const client=await pool.connect();try{await client.query('BEGIN');const r=(await client.query(`INSERT INTO recipes(hotel_id,name,category,selling_price,yield_qty) VALUES($1,$2,$3,$4,$5) RETURNING *`,[hotelId,req.body.name,req.body.category||null,req.body.sellingPrice||0,req.body.yieldQty||1])).rows[0];for(const x of req.body.items||[]){await client.query(`INSERT INTO recipe_items(recipe_id,item_id,quantity,unit) VALUES($1,$2,$3,$4)`,[r.id,x.itemId,x.quantity,x.unit||'adet']);}await client.query('COMMIT');await writeAudit(hotelId,req.user?.id,null,'recipe_created',{recipeId:r.id,name:req.body.name},'inventory');res.status(201).json(r);}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}catch(e:any){res.status(500).json({message:e.message});}});
  app.post('/api/recipes/:id/consume',async(req,res)=>{try{const hotelId=resolveHotelId(req);if(!requireHotelAccess(req,res,hotelId))return;await consumeRecipe(hotelId,Number(req.params.id),Number(req.body.yieldQty||1),req.user?.id,req.body.storeId?Number(req.body.storeId):undefined);await writeAudit(hotelId,req.user?.id,null,'recipe_consumed',{recipeId:req.params.id,yieldQty:req.body.yieldQty||1},'inventory');res.json({ok:true});}catch(e:any){res.status(500).json({message:e.message});}});

  return httpServer;
}
