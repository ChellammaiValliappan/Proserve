// Creates (or resets) an admin login. Prints a SQL statement if no DATABASE_URL is set.
// Usage: npm run admin:create -- owner@example.com "Owner Name" 'a-strong-password'
import { hashPassword } from "../server/auth.ts";

const [email, name, password] = process.argv.slice(2);
if (!email || !name || !password || password.length < 10) {
  console.error('Usage: npm run admin:create -- <email> "<name>" <password (min 10 chars)>');
  process.exit(1);
}
const hash = await hashPassword(password);
if (!process.env.DATABASE_URL) {
  const esc = (s: string) => s.replace(/'/g, "''");
  console.log(`INSERT INTO admins (email, name, role, password_hash) VALUES ('${esc(email.toLowerCase())}', '${esc(name)}', 'admin', '${hash}') ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true, token_version = admins.token_version + 1;`);
  process.exit(0);
}
const { q } = await import("../server/db.ts");
await q(
  `INSERT INTO admins (email, name, role, password_hash) VALUES ($1, $2, 'admin', $3)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true, token_version = admins.token_version + 1`,
  [email.toLowerCase(), name, hash],
);
console.log("Admin ready:", email);
process.exit(0);
