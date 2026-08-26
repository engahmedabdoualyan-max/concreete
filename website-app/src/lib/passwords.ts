/**
 * Password hashing — unified spec across web / server / mobile.
 * hash = SHA-256( `${username}::${password}::${SALT}` ) as lowercase hex.
 *
 * Web uses native WebCrypto; mobile uses js-sha256; server uses node:crypto.
 */

const SALT = 'fimto-pw-salt-v1';

export function pwInput(username: string, password: string): string {
  return `${String(username || '').trim().toLowerCase()}::${String(password || '')}::${SALT}`;
}

export async function hashPassword(username: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(pwInput(username, password));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
