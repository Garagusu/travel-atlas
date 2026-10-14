/**
 * Sets a new password for an account and signs it out everywhere.
 * Use when you've forgotten your password:
 *   npm run reset-password -- you@example.com "a new long password"
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run reset-password -- <email> "<new password>"');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Use a password with at least 10 characters.");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const hash = await bcrypt.hash(password, 12);
  const res = await pool.query("update users set password_hash = $1 where lower(email) = lower($2) returning id", [hash, email.trim()]);
  if (!res.rowCount) {
    const all = await pool.query("select email from users order by created_at");
    console.error(`No account with email ${email}. Accounts: ${all.rows.map((r) => r.email).join(", ") || "none"}`);
    await pool.end();
    process.exit(1);
  }
  await pool.query("delete from sessions where user_id = $1", [res.rows[0].id]);
  await pool.end();
  console.log(`Password updated for ${email}. Sign in with the new password.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
