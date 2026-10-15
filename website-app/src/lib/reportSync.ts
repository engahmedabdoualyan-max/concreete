/**
 * ============================================================
 *  Cloud sync for lab reports + delivery notes (best-effort)
 * ============================================================
 *  Order of truth: localStorage (instant) → Firebase per-user
 *  (cross-device, same account) → ERP workspace blob (tenant-wide,
 *  so the manager sees the technician's reports).
 *
 *  Every step is best-effort: offline or signed-out means local-only,
 *  exactly like the rest of the site. Merge is by document key with
 *  newest-createdAt winning — nothing is ever deleted by a sync.
 * ============================================================
 */

import { api, getToken } from '../api/client';

const stampOf = (r: unknown): number => {
  const c = (r as { createdAt?: unknown }).createdAt;
  return Date.parse(String(c ?? 0)) || 0;
};

export function mergeByKey<T>(base: T[], incoming: T[], key: (r: T) => string): T[] {
  const map = new Map<string, T>();
  for (const r of [...base, ...incoming]) {
    const k = key(r);
    const prev = map.get(k);
    if (!prev || stampOf(r) >= stampOf(prev)) map.set(k, r);
  }
  return [...map.values()];
}

/** Pull the tenant blob and merge with local rows (local wins ties). */
export async function pullCloud<T>(
  collection: 'labReports' | 'deliveryNotes' | 'recipes' | 'inventory',
  local: T[],
  key: (r: T) => string
): Promise<T[]> {
  if (!getToken()) return local;
  try {
    const res = await api.get<{ data: T[] | null }>(`/api/workspace/${collection}`);
    if (!Array.isArray(res?.data)) return local;
    return mergeByKey(local, res.data, key);
  } catch {
    return local;
  }
}

/** Push the full merged list to the tenant blob. Never throws. */
export async function pushCloud(collection: 'labReports' | 'deliveryNotes' | 'recipes' | 'inventory', list: unknown): Promise<boolean> {
  if (!getToken()) return true;
  try {
    await api.put(`/api/workspace/${collection}`, list ?? {});
    return true;
  } catch {
    return false;
  }
}

/** Pull a tenant blob stored as a single object (e.g. inventory). Never throws. */
export async function pullObject(collection: 'inventory' | 'recipes'): Promise<unknown> {
  if (!getToken()) return null;
  try {
    const res = await api.get<{ data: unknown }>(`/api/workspace/${collection}`);
    return res?.data ?? null;
  } catch {
    return null;
  }
}
