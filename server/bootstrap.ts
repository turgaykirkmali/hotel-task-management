import { eq } from "drizzle-orm";
import { db } from "./db";
import { badges, hotels, users } from "@shared/schema";
import { hashPassword } from "./auth";

async function seedDefaultSlaPolicies(hotelId: number) {
  const existing = await db.select().from(slaPolicies).where(eq(slaPolicies.hotelId, hotelId)).limit(1);
  if (existing.length) return;
  const defaults: Record<string, Record<string, number>> = {
    "Kat Hizmetleri": { low: 30, normal: 20, high: 10 },
    "Resepsiyon": { low: 20, normal: 10, high: 5 },
    "Teknik Servis": { low: 60, normal: 30, high: 15 },
    "Restoran": { low: 30, normal: 15, high: 10 },
    "Güvenlik": { low: 20, normal: 10, high: 5 },
  };
  for (const department of departments) {
    for (const priority of ["low", "normal", "high"] as const) {
      await db.insert(slaPolicies).values({ hotelId, department, priority, minutes: defaults[department]?.[priority] ?? 30, active: true });
    }
  }
  console.log(`Bootstrap: default SLA policies seeded for hotel ${hotelId}.`);
}

/**
 * Creates the initial privileged accounts on a fresh deployment.
 * Accounts are only created when they do not already exist.
 * Passwords are never logged.
 *
 * Required environment variables:
 *   SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD
 *   ADMIN_USERNAME / ADMIN_PASSWORD
 *
 * Optional:
 *   BOOTSTRAP_ADMIN_HOTEL_ID - existing hotel id for the admin
 *   BOOTSTRAP_HOTEL_NAME - creates a default hotel if none exists
 *   BOOTSTRAP_RESET_PASSWORDS=true - one-time password reset for existing bootstrap users
 */
const DEFAULT_BADGES = [
  { name: "Hız Bronz", description: "10 tamamlanmış isteği hızlı ve başarılı şekilde tamamla.", type: "hız_rozeti", level: "bronz", pointsRequired: 100 },
  { name: "Hız Gümüş", description: "30 tamamlanmış isteği hızlı ve başarılı şekilde tamamla.", type: "hız_rozeti", level: "gümüş", pointsRequired: 300 },
  { name: "Hız Altın", description: "60 tamamlanmış isteği hızlı ve başarılı şekilde tamamla.", type: "hız_rozeti", level: "altın", pointsRequired: 600 },
  { name: "Hız Platin", description: "100 tamamlanmış isteği hızlı ve başarılı şekilde tamamla.", type: "hız_rozeti", level: "platin", pointsRequired: 1000 },

  { name: "Kalite Bronz", description: "Kaliteli ve eksiksiz hizmet sunmaya katkıda bulun.", type: "kalite_rozeti", level: "bronz", pointsRequired: 100 },
  { name: "Kalite Gümüş", description: "Sürekli yüksek kalite standardını koru.", type: "kalite_rozeti", level: "gümüş", pointsRequired: 300 },
  { name: "Kalite Altın", description: "Üstün hizmet kalitesiyle örnek ol.", type: "kalite_rozeti", level: "altın", pointsRequired: 600 },
  { name: "Kalite Platin", description: "Olağanüstü kalite standardını sürekli sürdür.", type: "kalite_rozeti", level: "platin", pointsRequired: 1000 },

  { name: "Verimlilik Bronz", description: "Kaynakları etkin kullanarak verimli çalış.", type: "verimlilik_rozeti", level: "bronz", pointsRequired: 100 },
  { name: "Verimlilik Gümüş", description: "İş süreçlerinde sürdürülebilir verimlilik sağla.", type: "verimlilik_rozeti", level: "gümüş", pointsRequired: 300 },
  { name: "Verimlilik Altın", description: "Yüksek operasyonel verimlilik göster.", type: "verimlilik_rozeti", level: "altın", pointsRequired: 600 },
  { name: "Verimlilik Platin", description: "Operasyonel verimlilikte örnek performans göster.", type: "verimlilik_rozeti", level: "platin", pointsRequired: 1000 },

  { name: "Ekip Bronz", description: "Ekip çalışmasına ve iş birliğine katkı sağla.", type: "ekip_rozeti", level: "bronz", pointsRequired: 100 },
  { name: "Ekip Gümüş", description: "Departmanlar arası iş birliğini güçlendir.", type: "ekip_rozeti", level: "gümüş", pointsRequired: 300 },
  { name: "Ekip Altın", description: "Takım ruhu ve iş birliğinde örnek ol.", type: "ekip_rozeti", level: "altın", pointsRequired: 600 },
  { name: "Ekip Platin", description: "Ekip performansını ve dayanışmayı ileri taşı.", type: "ekip_rozeti", level: "platin", pointsRequired: 1000 },

  { name: "Misafir Memnuniyeti Bronz", description: "Misafir memnuniyetine olumlu katkı sağla.", type: "müşteri_memnuniyeti", level: "bronz", pointsRequired: 100 },
  { name: "Misafir Memnuniyeti Gümüş", description: "Yüksek misafir memnuniyeti standardını destekle.", type: "müşteri_memnuniyeti", level: "gümüş", pointsRequired: 300 },
  { name: "Misafir Memnuniyeti Altın", description: "Misafir deneyiminde üstün performans göster.", type: "müşteri_memnuniyeti", level: "altın", pointsRequired: 600 },
  { name: "Misafir Memnuniyeti Platin", description: "Olağanüstü misafir deneyimi yarat.", type: "müşteri_memnuniyeti", level: "platin", pointsRequired: 1000 },
] as const;

export async function initializeBadgeCatalog() {
  console.log("Bootstrap: badge catalog initialization started.");

  const existing = await db.select({ id: badges.id, name: badges.name }).from(badges);
  console.log(`Bootstrap: existing badges: ${existing.length}`);

  const existingNames = new Set(existing.map((badge) => badge.name));
  const missingBadges = DEFAULT_BADGES.filter((badge) => !existingNames.has(badge.name));

  if (missingBadges.length > 0) {
    await db.insert(badges).values(missingBadges);
    console.log(`Bootstrap: seeded ${missingBadges.length} missing default badges.`);
  } else {
    console.log("Bootstrap: no missing default badges found.");
  }

  const finalCount = await db.select({ id: badges.id }).from(badges);
  console.log(`Bootstrap: badge catalog ready. Total badges: ${finalCount.length}`);
}

export async function bootstrapUsers() {
  const superadminUsername = process.env.SUPERADMIN_USERNAME?.trim();
  const superadminPassword = process.env.SUPERADMIN_PASSWORD;
  const adminUsername = process.env.ADMIN_USERNAME?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const resetPasswords = process.env.BOOTSTRAP_RESET_PASSWORDS === "true";

  console.log("Bootstrap: starting privileged-user initialization...");
  console.log("Bootstrap: environment status", {
    superadminUsernameConfigured: Boolean(superadminUsername),
    superadminPasswordConfigured: Boolean(superadminPassword),
    adminUsernameConfigured: Boolean(adminUsername),
    adminPasswordConfigured: Boolean(adminPassword),
    resetPasswords,
  });

  if (!superadminUsername || !superadminPassword || !adminUsername || !adminPassword) {
    throw new Error(
      "Bootstrap yapılandırması eksik. Render Environment Variables içinde SUPERADMIN_USERNAME, SUPERADMIN_PASSWORD, ADMIN_USERNAME ve ADMIN_PASSWORD tanımlanmalıdır."
    );
  }

  if (superadminPassword.length < 8 || adminPassword.length < 8) {
    throw new Error("Bootstrap passwords must be at least 8 characters long.");
  }

  let adminHotelId: number | null = null;
  const requestedHotelId = Number(process.env.BOOTSTRAP_ADMIN_HOTEL_ID);

  if (Number.isInteger(requestedHotelId) && requestedHotelId > 0) {
    const [hotel] = await db.select({ id: hotels.id }).from(hotels).where(eq(hotels.id, requestedHotelId));
    if (hotel) adminHotelId = hotel.id;
    else console.warn(`BOOTSTRAP_ADMIN_HOTEL_ID=${requestedHotelId} was not found; using the first hotel.`);
  }

  if (adminHotelId === null) {
    const [firstHotel] = await db.select({ id: hotels.id }).from(hotels).orderBy(hotels.id).limit(1);
    if (firstHotel) adminHotelId = firstHotel.id;
  }

  if (adminHotelId === null) {
    const [defaultHotel] = await db.insert(hotels).values({
      name: process.env.BOOTSTRAP_HOTEL_NAME?.trim() || "Hotel Task Management",
      address: "",
      phone: "",
      email: "",
      dbPrefix: `hotel_${Date.now().toString(36)}`,
    }).returning({ id: hotels.id });
    adminHotelId = defaultHotel.id;
    console.log(`Bootstrap: default hotel created (id=${adminHotelId}).`);
  }

  await seedDefaultSlaPolicies(adminHotelId);

  const existingSuperadmin = await db.select().from(users).where(eq(users.username, superadminUsername)).limit(1);
  if (existingSuperadmin.length === 0) {
    await db.insert(users).values({
      username: superadminUsername,
      password: await hashPassword(superadminPassword),
      firstName: "System",
      lastName: "Administrator",
      role: "superadmin",
      department: "Management",
      hotelId: null,
    });
    console.log(`Bootstrap: superadmin '${superadminUsername}' created.`);
  } else if (resetPasswords) {
    await db.update(users)
      .set({ password: await hashPassword(superadminPassword), role: "superadmin", hotelId: null })
      .where(eq(users.id, existingSuperadmin[0].id));
    console.log(`Bootstrap: superadmin '${superadminUsername}' password reset.`);
  } else if (existingSuperadmin[0].role !== "superadmin") {
    await db.update(users).set({ role: "superadmin", hotelId: null }).where(eq(users.id, existingSuperadmin[0].id));
    console.log(`Bootstrap: existing '${superadminUsername}' promoted to superadmin.`);
  }

  const existingAdmin = await db.select().from(users).where(eq(users.username, adminUsername)).limit(1);
  if (existingAdmin.length === 0) {
    await db.insert(users).values({
      username: adminUsername,
      password: await hashPassword(adminPassword),
      firstName: "Hotel",
      lastName: "Administrator",
      role: "admin",
      department: "Management",
      hotelId: adminHotelId,
    });
    console.log(`Bootstrap: admin '${adminUsername}' created for hotel ${adminHotelId}.`);
  } else if (resetPasswords) {
    await db.update(users)
      .set({ password: await hashPassword(adminPassword), role: "admin", hotelId: adminHotelId })
      .where(eq(users.id, existingAdmin[0].id));
    console.log(`Bootstrap: admin '${adminUsername}' password reset.`);
  } else {
    const updates: Partial<typeof users.$inferInsert> = {};
    if (existingAdmin[0].role !== "admin") updates.role = "admin";
    if (!existingAdmin[0].hotelId) updates.hotelId = adminHotelId;
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, existingAdmin[0].id));
      console.log(`Bootstrap: existing admin '${adminUsername}' configuration repaired.`);
    }
  }

}
