import { eq } from "drizzle-orm";
import { db } from "./db";
import { hotels, users } from "@shared/schema";
import { hashPassword } from "./auth";

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
