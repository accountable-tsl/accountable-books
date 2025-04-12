import type { Knex } from "knex";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { NewUserInput } from "../types/db";
import { faker } from "@faker-js/faker";

export async function seed(knex: Knex): Promise<void> {
  const saltRounds = 10;
  const isProd = process.env.NODE_ENV === "production";
  const generateSecurePassword = () => crypto.randomBytes(16).toString("hex");

  // Production safety check
  if (isProd && !process.env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD must be set in production");
  }

  if (!isProd && !process.env.TEST_ADMIN_PASSWORD) {
    throw new Error("Set TEST_ADMIN_PASSWORD");
  }

  // Password configuration
  const testUserPassword =
    process.env.TEST_USER_PASSWORD || generateSecurePassword();
  const testAdminPassword =
    process.env.TEST_ADMIN_PASSWORD || generateSecurePassword();
  const adminPassword = process.env.ADMIN_PASSWORD || generateSecurePassword();

  const hashedTestUser = await bcrypt.hash(testUserPassword, saltRounds);
  const hashedTestAdmin = await bcrypt.hash(testAdminPassword, saltRounds);
  const hashedAdmin = await bcrypt.hash(adminPassword, saltRounds);

  const users: NewUserInput[] = [];

  // Dummy users
  for (let i = 0; i < 10; i++) {
    users.push({
      firstname: faker.person.firstName(),
      lastname: faker.person.lastName(),
      email: faker.internet.email().toLowerCase(),
      password: hashedTestUser,
      phone_number: faker.phone.number(),
      avatar_url: faker.image.avatar(),
      status: "active",
    });
  }

  // Add special case users
  users.push(
    {
      firstname: "Jane",
      lastname: "Doe",
      email: "jane@example.com",
      password: hashedTestUser,
      phone_number: "+15551234567",
      status: "active",
    },
    {
      firstname: "Inactive",
      lastname: "User",
      email: "inactive@example.com",
      password: hashedTestAdmin,
      status: "inactive",
    },
    {
      firstname: "Admin",
      lastname: "User",
      email: "admin@example.com",
      password: hashedTestAdmin,
      status: "active",
    },
    {
      firstname: "Super",
      lastname: "Admin",
      email: "superadmin@example.com",
      password: hashedAdmin,
      status: "active",
    }
  );

  await knex.transaction(async (trx) => {
    try {
      await trx("user").insert(users).onConflict("email").ignore();

      // ONLY log this once, add to .env file and then delete this part
      if (!isProd) {
        console.log(`Seeded ${users.length} users`);
        console.log("🔐 Seeded admin user:");
        console.log(`Password: ${adminPassword}`);
      }
    } catch (error) {
      console.error("Failed to seed users:", error);
      throw error;
    }
  });
}
