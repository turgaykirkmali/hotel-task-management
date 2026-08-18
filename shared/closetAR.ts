import { pgTable, serial, text, integer, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  userId: integer('user_id').notNull(),
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
  userId: integer('user_id').notNull(),
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
  outfitId: integer('outfit_id').notNull(),
  clothingItemId: integer('clothing_item_id').notNull(),
  createdAt: timestamp('created_at').defaultNow()
});

// Kıyafet Tavsiyesi
export const recommendations = pgTable('recommendations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
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