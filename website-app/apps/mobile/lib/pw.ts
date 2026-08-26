/**
 * Password hashing (mobile) — same spec as web/server.
 * hash = SHA-256( `${username}::${password}::${SALT}` ) lowercase hex.
 */
import sha256 from "js-sha256";

const SALT = "fimto-pw-salt-v1";

export function hashPassword(username: string, password: string): string {
  return sha256(
    `${String(username || "").trim().toLowerCase()}::${String(password || "")}::${SALT}`
  );
}
