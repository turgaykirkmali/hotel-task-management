import { pgTable, text, serial, integer, boolean, timestamp, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User role types
export const roleTypes = ["superadmin", "admin", "staff"] as const;
export type RoleType = typeof roleTypes[number];

// Priority types
export const priorityTypes = ["low", "normal", "high"] as const;
export type PriorityType = typeof priorityTypes[number];

// Hotels schema
export const hotels = pgTable("hotels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  dbPrefix: text("db_prefix").notNull(), // This will be used to create separate database for each hotel
  createdAt: timestamp("created_at").notNull().defaultNow(),
  settings: text("settings").default("{}"), // Hotel settings as JSON string
});

export const insertHotelSchema = createInsertSchema(hotels).pick({
  name: true,
  address: true,
  phone: true,
  email: true,
  dbPrefix: true,
});

export type InsertHotel = z.infer<typeof insertHotelSchema>;
export type Hotel = typeof hotels.$inferSelect;

// Users schema with role and hotel relation
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  telegramUsername: text("telegram_username"),
  telegramChatId: text("telegram_chat_id"),
  telegramLinkToken: text("telegram_link_token").unique(),
  role: text("role").notNull().default("staff"),
  department: text("department"),
  hotelId: integer("hotel_id").references(() => hotels.id),
  settings: text("settings").default("{}"), // User settings as JSON string: darkMode, timeoutSettings, etc.
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  telegramUsername: true,
  telegramChatId: true,
  telegramLinkToken: true,
  role: true,
  department: true,
  hotelId: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Hotel service request schema
export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  roomNumber: text("room_number").notNull(),
  request: text("request").notNull(),
  department: text("department").notNull(),
  status: text("status").notNull().default("beklemede"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  assignedToId: integer("assigned_to_id").references(() => users.id),
  completedById: integer("completed_by_id").references(() => users.id),
  createdById: integer("created_by_id").references(() => users.id),
  hotelId: integer("hotel_id").references(() => hotels.id),
  deadline: timestamp("deadline"),
  priority: text("priority").default("normal"),
  acceptedAt: timestamp("accepted_at"),
  startedAt: timestamp("started_at"),
  slaBreachedAt: timestamp("sla_breached_at"),
});

export const insertRequestSchema = createInsertSchema(requests).pick({
  roomNumber: true,
  request: true,
  department: true,
  assignedToId: true,
  createdById: true,
  hotelId: true,
  deadline: true,
  priority: true,
});

export type InsertRequest = z.infer<typeof insertRequestSchema>;
export type Request = typeof requests.$inferSelect & {
  assignedUser?: {
    id: number;
    firstName: string;
    lastName: string;
    username: string;
  } | null;
  completedByUser?: {
    id: number;
    firstName: string;
    lastName: string;
    username: string;
  } | null;
  createdByUser?: {
    id: number;
    firstName: string;
    lastName: string;
    username: string;
  } | null;
};

// Departman / öncelik bazlı SLA politikaları
export const slaPolicies = pgTable("sla_policies", {
  id: serial("id").primaryKey(),
  hotelId: integer("hotel_id").notNull().references(() => hotels.id),
  department: text("department").notNull(),
  priority: text("priority").notNull().default("normal"),
  minutes: integer("minutes").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type SlaPolicy = typeof slaPolicies.$inferSelect;

// Değişikliklerin izlenmesi için audit trail
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  hotelId: integer("hotel_id").references(() => hotels.id),
  userId: integer("user_id").references(() => users.id),
  requestId: integer("request_id").references(() => requests.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull().default("request"),
  details: text("details").default("{}"),
  source: text("source").notNull().default("web"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type AuditLog = typeof auditLogs.$inferSelect;

// Oda operasyon durumu
export const roomStatuses = pgTable("room_statuses", {
  id: serial("id").primaryKey(),
  hotelId: integer("hotel_id").notNull().references(() => hotels.id),
  roomNumber: text("room_number").notNull(),
  status: text("status").notNull().default("ready"),
  updatedById: integer("updated_by_id").references(() => users.id),
  note: text("note"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type RoomStatus = typeof roomStatuses.$inferSelect;

// Department employees schema
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  department: text("department").notNull(),
  hotelId: integer("hotel_id").references(() => hotels.id), // Which hotel this employee belongs to
});

export const insertEmployeeSchema = createInsertSchema(employees).pick({
  name: true,
  department: true,
  hotelId: true,
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// Status types
export const statusTypes = ["beklemede", "işlemde", "tamamlandı", "geciken"] as const;
export type StatusType = typeof statusTypes[number];

// Report types
export const reportTypes = ["daily", "weekly", "monthly"] as const;
export type ReportType = typeof reportTypes[number];

// Department types
export const departments = ["Kat Hizmetleri", "Resepsiyon", "Teknik Servis", "Restoran", "Güvenlik", "Satınalma", "Depo"] as const;
export type Department = typeof departments[number];

// Rozet türleri
export const badgeTypes = ["hız_rozeti", "kalite_rozeti", "verimlilik_rozeti", "ekip_rozeti", "müşteri_memnuniyeti"] as const;
export type BadgeType = typeof badgeTypes[number];

// Rozet seviyeleri
export const badgeLevels = ["bronz", "gümüş", "altın", "platin"] as const;
export type BadgeLevel = typeof badgeLevels[number];

export const moodTypes = ["çok mutlu", "mutlu", "nötr", "üzgün", "çok üzgün"] as const;
export type MoodType = typeof moodTypes[number];

// Rozetler tablosu
export const badges = pgTable("badges", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  level: text("level").notNull(),
  imageUrl: text("image_url"),
  pointsRequired: integer("points_required").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBadgeSchema = createInsertSchema(badges).pick({
  name: true,
  description: true,
  type: true,
  level: true,
  imageUrl: true,
  pointsRequired: true,
});

export type InsertBadge = z.infer<typeof insertBadgeSchema>;
export type Badge = typeof badges.$inferSelect;

// Kullanıcı rozetleri tablosu (ilişkisel tablo)
export const userBadges = pgTable("user_badges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  badgeId: integer("badge_id").notNull().references(() => badges.id),
  earnedAt: timestamp("earned_at").notNull().defaultNow(),
  progress: integer("progress").notNull().default(0), // rozet için ilerleme puanı
});

export const insertUserBadgeSchema = createInsertSchema(userBadges).pick({
  userId: true,
  badgeId: true,
  progress: true,
});

export type InsertUserBadge = z.infer<typeof insertUserBadgeSchema>;
export type UserBadge = typeof userBadges.$inferSelect;

// Personel duygu durumu izleme tablosu
export const moodEntries = pgTable("mood_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  hotelId: integer("hotel_id").notNull().references(() => hotels.id),
  mood: text("mood", { enum: moodTypes }).notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  date: date("date").notNull(), // Günlük takip için tarih (tekrar giriş yönetimi için)
});

export const insertMoodEntrySchema = createInsertSchema(moodEntries).pick({
  userId: true,
  hotelId: true,
  mood: true,
  comment: true,
  date: true,
});

export type InsertMoodEntry = z.infer<typeof insertMoodEntrySchema>;
export type MoodEntry = typeof moodEntries.$inferSelect;

// ClosetAR - Sanal Gardırop ve Kıyafet Kombinasyon Danışmanı

// Kıyafet Kategorileri
export const clothingCategoryEnum = pgEnum('clothing_category', [
  'üst_giyim',
  'alt_giyim',
  'ayakkabı',
  'dış_giyim',
  'aksesuar',
  'takı',
  'çanta'
]);

// Mevsim
export const seasonEnum = pgEnum('season', [
  'ilkbahar',
  'yaz',
  'sonbahar',
  'kış',
  'tüm_sezonlar'
]);

// Renk
export const colorEnum = pgEnum('color', [
  'siyah',
  'beyaz',
  'kırmızı',
  'mavi',
  'yeşil',
  'sarı',
  'mor',
  'pembe',
  'turuncu',
  'kahverengi',
  'gri',
  'bej',
  'çok_renkli'
]);

// Stil
export const styleEnum = pgEnum('style', [
  'günlük',
  'iş',
  'spor',
  'şık',
  'resmi',
  'plaj',
  'parti'
]);

// Kıyafet Modeli
export const clothingItems = pgTable('clothing_items', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  category: clothingCategoryEnum('category').notNull(),
  color: colorEnum('color').notNull(),
  season: seasonEnum('season').notNull(),
  style: styleEnum('style').notNull(),
  imageUrl: text('image_url').notNull(),
  brand: text('brand'),
  lastWorn: timestamp('last_worn'),
  purchaseDate: timestamp('purchase_date'),
  favorite: boolean('favorite').default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow()
});

// Kıyafet Kombinleri
export const outfits = pgTable('outfits', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  occasion: text('occasion'),
  season: seasonEnum('season').notNull(),
  favorite: boolean('favorite').default(false),
  lastWorn: timestamp('last_worn'),
  imageUrl: text('image_url'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow()
});

// Kombin-Kıyafet İlişkisi
export const outfitItems = pgTable('outfit_items', {
  id: serial('id').primaryKey(),
  outfitId: integer('outfit_id').notNull().references(() => outfits.id),
  clothingItemId: integer('clothing_item_id').notNull().references(() => clothingItems.id),
  createdAt: timestamp('created_at').defaultNow()
});

// Kıyafet Tavsiyesi
export const recommendations = pgTable('recommendations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  type: text('type').notNull(), // 'outfit', 'item', 'style'
  viewed: boolean('viewed').default(false),
  createdAt: timestamp('created_at').defaultNow()
});

// Zod Şemaları
export const insertClothingItemSchema = createInsertSchema(clothingItems).omit({ id: true, createdAt: true });
export const insertOutfitSchema = createInsertSchema(outfits).omit({ id: true, createdAt: true });
export const insertOutfitItemSchema = createInsertSchema(outfitItems).omit({ id: true, createdAt: true });
export const insertRecommendationSchema = createInsertSchema(recommendations).omit({ id: true, createdAt: true });

// Tipler
export type ClothingItem = typeof clothingItems.$inferSelect;
export type InsertClothingItem = z.infer<typeof insertClothingItemSchema>;

export type Outfit = typeof outfits.$inferSelect;
export type InsertOutfit = z.infer<typeof insertOutfitSchema>;

export type OutfitItem = typeof outfitItems.$inferSelect;
export type InsertOutfitItem = z.infer<typeof insertOutfitItemSchema>;

export type Recommendation = typeof recommendations.$inferSelect;
export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
