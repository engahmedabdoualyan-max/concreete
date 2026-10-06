import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import LangSelector from '../components/LangSelector';

/**
 * HR — منظومة الموارد البشرية (مدير الـHR).
 * Mirrors the Android app's HR home ((hr)/index + attendance) with the same
 * backend: leave/advance requests with approve/reject, team directory,
 * attendance report, broadcasts, payroll runs. Read/write is server-gated
 * (HR_READ / HR_WRITE); every tab degrades independently.
 */

type Tab = 'requests' | 'team' | 'attendance' | 'broadcasts' | 'payroll';

const TYPE_AR: Record<string, string> = { LEAVE: 'إجازة', ADVANCE: 'سلفة', SALARY_CONFIRM: 'تعريف راتب', OTHER: 'أخرى' };
const STATUS_AR: Record<string, string> = { PENDING: 'بانتظار', APPROVED: 'مقبول', REJECTED: 'مرفوض', CANCELLED: 'ملغي' };

function nameOf(e: any): string {
  return e.fullName ?? e.full_name ?? e.name ?? e.email ?? e.employeeCode ?? '—';
}

export default function HR() {
  const { currentUser } = useAuth();
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [tab, setTab] = useState<Tab>('requests');
  const [filter, setFilter] = useState('PENDING');
  const [requests, setRequests] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [attRows, setAttRows] = useState<any[]>([]);
  const [attRange] = useState(() => {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    return { from, to };
  });
  const [casts, setCasts] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ requests?: any[] }>(`/api/hr/requests${filter === 'ALL' ? '' : `?status=${filter}`}`);
      setRequests(Array.isArray(r?.requests) ? r.requests : []);
    } catch { setRequests([]); }
    try {
      const e = await api.get<{ employees?: any[] }>('/api/hr/employees');
      setEmployees(Array.isArray(e?.employees) ? e.employees : []);
    } catch { setEmployees([]); }
    try {
      const a = await api.get<any[]>(`/api/hr/attendance?from=${attRange.from}&to=${attRange.to}`);
      setAttRows(Array.isArray(a) ? a : (a as any)?.rows ?? []);
    } catch { setAttRows([]); }
    try {
      const b = await api.get<{ broadcasts?: any[] }>('/api/hr/broadcasts');
      setCasts(Array.isArray(b?.broadcasts) ? b.broadcasts : []);
    } catch { setCasts([]); }
    try {
      const p = await api.get<{ runs?: any[] }>('/api/hr/payroll/runs');
      setRuns(Array.isArray(p?.runs) ? p.runs : []);
    } catch { setRuns([]); }
  }, [filter, attRange]);

  useEffect(() => {
    if (!currentUser) return;
    load();
  }, [currentUser, load]);

  const review = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setBusy(id + decision);
    setMsg('');
    try {
      await api.post(`/api/hr/requests/${id}/review`, { decision, reviewNote: note[id] || undefined });
      setMsg(decision === 'APPROVED' ? '✅ تم القبول' : 'تم الرفض');
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل'}`);
    } finally {
      setBusy('');
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#080C14] text-slate-200 flex items-center justify-center p-6 text-center">
        <p>{ar ? 'سجل الدخول أولاً.' : 'Log in first.'}</p>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; ar: string; en: string }> = [
    { id: 'requests', ar: '📥 الطلبات', en: 'Requests' },
    { id: 'team', ar: '👥 فريق العمل', en: 'Team' },
    { id: 'attendance', ar: '🕐 الحضور', en: 'Attendance' },
    { id: 'broadcasts', ar: '📢 الإعلانات', en: 'Broadcasts' },
    { id: 'payroll', ar: '💰 الرواتب', en: 'Payroll' },
  ];

  const team = employees.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [e.fullName, e.full_name, e.email, e.employeeCode, e.phone, e.department].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-200" dir={ar ? 'rtl' : 'ltr'}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">👔 {ar ? 'الموارد البشرية' : 'Human Resources'}</h1>
            <p className="text-xs text-slate-500 mt-1">
              {ar ? 'طلبات الإجازات والسلف • فريق العمل • الحضور • الإعلانات • الرواتب' : 'Leave & advances • team • attendance • broadcasts • payroll'}
            </p>
          </div>
          <LangSelector />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-xs font-black rounded-lg px-4 py-2 border transition ${tab === t.id ? 'bg-sky-500 text-white border-sky-400' : 'bg-white/[0.04] text-slate-300 border-white/10 hover:border-sky-400/50'}`}
            >
              {ar ? t.ar : t.en}
            </button>
          ))}
        </div>

        {msg && <p className="text-xs font-bold text-slate-200 mt-3">{msg}</p>}

        {/* ===== requests ===== */}
        {tab === 'requests' && (
          <div className="mt-4">
            <div className="flex gap-2 mb-3">
              {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`text-[11px] font-black rounded-lg px-3 py-1.5 border ${filter === f ? 'bg-white text-black border-white' : 'text-slate-400 border-white/10'}`}>
                  {STATUS_AR[f] ?? f}
                </button>
              ))}
            </div>
            {requests.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا طلبات.' : 'No requests.'}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {requests.map((r) => (
                <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-white">{TYPE_AR[r.type] ?? r.type}</span>
                    <span className={`text-[10px] font-black rounded px-2 py-0.5 ${r.status === 'PENDING' ? 'bg-yellow-500/15 text-yellow-300' : r.status === 'APPROVED' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                      {STATUS_AR[r.status] ?? r.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{nameOf(r)} {r.employeeCode ? `· ${r.employeeCode}` : ''}</p>
                  {r.reason && <p className="text-xs text-slate-300 mt-2">{r.reason}</p>}
                  {(r.amountSar ?? r.daysCount) && (
                    <p className="text-xs text-slate-400 mt-1">
                      {[r.amountSar ? `${r.amountSar} ر.س` : '', r.daysCount ? `${r.daysCount} يوم` : '', r.startDate ?? '', r.endDate ?? ''].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {r.status === 'PENDING' && (
                    <div className="mt-3">
                      <input value={note[r.id] ?? ''} onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))}
                        placeholder={ar ? 'ملاحظة المراجعة (اختياري)' : 'Review note (optional)'}
                        className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none mb-2" />
                      <div className="flex gap-2">
                        <button disabled={!!busy} onClick={() => review(r.id, 'APPROVED')}
                          className="flex-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black rounded-lg py-2 disabled:opacity-50">
                          {busy === r.id + 'APPROVED' ? '…' : '✅ قبول'}
                        </button>
                        <button disabled={!!busy} onClick={() => review(r.id, 'REJECTED')}
                          className="flex-1 bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-black rounded-lg py-2 disabled:opacity-50">
                          {busy === r.id + 'REJECTED' ? '…' : '✕ رفض'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== team ===== */}
        {tab === 'team' && (
          <div className="mt-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={ar ? '🔍 بحث بالاسم / الكود / الجوال…' : 'Search name / code / phone…'}
              className="w-full max-w-md bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none mb-3" />
            <p className="text-[11px] text-slate-500 mb-2">{team.length} {ar ? 'موظف' : 'employees'}</p>
            {team.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا بيانات فريق.' : 'No team data.'}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {team.map((e, i) => (
                <div key={e.id ?? i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
                  <div className="w-11 h-11 shrink-0 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-lg font-black text-sky-300">
                    {(nameOf(e) || '?').trim().charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{nameOf(e)}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {[e.role ?? e.jobTitle, e.department, e.employeeCode, e.phone].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== attendance ===== */}
        {tab === 'attendance' && (
          <div className="mt-4">
            <p className="text-[11px] text-slate-500 mb-2">{attRange.from} → {attRange.to}</p>
            {attRows.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا سجلات حضور.' : 'No attendance records.'}</p>}
            <div className="space-y-2">
              {attRows.slice(0, 60).map((r, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 flex items-center justify-between text-xs">
                  <span className="font-black text-white">{r.fullName ?? r.name ?? '—'}</span>
                  <span className="text-slate-400">{r.workDate ?? r.date ?? ''}</span>
                  <span className="font-black text-teal-300">
                    {typeof r.minutesWorked === 'number' ? `${Math.floor(r.minutesWorked / 60)}h ${r.minutesWorked % 60}m` : r.hours ?? ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== broadcasts ===== */}
        {tab === 'broadcasts' && (
          <div className="mt-4 space-y-3">
            {casts.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا إعلانات.' : 'No broadcasts.'}</p>}
            {casts.map((b, i) => (
              <div key={b.id ?? i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-black text-white">{b.title ?? b.subject ?? (ar ? 'إعلان' : 'Broadcast')}</p>
                {(b.body ?? b.message) && <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap">{b.body ?? b.message}</p>}
                <p className="text-[10px] text-slate-500 mt-1">{b.createdAt ?? b.created_at ?? ''}</p>
              </div>
            ))}
          </div>
        )}

        {/* ===== payroll ===== */}
        {tab === 'payroll' && (
          <div className="mt-4 space-y-2">
            {runs.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا مسيرات رواتب.' : 'No payroll runs.'}</p>}
            {runs.map((r, i) => (
              <div key={r.id ?? i} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs flex items-center justify-between">
                <span className="font-black text-white">{r.period ?? r.month ?? r.title ?? `${ar ? 'مسير' : 'Run'} ${i + 1}`}</span>
                <span className="text-slate-400">{r.status ?? ''} {typeof r.totalSar === 'number' ? `· ${r.totalSar} ر.س` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
