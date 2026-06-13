import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "nf.db");
const SCHEMA_PATH = path.join(process.cwd(), "querygpt-dataset-kit", "schema.sql");

async function seed() {
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  const db = new Database(DB_PATH);
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);

  console.log("Database schema created.");

  const cities = ["Delhi", "Mumbai", "Hyderabad", "Lucknow", "Bangalore", "Kolkata", "Jaipur", "Bhopal"];
  const genders = ["Male", "Female"];
  const sects = ["Sunni", "Shia", "Other", "Prefer not to say"];
  const statuses = ["active", "deactivated", "suspended"];

  // Insert Plans
  const insertPlan = db.prepare("INSERT INTO plans (plan_name, price_inr, duration_days, contact_credits) VALUES (?, ?, ?, ?)");
  insertPlan.run("Basic", 0, 0, 0);
  insertPlan.run("Silver", 999, 30, 20);
  insertPlan.run("Gold", 2499, 90, 75);
  insertPlan.run("Platinum", 4499, 180, 200);

  // Insert Users
  const insertUser = db.prepare(`
    INSERT INTO users (full_name, gender, dob, city, sect, account_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  for (let i = 1; i <= 200; i++) {
    const gender = genders[Math.floor(Math.random() * genders.length)];
    const name = `${gender === "Male" ? "Ahmed" : "Fatima"} ${i}`;
    const city = cities[Math.floor(Math.random() * cities.length)];
    const sect = sects[Math.floor(Math.random() * sects.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const createdDate = new Date(now.getTime() - Math.random() * 1000 * 60 * 60 * 24 * 365);
    const dob = new Date(now.getFullYear() - 20 - Math.floor(Math.random() * 20), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28));

    insertUser.run(name, gender, dob.toISOString().split("T")[0], city, sect, status, createdDate.toISOString());
  }

  console.log("200 users seeded.");

  // Seed some subscriptions and payments for revenue queries
  const users = db.prepare("SELECT user_id, created_at FROM users").all() as { user_id: number, created_at: string }[];
  const insertSub = db.prepare("INSERT INTO subscriptions (user_id, plan_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)");
  const insertPayment = db.prepare("INSERT INTO payments (user_id, subscription_id, amount_inr, method, status, created_at) VALUES (?, ?, ?, ?, ?, ?)");

  for (const user of users) {
    if (Math.random() > 0.4) {
      const planId = Math.floor(Math.random() * 3) + 2; // Silver, Gold, or Platinum
      const plan = db.prepare("SELECT price_inr, duration_days FROM plans WHERE plan_id = ?").get(planId) as { price_inr: number, duration_days: number };
      const start = new Date(user.created_at);
      const end = new Date(start.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);
      
      const sub = insertSub.run(user.user_id, planId, start.toISOString().split("T")[0], end.toISOString().split("T")[0], end > now ? "active" : "expired");
      insertPayment.run(user.user_id, sub.lastInsertRowid, plan.price_inr, "UPI", "success", start.toISOString());
    }
  }

  console.log("Subscriptions and payments seeded.");
  db.close();
}

seed().catch(console.error);
