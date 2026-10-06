import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import LangSelector from '../components/LangSelector';
import { downloadExcel, openPrintPDF, type ExportColumn, type ExportRow } from '../lib/exportReports';

/**
 * HR — منظومة الموارد البشرية (مدير الـHR).
 * Mirrors the Android app's HR home ((hr)/index + attendance) with the same
 * backend: leave/advance requests with approve/reject, team directory,
 * attendance report, broadcasts, payroll runs. Read/write is server-gated
 * (HR_READ / HR_WRITE); every tab degrades independently.
 */

type Tab = 'requests' | 'team' | 'attendance' | 'broadcasts' | 'payroll' | 'actions' | 'investigations' | 'custody';

const COUNTRIES = [
  { code: 'SA', ar: 'السعودية', flag: '🇸🇦' }, { code: 'EG', ar: 'مصر', flag: '🇪🇬' },
  { code: 'SD', ar: 'السودان', flag: '🇸🇩' }, { code: 'YE', ar: 'اليمن', flag: '🇾🇪' },
  { code: 'PK', ar: 'باكستان', flag: '🇵🇰' }, { code: 'IN', ar: 'الهند', flag: '🇮🇳' },
  { code: 'BD', ar: 'بنجلاديش', flag: '🇧🇩' }, { code: 'PH', ar: 'الفلبين', flag: '🇵🇭' },
  { code: 'SY', ar: 'سوريا', flag: '🇸🇾' }, { code: 'JO', ar: 'الأردن', flag: '🇯🇴' },
  { code: 'PS', ar: 'فلسطين', flag: '🇵🇸' }, { code: 'LB', ar: 'لبنان', flag: '🇱🇧' },
  { code: 'IQ', ar: 'العراق', flag: '🇮🇶' }, { code: 'AF', ar: 'أفغانستان', flag: '🇦🇫' },
  { code: 'ID', ar: 'إندونيسيا', flag: '🇮🇩' }, { code: 'LK', ar: 'سريلانكا', flag: '🇱🇰' },
  { code: 'NP', ar: 'نيبال', flag: '🇳🇵' }, { code: 'ET', ar: 'إثيوبيا', flag: '🇪🇹' },
  { code: 'KE', ar: 'كينيا', flag: '🇰🇪' }, { code: 'UG', ar: 'أوغندا', flag: '🇺🇬' },
  { code: 'ER', ar: 'إريتريا', flag: '🇪🇷' }, { code: 'TR', ar: 'تركيا', flag: '🇹🇷' },
  { code: 'MM', ar: 'ميانمار', flag: '🇲🇲' }, { code: 'TD', ar: 'تشاد', flag: '🇹🇩' },
];

const ACTION_KIND_AR: Record<string, string> = {
  WARNING: 'إنذار', DEDUCTION: 'خصم', SUSPENSION: 'إيقاف', TERMINATION: 'فصل',
  BONUS: 'مكافأة', OVERTIME_BONUS: 'بدل إضافي', RECOGNITION: 'تكريم',
};
const DOC_KIND_AR: Record<string, string> = {
  IQAMA: 'الإقامة', DRIVING_LICENCE: 'رخصة القيادة', INSURANCE: 'التأمين الطبي', CONTRACT: 'العقد', OTHER: 'أخرى',
};

const TYPE_AR: Record<string, string> = { LEAVE: 'إجازة', ADVANCE: 'سلفة', SALARY_CONFIRM: 'تعريف راتب', OTHER: 'أخرى' };
const STATUS_AR: Record<string, string> = { PENDING: 'بانتظار', APPROVED: 'مقبول', REJECTED: 'مرفوض', CANCELLED: 'ملغي' };

function nameOf(e: any): string {
  return e.fullName ?? e.full_name ?? e.name ?? e.email ?? e.employeeCode ?? '—';
}

const DEPTS = ['الإدارة', 'المالية', 'الموارد البشرية', 'المبيعات', 'التشغيل', 'الورشة', 'المخازن', 'المختبر', 'الإنتاج', 'البحث والتطوير'];

function ExportBar({ title, subtitle, fileBase, columns, rows }: {
  title: string; subtitle: string; fileBase: string; columns: ExportColumn[]; rows: ExportRow[];
}) {
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => openPrintPDF({ title, subtitle: `${subtitle} — ${stamp}`, columns, rows })}
        className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-white/15 bg-white/[0.05] text-slate-200 hover:border-sky-400/60"
      >
        🖨️ طباعة / PDF
      </button>
      <button
        onClick={() => downloadExcel(`${fileBase}-${stamp}`, [{ name: title.slice(0, 31), columns, rows }])}
        className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
      >
        📊 إكسل
      </button>
    </div>
  );
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
  const [casts, setCasts] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [fromDate, setFromDate] = useState(() => new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ employeeCode: '', fullName: '', nationalId: '', countryCode: '', jobTitle: '', department: '', baseSalarySar: '', housingAllowanceSar: '', transportAllowanceSar: '', bankIban: '', bankName: '', hireDate: '', contactPhone: '', emergencyContactName: '', emergencyContactPhone: '', lastVacationDate: '', lastResumptionDate: '', medicalInsuranceNo: '', medicalInsuranceExpiry: '', vehiclePlate: '', vehicleOwnership: '', iqamaExpiry: '' });
  const [actions, setActions] = useState<any[]>([]);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionForm, setActionForm] = useState({ kind: 'PENALTY', employeeId: '', subKind: 'WARNING', amountSar: '', suspensionDays: '', reason: '' });
  const [invs, setInvs] = useState<any[]>([]);
  const [invFilter, setInvFilter] = useState('ALL');
  const [showInvForm, setShowInvForm] = useState(false);
  const [invForm, setInvForm] = useState({ employeeId: '', subject: '', details: '' });
  const [closeNote, setCloseNote] = useState<Record<string, string>>({});
  const [docsEmp, setDocsEmp] = useState<{ id: string; name: string } | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [custody, setCustody] = useState<any[]>([]);
  const [custodyFilter, setCustodyFilter] = useState('ALL');
  const [showCustodyForm, setShowCustodyForm] = useState(false);
  const [custodyForm, setCustodyForm] = useState({ employeeId: '', item: '', serialNo: '', notes: '' });
  const [docKind, setDocKind] = useState('IQAMA');
  const [uploading, setUploading] = useState(false);

  const addEmployee = async () => {
    if (!form.employeeCode.trim() || !form.fullName.trim()) {
      setMsg('❌ الكود والاسم مطلوبان');
      return;
    }
    setBusy('add');
    setMsg('');
    try {
      const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
      await api.post('/api/hr/employees', {
        employeeCode: form.employeeCode.trim(),
        fullName: form.fullName.trim(),
        nationalId: form.nationalId.trim() || undefined,
        nationality: form.countryCode === 'SA' ? 'SAUDI' : 'NON_SAUDI',
        countryCode: form.countryCode || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        department: form.department || undefined,
        baseSalarySar: num(form.baseSalarySar),
        housingAllowanceSar: num(form.housingAllowanceSar),
        transportAllowanceSar: num(form.transportAllowanceSar),
        bankIban: form.bankIban.trim() || undefined,
        bankName: form.bankName.trim() || undefined,
        hireDate: form.hireDate || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        emergencyContactName: form.emergencyContactName.trim() || undefined,
        emergencyContactPhone: form.emergencyContactPhone.trim() || undefined,
        lastVacationDate: form.lastVacationDate || undefined,
        lastResumptionDate: form.lastResumptionDate || undefined,
        medicalInsuranceNo: form.medicalInsuranceNo.trim() || undefined,
        medicalInsuranceExpiry: form.medicalInsuranceExpiry || undefined,
        iqamaExpiry: form.iqamaExpiry || undefined,
        vehiclePlate: form.vehiclePlate.trim() || undefined,
        vehicleOwnership: (form.vehicleOwnership || undefined) as 'PRIVATE' | 'COMPANY' | undefined,
      });
      setMsg('✅ تمت إضافة الموظف');
      setForm({ employeeCode: '', fullName: '', nationalId: '', countryCode: '', jobTitle: '', department: '', baseSalarySar: '', housingAllowanceSar: '', transportAllowanceSar: '', bankIban: '', bankName: '', hireDate: '', contactPhone: '', emergencyContactName: '', emergencyContactPhone: '', lastVacationDate: '', lastResumptionDate: '', medicalInsuranceNo: '', medicalInsuranceExpiry: '', vehiclePlate: '', vehicleOwnership: '', iqamaExpiry: '' });
      setShowAdd(false);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الإضافة'}`);
    } finally {
      setBusy('');
    }
  };

  const loadDocs = async (employeeId: string, name: string) => {
    setDocsEmp({ id: employeeId, name });
    try {
      const d = await api.get<{ documents?: any[] }>(`/api/hr/documents?employeeId=${employeeId}`);
      setDocs(Array.isArray(d?.documents) ? d.documents : []);
    } catch { setDocs([]); }
  };

  const uploadDoc = async (file: File | undefined) => {
    if (!file || !docsEmp) return;
    if (file.size > 8 * 1024 * 1024) {
      setMsg('❌ الملف أكبر من 8MB');
      return;
    }
    if (!/pdf|image/i.test(file.type) && !/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
      setMsg('❌ PDF أو صور فقط');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await api.post('/api/hr/documents', {
        employeeId: docsEmp.id,
        kind: docKind,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        fileData: dataUrl,
      });
      setMsg('✅ تم رفع المستند');
      await loadDocs(docsEmp.id, docsEmp.name);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الرفع'}`);
    } finally {
      setUploading(false);
    }
  };

  const handCustody = async () => {
    if (!custodyForm.employeeId || !custodyForm.item.trim()) {
      setMsg('❌ اختر الموظف واكتب الصنف');
      return;
    }
    setBusy('custody');
    setMsg('');
    try {
      await api.post('/api/hr/custody', {
        employeeId: custodyForm.employeeId,
        item: custodyForm.item.trim(),
        serialNo: custodyForm.serialNo.trim() || undefined,
        notes: custodyForm.notes.trim() || undefined,
      });
      setMsg('✅ تم تسليم العهدة');
      setCustodyForm({ employeeId: '', item: '', serialNo: '', notes: '' });
      setShowCustodyForm(false);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل التسليم'}`);
    } finally {
      setBusy('');
    }
  };

  const returnCustody = async (id: string) => {
    setBusy('ret' + id);
    try {
      await api.post(`/api/hr/custody/${id}/return`, {});
      setMsg('✅ تم استلام العهدة');
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الاستلام'}`);
    } finally {
      setBusy('');
    }
  };

  const addAction = async () => {
    if (!actionForm.employeeId || !actionForm.reason.trim()) {
      setMsg('❌ اختر الموظف واكتب السبب');
      return;
    }
    setBusy('action');
    setMsg('');
    try {
      const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
      await api.post('/api/hr/actions', {
        kind: actionForm.kind,
        employeeId: actionForm.employeeId,
        subKind: actionForm.subKind,
        amountSar: num(actionForm.amountSar),
        suspensionDays: actionForm.suspensionDays.trim() === '' ? undefined : Math.round(Number(actionForm.suspensionDays)),
        reason: actionForm.reason.trim(),
      });
      setMsg(actionForm.kind === 'PENALTY' ? '✅ تم تسجيل الجزاء' : '✅ تم تسجيل المكافأة');
      setActionForm({ kind: 'PENALTY', employeeId: '', subKind: 'WARNING', amountSar: '', suspensionDays: '', reason: '' });
      setShowActionForm(false);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل التسجيل'}`);
    } finally {
      setBusy('');
    }
  };

  const openInv = async () => {
    if (!invForm.employeeId || !invForm.subject.trim()) {
      setMsg('❌ اختر الموظف واكتب موضوع التحقيق');
      return;
    }
    setBusy('inv');
    setMsg('');
    try {
      await api.post('/api/hr/investigations', {
        employeeId: invForm.employeeId,
        subject: invForm.subject.trim(),
        details: invForm.details.trim() || undefined,
      });
      setMsg('✅ تم فتح التحقيق');
      setInvForm({ employeeId: '', subject: '', details: '' });
      setShowInvForm(false);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الفتح'}`);
    } finally {
      setBusy('');
    }
  };

  const closeInv = async (id: string) => {
    setBusy('close' + id);
    try {
      await api.post(`/api/hr/investigations/${id}/close`, { outcome: closeNote[id]?.trim() || undefined });
      setMsg('✅ تم إغلاق التحقيق وحفظ النتيجة');
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الإغلاق'}`);
    } finally {
      setBusy('');
    }
  };

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
      const a = await api.get<any[]>(`/api/hr/attendance?from=${fromDate}&to=${toDate}`);
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
    try {
      const ac = await api.get<{ actions?: any[] }>(`/api/hr/actions${actionFilter === 'ALL' ? '' : `?kind=${actionFilter}`}`);
      setActions(Array.isArray(ac?.actions) ? ac.actions : []);
    } catch { setActions([]); }
    try {
      const iv = await api.get<{ investigations?: any[] }>(`/api/hr/investigations${invFilter === 'ALL' ? '' : `?status=${invFilter}`}`);
      setInvs(Array.isArray(iv?.investigations) ? iv.investigations : []);
    } catch { setInvs([]); }
    try {
      const cu = await api.get<{ custody?: any[] }>(`/api/hr/custody${custodyFilter === 'ALL' ? '' : `?status=${custodyFilter}`}`);
      setCustody(Array.isArray(cu?.custody) ? cu.custody : []);
    } catch { setCustody([]); }
  }, [filter, fromDate, toDate, actionFilter, invFilter, custodyFilter]);

  useEffect(() => {
    if (!currentUser) return;
    load();
  }, [currentUser, load]);

  const review = async (id: string, decision: 'APPROVED' | 'REJECTED') => {    setBusy(id + decision);
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
    { id: 'actions', ar: '⚖️ الجزاءات والمكافآت', en: 'Actions' },
    { id: 'investigations', ar: '🔍 التحقيقات', en: 'Investigations' },
    { id: 'custody', ar: '🎒 العهد', en: 'Custody' },
  ];

  const team = employees.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [e.fullName, e.full_name, e.email, e.employeeCode, e.phone, e.department].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  // Iqama renewals due within 60 days (or already expired) — the watch section.
  const renewals = employees
    .map((e) => {
      const raw = e.iqamaExpiry ?? e.iqama_expiry;
      if (!raw) return null;
      const t = new Date(raw).getTime();
      if (Number.isNaN(t)) return null;
      const days = Math.ceil((t - Date.now()) / 864e5);
      return days <= 60 ? { e, days } : null;
    })
    .filter((x): x is { e: any; days: number } => !!x)
    .sort((a, b) => a.days - b.days);

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
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex gap-2">
                {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`text-[11px] font-black rounded-lg px-3 py-1.5 border ${filter === f ? 'bg-white text-black border-white' : 'text-slate-400 border-white/10'}`}>
                    {STATUS_AR[f] ?? f}
                  </button>
                ))}
              </div>
              <ExportBar
                title={ar ? 'طلبات الموارد البشرية' : 'HR requests'}
                subtitle={`${STATUS_AR[filter] ?? filter}`}
                fileBase="hr-requests"
                columns={[
                  { header: 'الموظف', key: 'name' },
                  { header: 'الكود', key: 'code' },
                  { header: 'النوع', key: 'type' },
                  { header: 'الحالة', key: 'status' },
                  { header: 'التفاصيل', key: 'detail' },
                ]}
                rows={requests.map((r) => ({
                  name: nameOf(r), code: r.employeeCode ?? '',
                  type: TYPE_AR[r.type] ?? r.type, status: STATUS_AR[r.status] ?? r.status,
                  detail: [r.amountSar ? `${r.amountSar} ر.س` : '', r.daysCount ? `${r.daysCount} يوم` : '', r.reason ?? ''].filter(Boolean).join(' · '),
                }))}
              />
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
            {renewals.length > 0 && (
              <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/[0.07] p-3 mb-3">
                <h3 className="text-xs font-black text-yellow-300 mb-2">
                  ⏰ {ar ? `تجديدات الإقامة القادمة (${renewals.length}) — قبل الانتهاء بشهرين` : `Iqama renewals due (${renewals.length})`}
                </h3>
                {renewals.slice(0, 8).map(({ e, days }, i) => (
                  <div key={e.id ?? i} className="flex items-center justify-between text-xs border-b border-white/5 py-1 last:border-0">
                    <span className="font-bold text-slate-200">{nameOf(e)} · {e.employeeCode}</span>
                    <span className={`font-black ${days < 0 ? 'text-red-400' : days <= 30 ? 'text-yellow-300' : 'text-slate-300'}`}>
                      {days < 0 ? (ar ? `منتهية منذ ${-days} يوم` : `expired ${-days}d ago`) : (ar ? `متبقي ${days} يوم` : `${days}d left`)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={ar ? '🔍 بحث بالاسم / الكود / الجوال…' : 'Search name / code / phone…'}
                className="flex-1 min-w-[200px] max-w-md bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
              <button onClick={() => setShowAdd((v) => !v)}
                className="text-[11px] font-black rounded-lg px-3 py-2 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25">
                ➕ {ar ? 'إضافة موظف' : 'Add employee'}
              </button>
              <ExportBar
                title={ar ? 'فريق العمل' : 'Team'}
                subtitle={`${team.length} ${ar ? 'موظف' : 'employees'}`}
                fileBase="hr-team"
                columns={[
                  { header: 'الاسم', key: 'name' },
                  { header: 'الكود', key: 'code' },
                  { header: 'المسمى', key: 'title' },
                  { header: 'القسم', key: 'dept' },
                ]}
                rows={team.map((e) => ({
                  name: nameOf(e), code: e.employeeCode ?? '',
                  title: e.role ?? e.jobTitle ?? '', dept: e.department ?? '',
                }))}
              />
            </div>
            {showAdd && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4 mb-3">
                <h3 className="text-sm font-black text-white mb-3">➕ {ar ? 'بيانات الموظف الجديد' : 'New employee'}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'كود الموظف *' : 'Code *'}
                    <input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الاسم *' : 'Name *'}
                    <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'رقم الهوية / الإقامة' : 'National ID / Iqama'}
                    <input value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} inputMode="numeric"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'تاريخ انتهاء الإقامة * للتنبيه' : 'Iqama expiry (alerts)'}
                    <input type="date" value={form.iqamaExpiry} onChange={(e) => setForm({ ...form, iqamaExpiry: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الجنسية' : 'Nationality'}
                    <select value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="">—</option>
                      {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.ar}</option>)}
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الوظيفة' : 'Job title'}
                    <input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الإدارة التابع لها' : 'Department'}
                    <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="">—</option>
                      {DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الراتب الأساسي (ر.س)' : 'Base salary'}
                    <input value={form.baseSalarySar} onChange={(e) => setForm({ ...form, baseSalarySar: e.target.value })} inputMode="decimal"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'بدل السكن' : 'Housing'}
                    <input value={form.housingAllowanceSar} onChange={(e) => setForm({ ...form, housingAllowanceSar: e.target.value })} inputMode="decimal"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'بدل المواصلات' : 'Transport'}
                    <input value={form.transportAllowanceSar} onChange={(e) => setForm({ ...form, transportAllowanceSar: e.target.value })} inputMode="decimal"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'البنك' : 'Bank'}
                    <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الآيبان' : 'IBAN'}
                    <input value={form.bankIban} onChange={(e) => setForm({ ...form, bankIban: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'تاريخ التعيين' : 'Hire date'}
                    <input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'رقم التواصل' : 'Contact phone'}
                    <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} inputMode="tel"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'قريب بالسعودية (للطوارئ)' : 'Emergency contact (KSA)'}
                    <input value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'جوال الطوارئ' : 'Emergency mobile'}
                    <input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} inputMode="tel"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'تاريخ آخر إجازة' : 'Last vacation'}
                    <input type="date" value={form.lastVacationDate} onChange={(e) => setForm({ ...form, lastVacationDate: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'تاريخ آخر مباشرة' : 'Last resumption'}
                    <input type="date" value={form.lastResumptionDate} onChange={(e) => setForm({ ...form, lastResumptionDate: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'وثيقة التأمين الطبي' : 'Medical insurance no.'}
                    <input value={form.medicalInsuranceNo} onChange={(e) => setForm({ ...form, medicalInsuranceNo: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'انتهاء التأمين الطبي' : 'Insurance expiry'}
                    <input type="date" value={form.medicalInsuranceExpiry} onChange={(e) => setForm({ ...form, medicalInsuranceExpiry: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'رقم السيارة' : 'Car plate'}
                    <input value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'السيارة خاصة أم عهدة؟' : 'Car: private or custody?'}
                    <select value={form.vehicleOwnership} onChange={(e) => setForm({ ...form, vehicleOwnership: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="">—</option>
                      <option value="PRIVATE">{ar ? '🚗 خاصة' : 'Private'}</option>
                      <option value="COMPANY">{ar ? '🏢 عهدة الشركة' : 'Company'}</option>
                    </select></label>
                </div>
                <button disabled={busy === 'add'} onClick={addEmployee}
                  className="mt-3 w-full sm:w-auto bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
                  {busy === 'add' ? '…' : `✅ ${ar ? 'حفظ الموظف' : 'Save employee'}`}
                </button>
              </div>
            )}
            <p className="text-[11px] text-slate-500 mb-2">{team.length} {ar ? 'موظف' : 'employees'}</p>
            {team.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا بيانات فريق.' : 'No team data.'}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {team.map((e, i) => (
                <div key={e.id ?? i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
                  <div className="w-11 h-11 shrink-0 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-lg font-black text-sky-300">
                    {(nameOf(e) || '?').trim().charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-white truncate">{nameOf(e)}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {[e.role ?? e.jobTitle, e.department, e.employeeCode, e.phone ?? e.contactPhone].filter(Boolean).join(' · ')}
                    </p>
                    {(e.vehiclePlate || e.countryCode) && (
                      <p className="text-[11px] text-slate-500 truncate">
                        {[e.vehiclePlate ? `🚗 ${e.vehiclePlate}${e.vehicleOwnership === 'COMPANY' ? ' (عهدة)' : e.vehicleOwnership === 'PRIVATE' ? ' (خاصة)' : ''}` : '',
                          e.countryCode ? (COUNTRIES.find((c) => c.code === e.countryCode)?.flag ?? '') : ''].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  {e.id && (
                    <button onClick={() => (docsEmp?.id === e.id ? setDocsEmp(null) : loadDocs(e.id, nameOf(e)))}
                      title={ar ? 'مستندات الموظف' : 'Documents'}
                      className="shrink-0 text-lg rounded-lg border border-white/10 bg-white/[0.04] w-9 h-9 hover:border-sky-400/60">
                      📁
                    </button>
                  )}
                </div>
              ))}
            </div>
            {docsEmp && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-white">📁 {ar ? 'مستندات' : 'Documents'} — {docsEmp.name}</h3>
                  <button onClick={() => setDocsEmp(null)} className="text-slate-400 hover:text-white px-2">✕</button>
                </div>
                {docs.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا مستندات مسجلة.' : 'No documents registered.'}</p>}
                {docs.map((d, i) => (
                  <div key={d.id ?? i} className="flex items-center justify-between text-xs border-b border-white/5 py-1.5 last:border-0">
                    <span className="font-bold text-slate-200">{DOC_KIND_AR[d.kind] ?? d.kind} · {d.fileName}</span>
                    {d.storageUrl ? (
                      <a href={d.storageUrl} target="_blank" rel="noreferrer" className="text-sky-400 font-black">⬇ {ar ? 'فتح' : 'Open'}</a>
                    ) : (
                      <span className="text-slate-500">{String(d.createdAt ?? '').slice(0, 10)}</span>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2 mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                  <select value={docKind} onChange={(e) => setDocKind(e.target.value)}
                    className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                    {Object.entries(DOC_KIND_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <label className={`text-[11px] font-black rounded-lg px-3 py-1.5 border cursor-pointer ${uploading ? 'opacity-50' : 'border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'}`}>
                    📎 {uploading ? '…' : (ar ? 'رفع PDF / صورة (حتى 8MB)' : 'Upload PDF/image (8MB)')}
                    <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploading}
                      onChange={(e) => { uploadDoc(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== attendance ===== */}
        {tab === 'attendance' && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'من' : 'From'}</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'إلى' : 'To'}</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
              <ExportBar
                title={ar ? 'تقرير الحضور' : 'Attendance report'}
                subtitle={`${fromDate} → ${toDate}`}
                fileBase={`hr-attendance-${fromDate}-to-${toDate}`}
                columns={[
                  { header: 'الموظف', key: 'name' },
                  { header: 'التاريخ', key: 'date' },
                  { header: 'ساعات العمل', key: 'hours' },
                ]}
                rows={attRows.map((r) => ({
                  name: r.fullName ?? r.name ?? '',
                  date: r.workDate ?? r.date ?? '',
                  hours: typeof r.minutesWorked === 'number' ? `${Math.floor(r.minutesWorked / 60)}h ${r.minutesWorked % 60}m` : (r.hours ?? ''),
                }))}
              />
            </div>
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

        {/* ===== actions: penalties + rewards ===== */}
        {tab === 'actions' && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex gap-2">
                {['ALL', 'PENALTY', 'REWARD'].map((f) => (
                  <button key={f} onClick={() => setActionFilter(f)}
                    className={`text-[11px] font-black rounded-lg px-3 py-1.5 border ${actionFilter === f ? 'bg-white text-black border-white' : 'text-slate-400 border-white/10'}`}>
                    {f === 'ALL' ? (ar ? 'الكل' : 'All') : f === 'PENALTY' ? (ar ? '⚠️ الجزاءات' : 'Penalties') : (ar ? '🏅 المكافآت' : 'Rewards')}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowActionForm((v) => !v)}
                className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25">
                ➕ {ar ? 'تسجيل جزاء / مكافأة' : 'Record action'}
              </button>
            </div>
            {showActionForm && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4 mb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'النوع' : 'Kind'}
                    <select value={actionForm.kind} onChange={(e) => setActionForm({ ...actionForm, kind: e.target.value, subKind: e.target.value === 'PENALTY' ? 'WARNING' : 'BONUS' })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="PENALTY">⚠️ {ar ? 'جزاء' : 'Penalty'}</option>
                      <option value="REWARD">🏅 {ar ? 'مكافأة' : 'Reward'}</option>
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الموظف' : 'Employee'}
                    <select value={actionForm.employeeId} onChange={(e) => setActionForm({ ...actionForm, employeeId: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="">—</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{nameOf(e)} · {e.employeeCode}</option>)}
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'التصنيف' : 'Type'}
                    <select value={actionForm.subKind} onChange={(e) => setActionForm({ ...actionForm, subKind: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      {(actionForm.kind === 'PENALTY' ? ['WARNING', 'DEDUCTION', 'SUSPENSION', 'TERMINATION'] : ['BONUS', 'OVERTIME_BONUS', 'RECOGNITION']).map((k) => (
                        <option key={k} value={k}>{ACTION_KIND_AR[k] ?? k}</option>
                      ))}
                    </select></label>
                  {(actionForm.subKind === 'DEDUCTION' || actionForm.subKind === 'BONUS' || actionForm.subKind === 'OVERTIME_BONUS') && (
                    <label className="text-[11px] text-slate-400 font-bold">{ar ? 'المبلغ (ر.س)' : 'Amount (SAR)'}
                      <input value={actionForm.amountSar} onChange={(e) => setActionForm({ ...actionForm, amountSar: e.target.value })} inputMode="decimal"
                        className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  )}
                  {actionForm.subKind === 'SUSPENSION' && (
                    <label className="text-[11px] text-slate-400 font-bold">{ar ? 'أيام الإيقاف' : 'Suspension days'}
                      <input value={actionForm.suspensionDays} onChange={(e) => setActionForm({ ...actionForm, suspensionDays: e.target.value })} inputMode="numeric"
                        className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  )}
                  <label className="text-[11px] text-slate-400 font-bold sm:col-span-2">{ar ? 'السبب *' : 'Reason *'}
                    <input value={actionForm.reason} onChange={(e) => setActionForm({ ...actionForm, reason: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                </div>
                <button disabled={busy === 'action'} onClick={addAction}
                  className="mt-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
                  {busy === 'action' ? '…' : `✅ ${ar ? 'تسجيل' : 'Record'}`}
                </button>
              </div>
            )}
            {actions.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا جزاءات ولا مكافآت مسجلة.' : 'Nothing recorded.'}</p>}
            <div className="space-y-2">
              {actions.map((a, i) => (
                <div key={a.id ?? i} className={`rounded-xl border px-3 py-2 text-xs ${a.kind === 'PENALTY' ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-emerald-500/30 bg-emerald-500/[0.06]'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white">{a.kind === 'PENALTY' ? '⚠️' : '🏅'} {ACTION_KIND_AR[a.subKind] ?? a.subKind}</span>
                    <span className="text-slate-400">{String(a.issuedAt ?? '').slice(0, 10)}</span>
                  </div>
                  <p className="text-slate-300 mt-0.5">{a.reason}</p>
                  <p className="text-slate-500 mt-0.5">
                    {[a.amountSar ? `${a.amountSar} ر.س` : '', a.suspensionDays ? `${a.suspensionDays} يوم إيقاف` : ''].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== investigations ===== */}
        {tab === 'investigations' && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex gap-2">
                {['ALL', 'OPEN', 'CLOSED'].map((f) => (
                  <button key={f} onClick={() => setInvFilter(f)}
                    className={`text-[11px] font-black rounded-lg px-3 py-1.5 border ${invFilter === f ? 'bg-white text-black border-white' : 'text-slate-400 border-white/10'}`}>
                    {f === 'ALL' ? (ar ? 'الكل' : 'All') : f === 'OPEN' ? (ar ? '🔴 مفتوحة' : 'Open') : (ar ? 'مغلقة' : 'Closed')}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowInvForm((v) => !v)}
                className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25">
                ➕ {ar ? 'فتح تحقيق' : 'Open investigation'}
              </button>
            </div>
            {showInvForm && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4 mb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الموظف' : 'Employee'}
                    <select value={invForm.employeeId} onChange={(e) => setInvForm({ ...invForm, employeeId: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="">—</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{nameOf(e)} · {e.employeeCode}</option>)}
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'موضوع التحقيق *' : 'Subject *'}
                    <input value={invForm.subject} onChange={(e) => setInvForm({ ...invForm, subject: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold sm:col-span-2">{ar ? 'التفاصيل' : 'Details'}
                    <input value={invForm.details} onChange={(e) => setInvForm({ ...invForm, details: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                </div>
                <button disabled={busy === 'inv'} onClick={openInv}
                  className="mt-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
                  {busy === 'inv' ? '…' : `✅ ${ar ? 'فتح' : 'Open'}`}
                </button>
              </div>
            )}
            {invs.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا تحقيقات.' : 'No investigations.'}</p>}
            <div className="space-y-2">
              {invs.map((v, i) => (
                <div key={v.id ?? i} className={`rounded-xl border px-3 py-2 text-xs ${v.status === 'OPEN' ? 'border-yellow-500/40 bg-yellow-500/[0.06]' : 'border-white/10 bg-white/[0.03]'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white">{v.subject}</span>
                    <span className={`text-[10px] font-black rounded px-2 py-0.5 ${v.status === 'OPEN' ? 'bg-yellow-500/15 text-yellow-300' : 'bg-white/10 text-slate-400'}`}>
                      {v.status === 'OPEN' ? (ar ? '🔴 مفتوح' : 'OPEN') : (ar ? 'مغلق' : 'CLOSED')}
                    </span>
                  </div>
                  {v.details && <p className="text-slate-400 mt-1">{v.details}</p>}
                  {v.outcome && <p className="text-emerald-300 mt-1">📋 {ar ? 'النتيجة' : 'Outcome'}: {v.outcome}</p>}
                  {v.status === 'OPEN' && (
                    <div className="flex gap-2 mt-2">
                      <input value={closeNote[v.id] ?? ''} onChange={(e) => setCloseNote((n) => ({ ...n, [v.id]: e.target.value }))}
                        placeholder={ar ? 'نتيجة التحقيق…' : 'Outcome…'}
                        className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
                      <button disabled={busy === 'close' + v.id} onClick={() => closeInv(v.id)}
                        className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black rounded-lg px-4 disabled:opacity-50">
                        {busy === 'close' + v.id ? '…' : (ar ? 'إغلاق' : 'Close')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== custody: personal + company custody ===== */}
        {tab === 'custody' && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex gap-2">
                {['ALL', 'HELD', 'RETURNED'].map((f) => (
                  <button key={f} onClick={() => setCustodyFilter(f)}
                    className={`text-[11px] font-black rounded-lg px-3 py-1.5 border ${custodyFilter === f ? 'bg-white text-black border-white' : 'text-slate-400 border-white/10'}`}>
                    {f === 'ALL' ? (ar ? 'الكل' : 'All') : f === 'HELD' ? (ar ? '🟢 مع الموظفين' : 'Held') : (ar ? 'مُعادة' : 'Returned')}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowCustodyForm((v) => !v)}
                className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25">
                ➕ {ar ? 'تسليم عهدة' : 'Hand over'}
              </button>
            </div>
            {showCustodyForm && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4 mb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الموظف *' : 'Employee *'}
                    <select value={custodyForm.employeeId} onChange={(e) => setCustodyForm({ ...custodyForm, employeeId: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="">—</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{nameOf(e)} · {e.employeeCode}</option>)}
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الصنف * (عدة، جوال، مفتاح…)' : 'Item *'}
                    <input value={custodyForm.item} onChange={(e) => setCustodyForm({ ...custodyForm, item: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الرقم التسلسلي' : 'Serial'}
                    <input value={custodyForm.serialNo} onChange={(e) => setCustodyForm({ ...custodyForm, serialNo: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'ملاحظات' : 'Notes'}
                    <input value={custodyForm.notes} onChange={(e) => setCustodyForm({ ...custodyForm, notes: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                </div>
                <button disabled={busy === 'custody'} onClick={handCustody}
                  className="mt-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
                  {busy === 'custody' ? '…' : `✅ ${ar ? 'تسليم' : 'Hand over'}`}
                </button>
              </div>
            )}
            {custody.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا عهد مسجلة.' : 'No custody items.'}</p>}
            <div className="space-y-2">
              {custody.map((c, i) => (
                <div key={c.id ?? i} className={`rounded-xl border px-3 py-2 text-xs flex items-center justify-between ${c.status === 'HELD' ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-transparent opacity-60'}`}>
                  <div>
                    <span className="font-black text-white">🎒 {c.item}</span>
                    <p className="text-slate-400 mt-0.5">{[c.serialNo, c.notes].filter(Boolean).join(' · ')}</p>
                    <p className="text-slate-500 text-[10px]">{String(c.handedAt ?? '').slice(0, 10)}</p>
                  </div>
                  {c.status === 'HELD' ? (
                    <button disabled={busy === 'ret' + c.id} onClick={() => returnCustody(c.id)}
                      className="shrink-0 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-black rounded-lg px-3 py-1.5 disabled:opacity-50">
                      {busy === 'ret' + c.id ? '…' : (ar ? 'استلام' : 'Return')}
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-bold">{ar ? 'مُعادة' : 'Returned'}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
