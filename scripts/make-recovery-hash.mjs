/**
 * One-time local helper: derive the scrypt hash for the recovery password.
 *
 *   RECOVERY_PASSWORD=... node scripts/make-recovery-hash.mjs
 *
 * Prints a single line `scrypt:<saltHex>:<keyHex>` → paste it as the
 * RECOVERY_PASSWORD_HASH env var (Vercel → Settings → Environment Variables).
 *
 * The clear-text password is NEVER written anywhere by this script.
 */
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const password = process.env.RECOVERY_PASSWORD ?? "";
if (!password || password.length < 8) {
  console.error("Usage: RECOVERY_PASSWORD=<recovery-password> node scripts/make-recovery-hash.mjs");
  console.error("The password must be at least 8 characters. It is read from the environment only.");
  process.exit(1);
}

const salt = randomBytes(16);
const key = await scryptAsync(password, salt, 64);
console.log(`scrypt:${salt.toString("hex")}:${key.toString("hex")}`);
