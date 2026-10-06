import { useEffect, useState } from 'react';
import { api } from '../api/client';

export interface TenantBranding {
  code: string;
  companyName: string;
  logoUrl: string | null;
}

const CACHE_KEY = 'fimto_branding';

/**
 * The viewer's own company branding (name + logo). Cached in localStorage
 * and refreshed in the background, so reports and headers never block on it.
 */
export function useTenant() {
  const [branding, setBranding] = useState<TenantBranding | null>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as TenantBranding) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let alive = true;
    api
      .get<{ branding?: TenantBranding }>('/api/tenant/branding')
      .then((r) => {
        if (!alive || !r?.branding) return;
        setBranding(r.branding);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(r.branding));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* offline or unauthorized — keep cache */
      });
    return () => {
      alive = false;
    };
  }, []);

  return branding;
}
