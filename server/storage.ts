import { 
  InsertRequest, Request, 
  Employee, InsertEmployee, 
  User, InsertUser, 
  Hotel, InsertHotel, 
  Badge, InsertBadge,
  UserBadge, InsertUserBadge
} from "@shared/schema";
import { badges, userBadges } from "@shared/schema";
import * as expressSession from "express-session";
import memorystore from "memorystore";

export interface IStorage {
  sessionStore: expressSession.Store;
  // Request management
  getAllRequests(): Promise<Request[]>;
  getRequestsByHotelId(hotelId: number): Promise<Request[]>;
  getRequestById(id: number): Promise<Request | undefined>;
  createRequest(request: InsertRequest): Promise<Request>;
  updateRequestStatus(id: number, status: string, completedAt: Date | null): Promise<Request>;
  updateRequestPriority(id: number, priority: string): Promise<Request>;
  updateRequestDeadline(id: number, deadline: Date): Promise<Request>;
  
  // Employee management
  getEmployeesByDepartment(department: string, hotelId?: number): Promise<Employee[]>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByTelegramUsername(telegramUsername: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsersByHotelId(hotelId: number): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: number, userData: Partial<InsertUser>): Promise<User>;
  deleteUser(id: number): Promise<boolean>;
  updateUserSettings(id: number, settings: string): Promise<User>;
  
  // Hotel management
  createHotel(hotel: InsertHotel): Promise<Hotel>;
  getHotelById(id: number): Promise<Hotel | undefined>;
  getAllHotels(): Promise<Hotel[]>;
  updateHotelSettings(id: number, settings: string): Promise<Hotel>;
  updateHotel(id: number, hotelData: Partial<InsertHotel>): Promise<Hotel>;
  deleteHotel(id: number): Promise<boolean>;

  // Badge management
  getAllBadges(): Promise<Badge[]>;
  getBadgesByType(type: string): Promise<Badge[]>;
  getBadgeById(id: number): Promise<Badge | undefined>;
  createBadge(badge: InsertBadge): Promise<Badge>;
  
  // User Badge management
  getUserBadges(userId: number): Promise<(UserBadge & { badge: Badge })[]>;
  assignBadgeToUser(userBadge: InsertUserBadge): Promise<UserBadge>;
  updateUserBadgeProgress(userId: number, badgeId: number, progress: number): Promise<UserBadge>;
  checkBadgeEligibility(userId: number): Promise<void>; // Kullanıcının rozet kazanma durumunu kontrol eder
  
  // Mood Board management
  createMoodEntry(entry: InsertMoodEntry): Promise<MoodEntry>;
  getUserMoodEntries(userId: number): Promise<MoodEntry[]>;
  getHotelMoodEntries(hotelId: number): Promise<(MoodEntry & { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'username'> })[]>;
  getUserMoodByDate(userId: number, date: Date): Promise<MoodEntry | undefined>;
  getMoodStatsByHotelId(hotelId: number, startDate?: Date, endDate?: Date): Promise<{ mood: string, count: number }[]>;
}

import { db } from "./db";
import { eq, and, or, sql, between } from "drizzle-orm";
import { 
  users, requests, employees, hotels, 
  badges as badgesTable, userBadges as userBadgesTable,
  moodEntries, InsertMoodEntry, MoodEntry,
  clothingItems, outfits, recommendations
} from "@shared/schema";
import { alias } from "drizzle-orm/pg-core";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

// PostgreSQL session store
const PostgresSessionStore = connectPg(expressSession.default || expressSession);

export class DatabaseStorage implements IStorage {
  sessionStore: expressSession.Store;

  constructor() {
    // Production-safe persistent sessions in PostgreSQL.
    // The session table is created automatically on first startup.
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getAllRequests(): Promise<any[]> {
    const assignedUser = alias(users, "assigned_user");
    const completedByUser = alias(users, "completed_by_user");
    const createdByUser = alias(users, "created_by_user");
    
    const result = await db.select({
      ...requests,
      assignedUser: {
        id: assignedUser.id,
        username: assignedUser.username,
        firstName: assignedUser.firstName,
        lastName: assignedUser.lastName
      },
      completedByUser: {
        id: completedByUser.id,
        username: completedByUser.username,
        firstName: completedByUser.firstName,
        lastName: completedByUser.lastName
      },
      createdByUser: {
        id: createdByUser.id,
        username: createdByUser.username,
        firstName: createdByUser.firstName,
        lastName: createdByUser.lastName
      }
    })
    .from(requests)
    .leftJoin(assignedUser, eq(requests.assignedToId, assignedUser.id))
    .leftJoin(completedByUser, eq(requests.completedById, completedByUser.id))
    .leftJoin(createdByUser, eq(requests.createdById, createdByUser.id));
    
    return result;
  }
  
  async getRequestsByHotelId(hotelId: number): Promise<any[]> {
    const assignedUser = alias(users, "assigned_user");
    const completedByUser = alias(users, "completed_by_user");
    const createdByUser = alias(users, "created_by_user");
    
    const result = await db.select({
      ...requests,
      assignedUser: {
        id: assignedUser.id,
        username: assignedUser.username,
        firstName: assignedUser.firstName,
        lastName: assignedUser.lastName
      },
      completedByUser: {
        id: completedByUser.id,
        username: completedByUser.username,
        firstName: completedByUser.firstName,
        lastName: completedByUser.lastName
      },
      createdByUser: {
        id: createdByUser.id,
        username: createdByUser.username,
        firstName: createdByUser.firstName,
        lastName: createdByUser.lastName
      }
    })
    .from(requests)
    .leftJoin(assignedUser, eq(requests.assignedToId, assignedUser.id))
    .leftJoin(completedByUser, eq(requests.completedById, completedByUser.id))
    .leftJoin(createdByUser, eq(requests.createdById, createdByUser.id))
    .where(eq(requests.hotelId, hotelId));
    
    return result;
  }

  async getRequestById(id: number): Promise<any | undefined> {
    const assignedUser = alias(users, "assigned_user");
    const completedByUser = alias(users, "completed_by_user");
    const createdByUser = alias(users, "created_by_user");
    
    const [result] = await db.select({
      ...requests,
      assignedUser: {
        id: assignedUser.id,
        username: assignedUser.username,
        firstName: assignedUser.firstName,
        lastName: assignedUser.lastName
      },
      completedByUser: {
        id: completedByUser.id,
        username: completedByUser.username,
        firstName: completedByUser.firstName,
        lastName: completedByUser.lastName
      },
      createdByUser: {
        id: createdByUser.id,
        username: createdByUser.username,
        firstName: createdByUser.firstName,
        lastName: createdByUser.lastName
      }
    })
    .from(requests)
    .leftJoin(assignedUser, eq(requests.assignedToId, assignedUser.id))
    .leftJoin(completedByUser, eq(requests.completedById, completedByUser.id))
    .leftJoin(createdByUser, eq(requests.createdById, createdByUser.id))
    .where(eq(requests.id, id));
    
    return result;
  }

  async createRequest(request: InsertRequest): Promise<Request> {
    const now = new Date();
    
    const [newRequest] = await db.insert(requests).values({
      ...request,
      status: "beklemede",
      createdAt: now,
      completedAt: null,
    }).returning();
    
    return newRequest;
  }

  async updateRequestStatus(id: number, status: string, completedAt: Date | null, completedById?: number): Promise<Request> {
    const completionDate = status === "tamamlandı" ? completedAt || new Date() : null;
    
    const updates: any = { 
      status, 
      completedAt: completionDate 
    };
    
    // If status is completed and we have a user ID, record who completed it
    if (status === "tamamlandı" && completedById) {
      updates.completedById = completedById;
    }
    
    const [updatedRequest] = await db.update(requests)
      .set(updates)
      .where(eq(requests.id, id))
      .returning();
    
    if (!updatedRequest) {
      throw new Error(`Request with id ${id} not found`);
    }
    
    return updatedRequest;
  }
  
  async updateRequestPriority(id: number, priority: string): Promise<Request> {
    const [updatedRequest] = await db.update(requests)
      .set({ priority })
      .where(eq(requests.id, id))
      .returning();
    
    if (!updatedRequest) {
      throw new Error(`Request with id ${id} not found`);
    }
    
    return updatedRequest;
  }
  
  async updateRequestDeadline(id: number, deadline: Date): Promise<Request> {
    const [updatedRequest] = await db.update(requests)
      .set({ deadline })
      .where(eq(requests.id, id))
      .returning();
    
    if (!updatedRequest) {
      throw new Error(`Request with id ${id} not found`);
    }
    
    return updatedRequest;
  }
  
  async assignRequestToUser(id: number, assignedToId: number | null): Promise<Request> {
    // İstek atamada durumu da güncelle
    const status = assignedToId ? "işlemde" : "beklemede";
    
    const [updatedRequest] = await db.update(requests)
      .set({ 
        assignedToId,
        status
      })
      .where(eq(requests.id, id))
      .returning();
    
    if (!updatedRequest) {
      throw new Error(`Request with id ${id} not found`);
    }
    
    return updatedRequest;
  }

  async getEmployeesByDepartment(department: string, hotelId?: number): Promise<Employee[]> {
    console.log(`Fetching employees for department: ${department}, hotelId: ${hotelId}`);
    
    if (department === "all" && !hotelId) {
      // Tüm personeli getir
      const results = await db.select().from(employees);
      console.log(`Found ${results.length} employees (all departments, all hotels)`);
      return results;
    } else if (department === "all" && hotelId) {
      // Belirli bir oteldeki tüm personeli getir
      const results = await db.select().from(employees).where(eq(employees.hotelId, hotelId));
      console.log(`Found ${results.length} employees (all departments, hotel: ${hotelId})`);
      return results;
    } else if (department !== "all" && hotelId) {
      // Belirli bir otelin belirli bir departmanındaki personeli getir
      const results = await db.select().from(employees)
        .where(eq(employees.department, department))
        .where(eq(employees.hotelId, hotelId));
      console.log(`Found ${results.length} employees (department: ${department}, hotel: ${hotelId})`);
      return results;
    }
    
    // Tüm otellerden belirli departmandaki personeli getir
    const results = await db.select().from(employees).where(eq(employees.department, department));
    console.log(`Found ${results.length} employees (department: ${department}, all hotels)`);
    return results;
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const [newEmployee] = await db.insert(employees).values(employee).returning();
    return newEmployee;
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByTelegramUsername(telegramUsername: string): Promise<User | undefined> {
    const clean = telegramUsername.replace('@', '').toLowerCase();
    // DB'de @ ile veya @ olmadan kayıtlı olabilir — her ikisini de kontrol et
    const [user] = await db.select().from(users).where(
      or(
        eq(users.telegramUsername, clean),
        eq(users.telegramUsername, '@' + clean)
      )
    );
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUsersByHotelId(hotelId: number): Promise<User[]> {
    return db.select().from(users).where(eq(users.hotelId, hotelId));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User> {
    const [updatedUser] = await db.update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
    
    if (!updatedUser) {
      throw new Error(`User with id ${id} not found`);
    }
    
    return updatedUser;
  }
  
  async deleteUser(id: number): Promise<boolean> {
    // FK kısıtını aşmak için önce tüm bağımlı kayıtları temizle
    await db.update(requests).set({ assignedToId: null }).where(eq(requests.assignedToId, id));
    await db.update(requests).set({ completedById: null }).where(eq(requests.completedById, id));
    await db.delete(userBadgesTable).where(eq(userBadgesTable.userId, id));
    await db.delete(moodEntries).where(eq(moodEntries.userId, id));
    await db.delete(recommendations).where(eq(recommendations.userId, id));
    await db.delete(outfits).where(eq(outfits.userId, id));
    await db.delete(clothingItems).where(eq(clothingItems.userId, id));
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async updateUserSettings(id: number, settings: string): Promise<User> {
    const [updatedUser] = await db.update(users)
      .set({ settings })
      .where(eq(users.id, id))
      .returning();
    
    if (!updatedUser) {
      throw new Error(`User with id ${id} not found`);
    }
    
    return updatedUser;
  }

  async createHotel(hotel: InsertHotel): Promise<Hotel> {
    const [newHotel] = await db.insert(hotels).values(hotel).returning();
    return newHotel;
  }

  async getHotelById(id: number): Promise<Hotel | undefined> {
    const [hotel] = await db.select().from(hotels).where(eq(hotels.id, id));
    return hotel;
  }

  async getAllHotels(): Promise<Hotel[]> {
    return db.select().from(hotels);
  }
  
  async updateHotelSettings(id: number, settings: string): Promise<Hotel> {
    const [updatedHotel] = await db.update(hotels)
      .set({ settings })
      .where(eq(hotels.id, id))
      .returning();
    
    if (!updatedHotel) {
      throw new Error(`Hotel with id ${id} not found`);
    }
    
    return updatedHotel;
  }
  
  async updateHotel(id: number, hotelData: Partial<InsertHotel>): Promise<Hotel> {
    const [updatedHotel] = await db.update(hotels)
      .set(hotelData)
      .where(eq(hotels.id, id))
      .returning();
    
    if (!updatedHotel) {
      throw new Error(`Hotel with id ${id} not found`);
    }
    
    return updatedHotel;
  }
  
  async deleteHotel(id: number): Promise<boolean> {
    try {
      // İlişkili kullanıcıları bul ve güncelleyelim (superadmin'e atanması gerekebilir)
      await db.update(users)
        .set({ hotelId: null })
        .where(eq(users.hotelId, id));
      
      // İstekleri hotel null olarak güncelle
      await db.update(requests)
        .set({ hotelId: null })
        .where(eq(requests.hotelId, id));
      
      // Personeli sil
      await db.delete(employees)
        .where(eq(employees.hotelId, id));
      
      // Oteli sil
      const result = await db.delete(hotels)
        .where(eq(hotels.id, id))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error(`Error deleting hotel with id ${id}:`, error);
      return false;
    }
  }
  // Rozet yönetimi metotları
  async getAllBadges(): Promise<Badge[]> {
    return db.select().from(badgesTable);
  }

  async getBadgesByType(type: string): Promise<Badge[]> {
    return db.select().from(badgesTable).where(eq(badgesTable.type, type));
  }

  async getBadgeById(id: number): Promise<Badge | undefined> {
    const [badge] = await db.select().from(badgesTable).where(eq(badgesTable.id, id));
    return badge;
  }

  async createBadge(badge: InsertBadge): Promise<Badge> {
    const [newBadge] = await db.insert(badgesTable).values(badge).returning();
    return newBadge;
  }

  // Kullanıcı rozeti yönetimi metotları
  async getUserBadges(userId: number): Promise<(UserBadge & { badge: Badge })[]> {
    const userBadgesData = await db.select().from(userBadgesTable)
      .where(eq(userBadgesTable.userId, userId));
    
    // Her bir kullanıcı rozeti için ilgili rozet bilgilerini al
    const result = await Promise.all(userBadgesData.map(async userBadge => {
      const badge = await this.getBadgeById(userBadge.badgeId);
      return { ...userBadge, badge: badge! };
    }));
    
    return result;
  }

  async assignBadgeToUser(userBadge: InsertUserBadge): Promise<UserBadge> {
    // Kullanıcının bu rozeti daha önce aldığını kontrol et
    const existingBadges = await db.select()
      .from(userBadgesTable)
      .where(and(
        eq(userBadgesTable.userId, userBadge.userId),
        eq(userBadgesTable.badgeId, userBadge.badgeId)
      ));
    
    if (existingBadges.length > 0) {
      // Zaten mevcut ise sadece progress'i güncelle
      const [updatedBadge] = await db.update(userBadgesTable)
        .set({ progress: userBadge.progress })
        .where(and(
          eq(userBadgesTable.userId, userBadge.userId),
          eq(userBadgesTable.badgeId, userBadge.badgeId)
        ))
        .returning();
      return updatedBadge;
    }
    
    // Yeni rozet ata
    const [newUserBadge] = await db.insert(userBadgesTable)
      .values(userBadge)
      .returning();
    return newUserBadge;
  }

  async updateUserBadgeProgress(userId: number, badgeId: number, progress: number): Promise<UserBadge> {
    // Mevcut ilerlemeyi kontrol et
    const [existingBadge] = await db.select()
      .from(userBadgesTable)
      .where(and(
        eq(userBadgesTable.userId, userId),
        eq(userBadgesTable.badgeId, badgeId)
      ));
    
    if (existingBadge) {
      // Rozeti güncelle
      const [updatedBadge] = await db.update(userBadgesTable)
        .set({ progress })
        .where(and(
          eq(userBadgesTable.userId, userId),
          eq(userBadgesTable.badgeId, badgeId)
        ))
        .returning();
      return updatedBadge;
    } else {
      // Yeni rozet kaydı oluştur
      const [newUserBadge] = await db.insert(userBadgesTable)
        .values({ 
          userId, 
          badgeId, 
          progress 
        })
        .returning();
      return newUserBadge;
    }
  }

  // Kullanıcının rozet kazanmaya uygun olup olmadığını kontrol et
  async checkBadgeEligibility(userId: number): Promise<void> {
    // Kullanıcının tamamlanan istek sayısını al (hız rozeti için)
    const completedRequests = await db.select()
      .from(requests)
      .where(eq(requests.status, "tamamlandı"))
      .where(and(
        eq(requests.assignedToId, userId),
        eq(requests.hotelId, (await this.getUser(userId))?.hotelId || 0)
      ));
    
    // Hız rozeti için uygunluk kontrolü
    const speedBadges = await this.getBadgesByType("hız_rozeti");
    
    // Her bir hız rozeti için kontrol yap
    for (const badge of speedBadges) {
      // Tamamlanan istek sayısına göre puan hesapla
      const completedPoints = completedRequests.length * 10;
      
      // İlerleme durumunu kontrol et
      if (completedPoints >= badge.pointsRequired) {
        // Kullanıcı rozeti hak ediyor, rozeti ver
        await this.assignBadgeToUser({
          userId,
          badgeId: badge.id,
          progress: completedPoints
        });
      } else {
        // Kullanıcı rozeti hak etmiyor, sadece ilerleme durumunu güncelle
        await this.updateUserBadgeProgress(userId, badge.id, completedPoints);
      }
    }
    
    // Diğer rozet tipleri için benzer kontroller burada yapılabilir
    // Örneğin: Kalite rozetleri için misafir değerlendirmeleri,
    // Verimlilik rozetleri için kaynak kullanımı, vb.
  }

  // ----- Mood Board (Personel Duygu Durum) Yönetimi -----

  async createMoodEntry(entry: InsertMoodEntry): Promise<MoodEntry> {
    const [newEntry] = await db.insert(moodEntries).values(entry).returning();
    return newEntry;
  }

  async getUserMoodEntries(userId: number): Promise<MoodEntry[]> {
    return db.select().from(moodEntries).where(eq(moodEntries.userId, userId));
  }

  async getHotelMoodEntries(hotelId: number): Promise<(MoodEntry & { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'username'> })[]> {
    const result = await db.select({
      ...moodEntries,
      user: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username
      }
    })
    .from(moodEntries)
    .leftJoin(users, eq(moodEntries.userId, users.id))
    .where(eq(moodEntries.hotelId, hotelId))
    .orderBy(sql`${moodEntries.createdAt} DESC`);
    
    return result;
  }

  async getUserMoodByDate(userId: number, date: Date): Promise<MoodEntry | undefined> {
    // Tarih karşılaştırması için tarihi ISO formatında alırız
    const targetDate = date.toISOString().split('T')[0];
    
    const [entry] = await db.select()
      .from(moodEntries)
      .where(eq(moodEntries.userId, userId))
      .where(sql`date(${moodEntries.date}) = ${targetDate}`);
    
    return entry;
  }

  async getMoodStatsByHotelId(hotelId: number, startDate?: Date, endDate?: Date): Promise<{ mood: string, count: number }[]> {
    // Temel SQL sorgusunu oluşturalım
    let baseQuery = `
      SELECT mood, COUNT(*) 
      FROM mood_entries 
      WHERE hotel_id = $1
    `;
    
    let params: any[] = [hotelId];
    let index = 2;
    
    // Tarih filtrelerini ekleyelim
    if (startDate && endDate) {
      baseQuery += ` AND date::text >= $${index++} AND date::text <= $${index++}`;
      params.push(startDate.toISOString());
      params.push(endDate.toISOString());
    } else if (startDate) {
      baseQuery += ` AND date::text >= $${index++}`;
      params.push(startDate.toISOString());
    } else if (endDate) {
      baseQuery += ` AND date::text <= $${index++}`;
      params.push(endDate.toISOString());
    }
    
    // Gruplama ve sıralama ekleyelim
    baseQuery += " GROUP BY mood";
    
    // Raw SQL sorgusunu execute edelim
    const result = await pool.query(baseQuery, params);
    const results = result.rows.map(row => ({
      mood: row.mood,
      count: parseInt(row.count)
    }));
    return results;
  }
}

export const storage = new DatabaseStorage();
