import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';

/**
 * PlantLocationField — the plant's coordinates, shown inside "بيانات الشركة".
 *
 * ── Why this only appears for your own company ─────────────────────────────────
 * The rest of the company panel is Firestore, but plant locations live in
 * Postgres and `/api/sites` scopes every read and write to the CALLER's tenant.
 * The console owner manages several companies, so for any company other than
 * their own there is no tenant that could legitimately receive the write — the
 * only tenant available is the owner's, and saving company B's plant into
 * company A's tenant would be silent, invisible data corruption.
 *
 * So rather than guess, this renders only when the row being edited is the signed
 * in user's own company. That needs no cross-tenant lookup at all: it is an email
 * comparison against the session. Everything else gets a link to /sites instead.
 *
 * ── Editable, but one hop away ────────────────────────────────────────────────
 * The two numbers save in place (that is the field that was asked for); adding,
 * renaming, retiring or re-promoting a site is on /sites, where the other sites
 * in the register are visible at the same time. Splitting it that way keeps this
 * panel to two inputs and avoids a second editor for the same rows.
 *
 * ── Writes are still checked server-side ─────────────────────────────────────
 * The 403 note is not decoration. `canWrite` comes from the API rather than from
 * a role list duplicated in the SPA, but the POST/PATCH is still authorised
 * independently — hiding a control is not access control.
 */

interface Site {
  id: string;
  siteName: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMetres: number;
  isPrimary: boolean;
  isActive: boolean;
}

interface SitesResponse {
  sites: Site[];
  hasPrimary: boolean;
  canWrite: boolean;
}

interface Props {
  /** Email of the company row currently open in the editor. */
  companyEmail: string;
  /** Email of the signed-in console user. */
  sessionEmail: string;
}

export default function PlantLocationField({ companyEmail, sessionEmail }: Props) {
  const [data, setData] = useState<SitesResponse | null>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [missing, setMissing] = useState(false);

  // Identity is decided from emails, case-insensitively — the login fix in the
  // API made email case-insensitive for the same reason, and a mismatch here
  // would only show the field to one of two spellings of the same person.
  const isOwnCompany =
    !!companyEmail.trim() &&
    !!sessionEmail.trim() &&
    companyEmail.trim().toLowerCase() === sessionEmail.trim().toLowerCase();

  const load = useCallback(async () => {
    if (!isOwnCompany) return;
    try {
      const res = await api.get<SitesResponse>('/api/sites');
      setData(res);
      setErr('');
      const primary = res?.sites?.find((s) => s.isPrimary && s.isActive);
      if (primary) {
        setLat(String(primary.latitude));
        setLng(String(primary.longitude));
        setMissing(false);
      } else {
        setMissing(true);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  }, [isOwnCompany]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
  }, [load]);

  if (!isOwnCompany) {
    return (
      <div className="mt-3 pt-3 border-t border-white/10 sm:col-span-2">
        <p className="text-[11px] font-bold text-slate-300">📍 موقع المصنع والفروع</p>
        <p className="text-[10px] text-slate-500 mt-1">
          ⓘ مواقع كل شركة محفوظة في نظام المصنع نفسه، بتُدار من صفحة المواقع.
        </p>
        <Link to="/sites" className="text-[11px] text-sky-400 underline mt-1 inline-block">
          فتح صفحة المواقع ←
        </Link>
      </div>
    );
  }

  const canWrite = !!data?.canWrite;

  const save = async () => {
    setMsg('');
    setErr('');
    setBusy(true);
    try {
      const primary = data?.sites.find((s) => s.isPrimary);
      if (!primary) {
        setErr('لا يوجد موقع أساسي — أضف واحداً من صفحة المواقع.');
        return;
      }
      await api.patch(`/api/sites/${primary.id}`, {
        latitude: Number(lat),
        longitude: Number(lng),
      });
      await load();
      setMsg('✓ تم حفظ موقع المصنع');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-white/10 sm:col-span-2 space-y-2">
      <p className="text-[11px] font-bold text-slate-300">📍 موقع المصنع (يُستخدم في رصد المركبات)</p>

      {err && <p className="text-[10px] text-red-400">{err}</p>}

      {missing ? (
        <div>
          <p className="text-[10px] text-amber-300">
            ⚠️ لسه مفيش موقع أساسي مسجل. المسافات وأوقات الوصول بتتقيس منه.
          </p>
          <Link to="/sites" className="text-[11px] text-sky-400 underline mt-1 inline-block">
            إضافة موقع المصنع ←
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              className={inputCls}
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="خط العرض (Latitude)"
              dir="ltr"
              inputMode="decimal"
              disabled={!canWrite}
            />
            <input
              className={inputCls}
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="خط الطول (Longitude)"
              dir="ltr"
              inputMode="decimal"
              disabled={!canWrite}
            />
          </div>
          {canWrite ? (
            <button
              onClick={save}
              disabled={busy || !lat || !lng}
              className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-[11px] font-bold px-3 py-2 rounded-lg disabled:opacity-40"
            >
              {msg || '💾 حفظ موقع المصنع'}
            </button>
          ) : (
            <p className="text-[10px] text-slate-500">ⓘ عرض فقط — دورك لا يعدّل المواقع.</p>
          )}
          <Link to="/sites" className="text-[10px] text-sky-400 underline inline-block">
            إدارة الفروع والعرض على الخريطة ←
          </Link>
        </>
      )}
    </div>
  );
}

const inputCls =
  'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-slate-100 text-sm outline-none focus:border-sky-400/70 transition placeholder:text-slate-500 disabled:opacity-60';