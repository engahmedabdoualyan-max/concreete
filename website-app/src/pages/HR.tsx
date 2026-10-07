import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import LangSelector from '../components/LangSelector';
import { useTenant } from '../hooks/useTenant';
import { TREE_ROLES } from '../lib/treeRoles';
import { hashPassword } from '../lib/passwords';
import { loadCompanyTree, saveCompanyTree, saveAppAccount, deleteAppAccount, type CompanyTree } from '../firebase/firestore';
import * as XLSX from 'xlsx';
import { downloadExcel, openPrintPDF, type ExportColumn, type ExportRow } from '../lib/exportReports';

/**
 * HR — منظومة الموارد البشرية (مدير الـHR).
 * Mirrors the Android app's HR home ((hr)/index + attendance) with the same
 * backend: leave/advance requests with approve/reject, team directory,
 * attendance report, broadcasts, payroll runs. Read/write is server-gated
 * (HR_READ / HR_WRITE); every tab degrades independently.
 */

type Tab = 'requests' | 'team' | 'attendance' | 'broadcasts' | 'payroll' | 'actions' | 'investigations' | 'custody' | 'vehicles' | 'deductions' | 'company' | 'petty' | 'leave' | 'vlog' | 'overtime' | 'expenses' | 'modules' | 'org' | 'tree' | 'exit';

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
  IQAMA: 'الإقامة', DRIVING_LICENCE: 'رخصة القيادة', INSURANCE: 'التأمين الطبي', CONTRACT: 'العقد', CUSTODY: 'صورة عهدة', INVESTIGATION: 'ملف تحقيق', OTHER: 'أخرى',
};

const TYPE_AR: Record<string, string> = { LEAVE: 'إجازة', ADVANCE: 'سلفة', SALARY_CONFIRM: 'تعريف راتب', OTHER: 'أخرى' };
const STATUS_AR: Record<string, string> = { PENDING: 'بانتظار', APPROVED: 'مقبول', REJECTED: 'مرفوض', CANCELLED: 'ملغي' };

function nameOf(e: any): string {
  return e.fullName ?? e.full_name ?? e.name ?? e.email ?? e.employeeCode ?? '—';
}

function fmtMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('ar-EG', { maximumFractionDigits: 0 });
}

/** Read an image file as a ≤1MB data URL (shared by upload + camera). */
function readImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('image-only'));
  if (file.size > 1024 * 1024) return Promise.reject(new Error('too-big'));
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Live camera capture modal — for HR desks with a camera attached. */
function CameraModal({ ar, onClose, onCapture }: { ar: boolean; onClose: () => void; onCapture: (dataUrl: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let alive = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-camera');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch {
        if (alive) setError(ar ? 'تعذر فتح الكاميرا — تأكد من السماح بالوصول' : 'Camera unavailable');
      }
    })();
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shoot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, 512 / v.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    onCapture(c.toDataURL('image/jpeg', 0.85));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div className="rounded-2xl border border-white/15 bg-[#0B111E] p-4 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-black text-white mb-2">🎥 {ar ? 'تصوير الموظف' : 'Capture'}</h3>
        {error ? (
          <p className="text-xs text-red-300 font-bold py-4 text-center">{error}</p>
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black aspect-[4/3] object-cover" />
            <div className="flex gap-2 mt-3">
              <button disabled={!ready} onClick={shoot}
                className="flex-1 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-black rounded-lg py-2">
                📸 {ar ? 'التقاط' : 'Capture'}
              </button>
              <button onClick={onClose} className="text-xs text-slate-400 px-3">{ar ? 'إلغاء' : 'Cancel'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function daysUntil(raw: unknown): number | null {
  if (!raw) return null;
  const t = new Date(String(raw)).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 864e5);
}

const DEPTS = ['الإدارة', 'المالية', 'الموارد البشرية', 'المبيعات', 'التشغيل', 'الورشة', 'المخازن', 'المختبر', 'الإنتاج', 'البحث والتطوير'];

/** Department (Arabic UI) → API role keys used by broadcasts audience. */
const DEPT_ROLES: Record<string, string[]> = {
  'الإدارة': ['PLANT_MGR', 'SUPER_ADMIN'],
  'المالية': ['ACCOUNTANT', 'CFO', 'FINANCE'],
  'الموارد البشرية': ['HR_MANAGER', 'HR_OFFICER'],
  'المبيعات': ['SALES_REP', 'REPS_MGR'],
  'التشغيل': ['DRIVER', 'DISPATCHER', 'OPERATIONS_MGR', 'SCHEDULE_MGR'],
  'الورشة': ['MECHANIC', 'WORKSHOP_MECHANIC', 'WORKSHOP_MGR'],
  'المخازن': ['STOREKEEPER'],
  'المختبر': ['LAB_TECH', 'LAB_TECHNICIAN', 'LAB_MGR'],
  'الإنتاج': ['PRODUCTION_MGR', 'BATCH_OP', 'BATCH_OPERATOR', 'STATION_TECH'],
  'البحث والتطوير': ['RND_MANAGER'],
};

function ExportBar({ title, subtitle, fileBase, columns, rows, branding }: {
  title: string; subtitle: string; fileBase: string; columns: ExportColumn[]; rows: ExportRow[];
  branding?: { companyName?: string; logoDataUrl?: string };
}) {
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => openPrintPDF({ title, subtitle: `${subtitle} — ${stamp}`, columns, rows, branding })}
        className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-white/15 bg-white/[0.05] text-slate-200 hover:border-sky-400/60"
      >
        🖨️ طباعة / PDF
      </button>
      <button
        onClick={() => downloadExcel(`${fileBase}-${stamp}`, [{ name: title.slice(0, 31), columns, rows }], branding ? { companyName: branding.companyName, title } : undefined)}
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
  const tenant = useTenant();
  const brandParam = tenant ? { companyName: tenant.companyName, logoDataUrl: tenant.logoUrl ?? undefined } : undefined;
  const canBrand = currentUser?.role === 'PLANT_MGR' || currentUser?.role === 'SUPER_ADMIN';
  const [brandingBusy, setBrandingBusy] = useState(false);

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMsg('❌ صورة فقط');
      return;
    }
    if (file.size > 1024 * 1024) {
      setMsg('❌ الصورة أكبر من 1MB');
      return;
    }
    setBrandingBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await api.put('/api/tenant/branding', { logoData: dataUrl });
      setMsg('✅ تم تحديث شعار الشركة');
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الحفظ'}`);
    } finally {
      setBrandingBusy(false);
    }
  };

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
  const [form, setForm] = useState({ employeeCode: '', fullName: '', nationalId: '', countryCode: '', jobTitle: '', department: '', baseSalarySar: '', housingAllowanceSar: '', transportAllowanceSar: '', bankIban: '', bankName: '', hireDate: '', contactPhone: '', emergencyContactName: '', emergencyContactPhone: '', lastVacationDate: '', lastResumptionDate: '', medicalInsuranceNo: '', medicalInsuranceExpiry: '', vehiclePlate: '', vehicleOwnership: '', iqamaExpiry: '', photoUrl: '' });
  const [actions, setActions] = useState<any[]>([]);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionForm, setActionForm] = useState({ kind: 'PENALTY', employeeId: '', subKind: 'WARNING', amountSar: '', suspensionDays: '', reason: '' });
  const [invs, setInvs] = useState<any[]>([]);
  const [invFilter, setInvFilter] = useState('ALL');
  const [showInvForm, setShowInvForm] = useState(false);
  const [invForm, setInvForm] = useState({ employeeId: '', subject: '', details: '' });
  const [closeNote, setCloseNote] = useState<Record<string, string>>({});
  const [invFiles, setInvFiles] = useState<Record<string, any[]>>({});
  const [invFilesOpen, setInvFilesOpen] = useState<Record<string, boolean>>({});
  const [docsEmp, setDocsEmp] = useState<{ id: string; name: string } | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [custody, setCustody] = useState<any[]>([]);
  const [custodyFilter, setCustodyFilter] = useState('ALL');
  const [showCustodyForm, setShowCustodyForm] = useState(false);
  const [custodyForm, setCustodyForm] = useState({ employeeId: '', item: '', serialNo: '', notes: '' });
  const [docKind, setDocKind] = useState('IQAMA');
  const [docTitle, setDocTitle] = useState('');
  const [uploading, setUploading] = useState(false);

  const printDoc = (d: any) => {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w || !d.storageUrl) return;
    const label = d.title || d.fileName || '';
    const body = /pdf/i.test(d.mimeType ?? '') || /\.pdf$/i.test(d.fileName ?? '')
      ? `<embed src="${d.storageUrl}" type="application/pdf" style="width:100%;height:92vh;" />`
      : `<img src="${d.storageUrl}" style="max-width:100%;" />`;
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${label}</title></head><body style="margin:0;font-family:'Segoe UI',Tahoma;">${body}<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`);
    w.document.close();
  };
  const [fleet, setFleet] = useState<any[]>([]);
  const [editVeh, setEditVeh] = useState<Record<string, { istimara: string; insurance: string; inspection: string }>>({});
  const [vios, setVios] = useState<any[]>([]);
  const [showVioForm, setShowVioForm] = useState(false);
  const [vioForm, setVioForm] = useState({ employeeId: '', vehicleId: '', amountSar: '', violationDate: '', location: '', notes: '' });
  const [dedPeriod, setDedPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [dedRows, setDedRows] = useState<any[]>([]);
  const [dedTotal, setDedTotal] = useState(0);
  const [cdocs, setCdocs] = useState<any[]>([]);
  const [showCdocForm, setShowCdocForm] = useState(false);
  const [cdocForm, setCdocForm] = useState({ title: '', kind: 'COMMERCIAL_REG', expiryDate: '' });
  const [custFiles, setCustFiles] = useState<Record<string, any[]>>({});
  const [custFilesOpen, setCustFilesOpen] = useState<Record<string, boolean>>({});
  const [uploadingCdoc, setUploadingCdoc] = useState(false);

function ageOf(raw: unknown): number | null {
  if (!raw) return null;
  const t = new Date(String(raw)).getTime();
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const n = new Date();
  let age = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) age--;
  return age;
}
  const [uploadingPhoto, setUploadingPhoto] = useState('');
  const [camFor, setCamFor] = useState<{ employeeId: string } | { form: true } | null>(null);

  const usePhotoFile = async (file: File | undefined, target: { employeeId: string } | { form: true }) => {
    if (!file) return;
    try {
      const dataUrl = await readImageFile(file);
      if ('form' in target) {
        setForm((f) => ({ ...f, photoUrl: dataUrl }));
        setMsg('✅ تم اختيار الصورة — احفظ الموظف');
      } else {
        setUploadingPhoto(target.employeeId);
        try {
          await api.put(`/api/hr/employees/${target.employeeId}`, { photoUrl: dataUrl });
          setMsg('✅ تم تحديث الصورة');
          await load();
        } finally {
          setUploadingPhoto('');
        }
      }
    } catch (e: any) {
      const m = e?.message === 'too-big' ? 'الصورة أكبر من 1MB' : e?.message === 'image-only' ? 'صور فقط' : (e?.message ?? 'فشل');
      setMsg(`❌ ${m}`);
    }
  };

  const uploadPhoto = async (employeeId: string, file: File | undefined) => {
    if (!file) return;
    await usePhotoFile(file, { employeeId });
  };
  const [funds, setFunds] = useState<any[]>([]);
  const [showFundForm, setShowFundForm] = useState(false);
  const [fundForm, setFundForm] = useState({ amountReceived: '', receivedDate: '', purpose: '' });
  const [openFund, setOpenFund] = useState<string | null>(null);
  const [fundLines, setFundLines] = useState<any[]>([]);
  const [expForm, setExpForm] = useState({ amountSar: '', expenseDate: '', description: '' });
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{ code: string; datetime: string }[] | null>(null);
  // Login-tree accounts (Android app logins). Second-password gate below is
  // a UI curtain for a sensitive area — writes go through the same Firestore
  // path and rules as the Console, which remain the real enforcement.
  const [treeUnlocked, setTreeUnlocked] = useState(false);
  const [treePass, setTreePass] = useState('');
  const [treeCompany, setTreeCompany] = useState('');
  const [treeAccounts, setTreeAccounts] = useState<any[]>([]);
  const [treeForm, setTreeForm] = useState({ email: '', phone: '', role: '', password: '' });
  const [editingTree, setEditingTree] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const [balances, setBalances] = useState<any[]>([]);
  const [balForm, setBalForm] = useState({ employeeId: '', year: String(new Date().getFullYear()), allocated: '' });
  const [otList, setOtList] = useState<any[]>([]);
  const [otFilter, setOtFilter] = useState('ALL');
  const [showOtForm, setShowOtForm] = useState(false);
  const [otForm, setOtForm] = useState({ employeeId: '', workDate: '', hours: '', rateSar: '', reason: '' });
  const [vlogs, setVlogs] = useState<any[]>([]);
  const [showVlogForm, setShowVlogForm] = useState(false);
  const [vlogForm, setVlogForm] = useState({ vehicleId: '', logDate: '', odometerKm: '', fuelLitres: '', notes: '' });
  const [claims, setClaims] = useState<any[]>([]);
  const [claimFilter, setClaimFilter] = useState('ALL');
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimForm, setClaimForm] = useState({ employeeId: '', kind: 'FUEL', amountSar: '', expenseDate: '', notes: '' });
  const [showCastForm, setShowCastForm] = useState(false);
  const [castForm, setCastForm] = useState({ title: '', body: '' });
  const [castDepts, setCastDepts] = useState<string[]>([]);
  const [runPeriod, setRunPeriod] = useState(() => new Date().toISOString().slice(0, 7));

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
        photoUrl: form.photoUrl || undefined,
      });
      setMsg('✅ تمت إضافة الموظف');
      setForm({ employeeCode: '', fullName: '', nationalId: '', countryCode: '', jobTitle: '', department: '', baseSalarySar: '', housingAllowanceSar: '', transportAllowanceSar: '', bankIban: '', bankName: '', hireDate: '', contactPhone: '', emergencyContactName: '', emergencyContactPhone: '', lastVacationDate: '', lastResumptionDate: '', medicalInsuranceNo: '', medicalInsuranceExpiry: '', vehiclePlate: '', vehicleOwnership: '', iqamaExpiry: '', photoUrl: '' });
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
        title: docKind === 'OTHER' && docTitle.trim() ? docTitle.trim() : undefined,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        fileData: dataUrl,
      });
      setMsg('✅ تم رفع المستند');
      setDocTitle('');
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

  const returnCustody = async (id: string) => {    setBusy('ret' + id);
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

  const saveVehDates = async (id: string) => {
    const f = editVeh[id];
    if (!f) return;
    setBusy('veh' + id);
    try {
      await api.put(`/api/hr/vehicles/${id}/renewals`, {
        istimaraExpiry: f.istimara || null,
        insuranceExpiresAt: f.insurance || null,
        inspectionDueAt: f.inspection || null,
      });
      setMsg('✅ تم حفظ تواريخ التجديد');
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الحفظ'}`);
    } finally {
      setBusy('');
    }
  };

  const addVio = async () => {
    if (!vioForm.employeeId || !vioForm.amountSar.trim()) {
      setMsg('❌ اختر السائق واكتب المبلغ');
      return;
    }
    setBusy('vio');
    setMsg('');
    try {
      await api.post('/api/hr/violations', {
        employeeId: vioForm.employeeId,
        vehicleId: vioForm.vehicleId || undefined,
        amountSar: Number(vioForm.amountSar),
        violationDate: vioForm.violationDate || undefined,
        location: vioForm.location.trim() || undefined,
        notes: vioForm.notes.trim() || undefined,
      });
      setMsg('✅ تم تسجيل المخالفة على السائق');
      setVioForm({ employeeId: '', vehicleId: '', amountSar: '', violationDate: '', location: '', notes: '' });
      setShowVioForm(false);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل التسجيل'}`);
    } finally {
      setBusy('');
    }
  };

  const payVio = async (id: string) => {
    setBusy('pay' + id);
    try {
      await api.post(`/api/hr/violations/${id}/pay`, {});
      setMsg('✅ تم تحصيل المخالفة');
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل التحصيل'}`);
    } finally {
      setBusy('');
    }
  };

  const uploadCustodyPhoto = async (custodyId: string, employeeId: string, file: File | undefined) => {
    if (!file) return;
    if (!/pdf|image/i.test(file.type) && !/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
      setMsg('❌ PDF أو صور فقط');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMsg('❌ الملف أكبر من 8MB');
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
        employeeId, custodyId, kind: 'CUSTODY',
        fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, fileData: dataUrl,
      });
      setMsg('✅ تم إرفاق ملف العهدة');
      try {
        const d = await api.get<{ documents?: any[] }>(`/api/hr/documents?employeeId=${employeeId}&custodyId=${custodyId}`);
        setCustFiles((p) => ({ ...p, [custodyId]: d?.documents ?? [] }));
        setCustFilesOpen((p) => ({ ...p, [custodyId]: true }));
      } catch { /* list stays */ }
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الرفع'}`);
    } finally {
      setUploading(false);
    }
  };

  const toggleCustFiles = async (c: any) => {
    const open = !custFilesOpen[c.id];
    setCustFilesOpen((p) => ({ ...p, [c.id]: open }));
    if (open && c.employeeId && !custFiles[c.id]) {
      try {
        const d = await api.get<{ documents?: any[] }>(`/api/hr/documents?employeeId=${c.employeeId}&custodyId=${c.id}`);
        setCustFiles((p) => ({ ...p, [c.id]: d?.documents ?? [] }));
      } catch { setCustFiles((p) => ({ ...p, [c.id]: [] })); }
    }
  };

  const uploadCdoc = async (file: File | undefined) => {
    if (!file) return;
    if (!cdocForm.title.trim()) {
      setMsg('❌ اكتب اسم الملف أولاً');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMsg('❌ الملف أكبر من 8MB');
      return;
    }
    if (!/pdf|image/i.test(file.type) && !/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
      setMsg('❌ PDF أو صور فقط');
      return;
    }
    setUploadingCdoc(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await api.post('/api/hr/company-docs', {
        title: cdocForm.title.trim(),
        kind: cdocForm.kind,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        expiryDate: cdocForm.expiryDate || undefined,
        fileData: dataUrl,
      });
      setMsg('✅ تم حفظ الورقة');
      setCdocForm({ title: '', kind: 'COMMERCIAL_REG', expiryDate: '' });
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الحفظ'}`);
    } finally {
      setUploadingCdoc(false);
    }
  };

  const deleteCdoc = async (id: string) => {
    if (!window.confirm('حذف هذه الورقة؟')) return;
    try {
      await api.del(`/api/hr/company-docs?id=${id}`);
      setMsg('✅ تم الحذف');
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الحذف'}`);
    }
  };

  const loadFundLines = async (fundId: string) => {
    setOpenFund(openFund === fundId ? null : fundId);
    if (openFund === fundId) return;
    try {
      const r = await api.get<{ expenses?: any[] }>(`/api/hr/petty-cash?fundId=${fundId}`);
      setFundLines(Array.isArray(r?.expenses) ? r.expenses : []);
    } catch { setFundLines([]); }
  };

  const openFund_ = async () => {
    if (!fundForm.amountReceived.trim() || !fundForm.receivedDate) {
      setMsg('❌ المبلغ والتاريخ مطلوبان');
      return;
    }
    setBusy('fund');
    try {
      await api.post('/api/hr/petty-cash', {
        amountReceived: Number(fundForm.amountReceived),
        receivedDate: fundForm.receivedDate,
        purpose: fundForm.purpose.trim() || undefined,
      });
      setMsg('✅ تم فتح العهدة المالية');
      setFundForm({ amountReceived: '', receivedDate: '', purpose: '' });
      setShowFundForm(false);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الفتح'}`);
    } finally {
      setBusy('');
    }
  };

  const spendLine = async (fundId: string) => {
    if (!expForm.amountSar.trim() || !expForm.expenseDate || !expForm.description.trim()) {
      setMsg('❌ المبلغ والتاريخ والبيان مطلوبة');
      return;
    }
    setBusy('spend');
    try {
      await api.put(`/api/hr/petty-cash?id=${fundId}&action=spend`, {
        amountSar: Number(expForm.amountSar),
        expenseDate: expForm.expenseDate,
        description: expForm.description.trim(),
      });
      setMsg('✅ تم تسجيل الصرف');
      setExpForm({ amountSar: '', expenseDate: '', description: '' });
      await load();
      const r = await api.get<{ expenses?: any[] }>(`/api/hr/petty-cash?fundId=${fundId}`);
      setFundLines(Array.isArray(r?.expenses) ? r.expenses : []);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل التسجيل'}`);
    } finally {
      setBusy('');
    }
  };

  const settleFund = async (fundId: string) => {
    if (!window.confirm('تصفية العهدة نهائياً؟')) return;
    setBusy('settle' + fundId);
    try {
      const r = await api.put<{ settleNote?: string }>(`/api/hr/petty-cash?id=${fundId}&action=settle`, {});
      setMsg(`✅ ${(r as any)?.settleNote ?? 'تمت التصفية'}`);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل التصفية'}`);
    } finally {
      setBusy('');
    }
  };

  /** Parse a fingerprint/Excel export into {code, datetime} rows. Handles
   *  Arabic + English headers (كود/code/id, تاريخ/date, وقت/time) and
   *  headerless files (col0=code, col1=date, col2=time?). */
  const parseImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setImportPreview(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('empty');
      const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' }) as unknown[][];
      const norm = (v: unknown) => String(v ?? '').trim();
      const isCodeH = (s: string) => /^(كود|الكود|code|id|emp|موظف|رقم)/i.test(s);
      const isDateH = (s: string) => /(تاريخ|date|يوم|day)/i.test(s);
      const isTimeH = (s: string) => /(وقت|time|ساعة)/i.test(s);
      let start = 0;
      let ci = 0;
      let di = 1;
      let ti = 2;
      const head = grid[0].map(norm);
      if (head.some((h) => isCodeH(h) || isDateH(h))) {
        start = 1;
        head.forEach((h, i) => {
          if (isCodeH(h)) ci = i;
          else if (isDateH(h)) di = i;
          else if (isTimeH(h)) ti = i;
        });
        if (!head.some(isTimeH)) ti = -1;
      } else {
        ti = grid[0].length > 2 ? 2 : -1;
      }
      const cellDate = (v: unknown): string => {
        if (v instanceof Date && !Number.isNaN(+v)) return v.toISOString();
        const s = norm(v).replace(/\//g, '-');
        const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
        return Number.isNaN(+d) ? '' : d.toISOString();
      };
      const out: { code: string; datetime: string }[] = [];
      for (const row of grid.slice(start)) {
        const code = norm(row[ci]);
        if (!code) continue;
        let dt = cellDate(row[di]);
        if (!dt) continue;
        if (ti >= 0 && norm(row[ti])) {
          const t = norm(row[ti]);
          const base = dt.slice(0, 10);
          const full = new Date(`${base}T${t.length <= 5 ? t + ':00' : t}`);
          if (!Number.isNaN(+full)) dt = full.toISOString();
        }
        out.push({ code, datetime: dt });
        if (out.length >= 2000) break;
      }
      if (out.length === 0) throw new Error('empty');
      setImportPreview(out);
      setMsg(`📄 ${out.length} ${ar ? 'بصمة جاهزة للمراجعة' : 'punches ready to review'}`);
    } catch {
      setMsg('❌ تعذر قراءة الملف — CSV أو Excel بأعمدة الكود والتاريخ');
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = async () => {
    if (!importPreview?.length) return;
    setImporting(true);
    try {
      const res = await api.post<{ imported?: number; filled?: number; skippedUnknown?: string[]; days?: number }>('/api/hr/attendance/import', {
        rows: importPreview,
      });
      setMsg(`✅ ${ar ? 'استيراد' : 'Imported'}: ${res?.imported ?? 0} ${ar ? 'يوم' : 'days'} + ${res?.filled ?? 0} ${ar ? 'استكمال' : 'filled'}${(res?.skippedUnknown?.length ?? 0) ? ` — ⚠️ ${ar ? 'غير معروف' : 'unknown'}: ${(res?.skippedUnknown ?? []).slice(0, 5).join('، ')}` : ''}`);
      setImportPreview(null);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الاستيراد'}`);
    } finally {
      setImporting(false);
    }
  };

  const unlockTree = () => {
    if (treePass.trim() === '01001006627') {
      setTreeUnlocked(true);
      setTreePass('');
      setMsg('✅ تم فتح حسابات الدخول');
      const def = tenant?.code?.toLowerCase?.() ?? '';
      if (def && !treeCompany) {
        setTreeCompany(def);
        loadTree(def);
      }
    } else {
      setMsg('❌ الرقم غير صحيح');
    }
  };

  const loadTree = async (company?: string) => {
    const uname = (company ?? treeCompany).trim().toLowerCase();
    if (!uname) {
      setMsg('❌ اكتب اسم الشركة');
      return;
    }
    setBusy('tree');
    try {
      const t: CompanyTree | null = await loadCompanyTree(uname);
      setTreeAccounts(Array.isArray(t?.accounts) ? t.accounts : []);
      if (!t) setMsg('ℹ️ لا شجرة بهذا الاسم — احفظ حساباً لإنشائها');
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل التحميل'}`);
    } finally {
      setBusy('');
    }
  };

  const saveTreeAccount = async () => {
    const loginId = (treeForm.email || treeForm.phone).trim().toLowerCase();
    if (!treeCompany.trim() || !loginId || !treeForm.role) {
      setMsg('❌ الشركة والحساب والدور مطلوبة');
      return;
    }
    setBusy('treesave');
    try {
      const roleDef = TREE_ROLES.find((r) => r.key === treeForm.role);
      const prev = editingTree !== null ? treeAccounts[editingTree] : null;
      const passwordHash =
        treeForm.password.trim() !== ''
          ? await hashPassword(loginId, treeForm.password.trim())
          : prev?.passwordHash || '';
      const acc = {
        email: treeForm.email.trim().toLowerCase() || loginId,
        phone: treeForm.phone.trim(),
        role: treeForm.role,
        roleAr: roleDef?.ar ?? treeForm.role,
        permissions: roleDef?.perms ?? [],
        mods: roleDef?.mods ?? [],
        password: '',
        passwordHash,
        truck: prev?.truck ?? '',
        gps: prev?.gps ?? '',
      };
      const next = [...treeAccounts];
      if (editingTree !== null) next[editingTree] = { ...prev, ...acc };
      else next.push(acc);
      const uname = treeCompany.trim().toLowerCase();
      await saveCompanyTree({ companyUsername: uname, accounts: next } as CompanyTree);
      await saveAppAccount({
        username: loginId,
        password: '',
        passwordHash,
        plantName: uname,
        phone: acc.phone,
        email: acc.email,
        status: 'APP_ACCOUNT',
        role: acc.role,
        roleAr: acc.roleAr,
        permissions: acc.permissions,
        mods: acc.mods,
      } as any);
      setMsg('✅ تم الحفظ');
      setTreeForm({ email: '', phone: '', role: '', password: '' });
      setEditingTree(null);
      setTreeAccounts(next);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الحفظ'}`);
    } finally {
      setBusy('');
    }
  };

  const delTreeAccount = async (idx: number) => {
    const acc = treeAccounts[idx];
    if (!acc) return;
    if (!window.confirm(`حذف ${acc.email || acc.phone}؟`)) return;
    setBusy('treedel' + idx);
    try {
      const next = treeAccounts.filter((_, i) => i !== idx);
      await saveCompanyTree({ companyUsername: treeCompany.trim().toLowerCase(), accounts: next } as CompanyTree);
      await deleteAppAccount(acc.email || acc.phone || '');
      setMsg('✅ تم الحذف');
      setTreeAccounts(next);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الحذف'}`);
    } finally {
      setBusy('');
    }
  };

  const saveBalance = async () => {
    if (!balForm.employeeId || !balForm.allocated.trim()) {
      setMsg('❌ اختر الموظف واكتب الرصيد');
      return;
    }
    setBusy('bal');
    try {
      await api.put('/api/hr/leave-balances', {
        employeeId: balForm.employeeId,
        year: Number(balForm.year) || new Date().getFullYear(),
        allocated: Number(balForm.allocated),
      });
      setMsg('✅ تم تحديد الرصيد');
      setBalForm({ employeeId: '', year: String(new Date().getFullYear()), allocated: '' });
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الحفظ'}`);
    } finally {
      setBusy('');
    }
  };

  const addOt = async () => {
    if (!otForm.employeeId || !otForm.hours.trim() || !otForm.workDate) {
      setMsg('❌ الموظف والساعات والتاريخ مطلوبة');
      return;
    }
    setBusy('ot');
    try {
      await api.post('/api/hr/overtime', {
        employeeId: otForm.employeeId,
        workDate: otForm.workDate,
        hours: Number(otForm.hours),
        rateSar: otForm.rateSar.trim() === '' ? undefined : Number(otForm.rateSar),
        reason: otForm.reason.trim() || undefined,
      });
      setMsg('✅ تم تسجيل الساعات');
      setOtForm({ employeeId: '', workDate: '', hours: '', rateSar: '', reason: '' });
      setShowOtForm(false);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل التسجيل'}`);
    } finally {
      setBusy('');
    }
  };

  const reviewOt = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setBusy('otr' + id);
    try {
      await api.put(`/api/hr/overtime?id=${id}&decision=${decision}`, {});
      setMsg(decision === 'APPROVED' ? '✅ تم الاعتماد' : 'تم الرفض');
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل'}`);
    } finally {
      setBusy('');
    }
  };

  const addVlog = async () => {
    if (!vlogForm.vehicleId || !vlogForm.logDate) {
      setMsg('❌ اختر المركبة والتاريخ');
      return;
    }
    setBusy('vlog');
    try {
      await api.post('/api/hr/vehicle-logs', {
        vehicleId: vlogForm.vehicleId,
        logDate: vlogForm.logDate,
        odometerKm: vlogForm.odometerKm.trim() === '' ? undefined : Number(vlogForm.odometerKm),
        fuelLitres: vlogForm.fuelLitres.trim() === '' ? undefined : Number(vlogForm.fuelLitres),
        notes: vlogForm.notes.trim() || undefined,
      });
      setMsg('✅ تم تسجيل القراءة');
      setVlogForm({ vehicleId: '', logDate: '', odometerKm: '', fuelLitres: '', notes: '' });
      setShowVlogForm(false);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل التسجيل'}`);
    } finally {
      setBusy('');
    }
  };

  const addClaim = async () => {
    if (!claimForm.employeeId || !claimForm.amountSar.trim() || !claimForm.expenseDate) {
      setMsg('❌ الموظف والمبلغ والتاريخ مطلوبة');
      return;
    }
    setBusy('claim');
    try {
      await api.post('/api/hr/expenses', {
        employeeId: claimForm.employeeId,
        kind: claimForm.kind,
        amountSar: Number(claimForm.amountSar),
        expenseDate: claimForm.expenseDate,
        notes: claimForm.notes.trim() || undefined,
      });
      setMsg('✅ تم تقديم المطالبة');
      setClaimForm({ employeeId: '', kind: 'FUEL', amountSar: '', expenseDate: '', notes: '' });
      setShowClaimForm(false);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل التقديم'}`);
    } finally {
      setBusy('');
    }
  };

  const reviewClaim = async (id: string, decision: 'APPROVED' | 'REJECTED' | 'PAID') => {
    setBusy('clr' + id);
    try {
      await api.put(`/api/hr/expenses?id=${id}&decision=${decision}`, {});
      setMsg('✅ تم');
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل'}`);
    } finally {
      setBusy('');
    }
  };

  const toggleModule = async (key: string) => {
    const next = { ...modules, [key]: !(modules[key] !== false) };
    setModules(next);
    if (next[key] === false) {
      const tabMod: Record<string, string> = { requests: 'requests', team: 'team', attendance: 'attendance', broadcasts: 'broadcasts', payroll: 'payroll', actions: 'actions', investigations: 'investigations', custody: 'custody', vehicles: 'vehicles', deductions: 'deductions', company: 'company', petty: 'petty', leave: 'leaveBalances', vlog: 'vehicleLog', overtime: 'overtime', expenses: 'expenses', org: 'org', tree: 'tree' };
      if (tabMod[tab] === key) {
        const fallback = (['requests', 'team', 'leave', 'vlog', 'overtime', 'expenses', 'attendance', 'broadcasts', 'payroll', 'actions', 'investigations', 'custody', 'vehicles', 'deductions', 'company', 'petty', 'org', 'tree'] as Tab[]).find((t) => (tabMod[t] ? next[tabMod[t]] !== false : true));
        if (fallback) setTab(fallback);
      }
    }
    try {
      await api.put('/api/hr/settings', { modules: { [key]: next[key] } });
      setMsg(next[key] ? '✅ تم تفعيل الوحدة' : '⏸ تم إيقاف الوحدة');
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الحفظ'}`);
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

  const closeInv = async (id: string) => {    setBusy('close' + id);
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

  const toggleInvFiles = async (inv: any) => {
    const open = !invFilesOpen[inv.id];
    setInvFilesOpen((p) => ({ ...p, [inv.id]: open }));
    if (open && inv.employeeId && !invFiles[inv.id]) {
      try {
        const d = await api.get<{ documents?: any[] }>(`/api/hr/documents?employeeId=${inv.employeeId}`);
        setInvFiles((p) => ({ ...p, [inv.id]: (d?.documents ?? []).filter((x) => x.investigationId === inv.id) }));
      } catch { setInvFiles((p) => ({ ...p, [inv.id]: [] })); }
    }
  };

  const uploadInvDoc = async (inv: any, file: File | undefined) => {
    if (!file || !inv.employeeId) return;
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
        employeeId: inv.employeeId, investigationId: inv.id, kind: 'INVESTIGATION',
        fileName: file.name, mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size, fileData: dataUrl,
      });
      setMsg('✅ تم إرفاق الملف بالتحقيق وملف الموظف');
      try {
        const d = await api.get<{ documents?: any[] }>(`/api/hr/documents?employeeId=${inv.employeeId}`);
        setInvFiles((p) => ({ ...p, [inv.id]: (d?.documents ?? []).filter((x) => x.investigationId === inv.id) }));
        setInvFilesOpen((p) => ({ ...p, [inv.id]: true }));
      } catch { /* list stays */ }
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الرفع'}`);
    } finally {
      setUploading(false);
    }
  };

  const publishCast = async () => {
    if (!castForm.title.trim() || !castForm.body.trim()) {
      setMsg('❌ العنوان والنص مطلوبان');
      return;
    }
    setBusy('cast');
    setMsg('');
    try {
      const audience = [...new Set(castDepts.flatMap((d) => DEPT_ROLES[d] ?? []))];
      await api.post('/api/hr/broadcasts', {
        title: castForm.title.trim(),
        body: castForm.body.trim(),
        ...(audience.length ? { audience } : {}),
      });
      setMsg(`✅ تم النشر ${audience.length ? `لـ ${castDepts.join('، ')}` : 'لكل الإدارات'}`);
      setCastForm({ title: '', body: '' });
      setCastDepts([]);
      setShowCastForm(false);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل النشر'}`);
    } finally {
      setBusy('');
    }
  };

  const createRun = async () => {
    if (!/^\d{4}-\d{2}$/.test(runPeriod)) {
      setMsg('❌ الشهر بصيغة YYYY-MM');
      return;
    }
    setBusy('run');
    setMsg('');
    try {
      await api.post('/api/hr/payroll/runs', { period: runPeriod });
      setMsg(`✅ تم إنشاء مسير ${runPeriod} كمسودة`);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل الإنشاء'}`);
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
    try {
      const fl = await api.get<{ vehicles?: any[] }>('/api/hr/vehicles');
      setFleet(Array.isArray(fl?.vehicles) ? fl.vehicles : []);
    } catch { setFleet([]); }
    try {
      const vi = await api.get<{ violations?: any[] }>('/api/hr/violations');
      setVios(Array.isArray(vi?.violations) ? vi.violations : []);
    } catch { setVios([]); }
    try {
      const dd = await api.get<{ rows?: any[]; grandTotal?: number }>(`/api/hr/deductions?period=${dedPeriod}`);
      setDedRows(Array.isArray(dd?.rows) ? dd.rows : []);
      setDedTotal(dd?.grandTotal ?? 0);
    } catch { setDedRows([]); setDedTotal(0); }
    try {
      const cd = await api.get<{ documents?: any[] }>('/api/hr/company-docs');
      setCdocs(Array.isArray(cd?.documents) ? cd.documents : []);
    } catch { setCdocs([]); }
    try {
      const pf = await api.get<{ funds?: any[] }>('/api/hr/petty-cash');
      setFunds(Array.isArray(pf?.funds) ? pf.funds : []);
    } catch { setFunds([]); }
    try {
      const st = await api.get<{ modules?: Record<string, boolean> }>('/api/hr/settings');
      if (st?.modules) setModules((m) => ({ ...m, ...st.modules }));
    } catch { /* defaults stay on */ }
    try {
      const lb = await api.get<{ balances?: any[] }>('/api/hr/leave-balances');
      setBalances(Array.isArray(lb?.balances) ? lb.balances : []);
    } catch { setBalances([]); }
    try {
      const ot = await api.get<{ overtime?: any[] }>(`/api/hr/overtime${otFilter === 'ALL' ? '' : `?status=${otFilter}`}`);
      setOtList(Array.isArray(ot?.overtime) ? ot.overtime : []);
    } catch { setOtList([]); }
    try {
      const vl = await api.get<{ logs?: any[] }>('/api/hr/vehicle-logs');
      setVlogs(Array.isArray(vl?.logs) ? vl.logs : []);
    } catch { setVlogs([]); }
    try {
      const ec = await api.get<{ claims?: any[] }>(`/api/hr/expenses${claimFilter === 'ALL' ? '' : `?status=${claimFilter}`}`);
      setClaims(Array.isArray(ec?.claims) ? ec.claims : []);
    } catch { setClaims([]); }
  }, [filter, fromDate, toDate, actionFilter, invFilter, custodyFilter, dedPeriod, otFilter, claimFilter]);

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

  const [modules, setModules] = useState<Record<string, boolean>>({ leaveBalances: true, vehicleLog: true, overtime: true, expenses: true });

  const tabs: Array<{ id: Tab; ar: string; en: string; mod?: string }> = [
    { id: 'requests', ar: '📥 الطلبات', en: 'Requests', mod: 'requests' },
    { id: 'team', ar: '👥 فريق العمل', en: 'Team', mod: 'team' },
    { id: 'attendance', ar: '🕐 الحضور', en: 'Attendance', mod: 'attendance' },
    { id: 'broadcasts', ar: '📢 الإعلانات', en: 'Broadcasts', mod: 'broadcasts' },
    { id: 'payroll', ar: '💰 الرواتب', en: 'Payroll', mod: 'payroll' },
    { id: 'actions', ar: '⚖️ الجزاءات والمكافآت', en: 'Actions', mod: 'actions' },
    { id: 'investigations', ar: '🔍 التحقيقات', en: 'Investigations', mod: 'investigations' },
    { id: 'custody', ar: '🎒 العهد', en: 'Custody', mod: 'custody' },
    { id: 'vehicles', ar: '🚛 المركبات والمخالفات', en: 'Vehicles', mod: 'vehicles' },
    { id: 'deductions', ar: '🧾 كشف الخصومات', en: 'Deductions', mod: 'deductions' },
    { id: 'company', ar: '📂 أوراق الشركة', en: 'Company docs', mod: 'company' },
    { id: 'petty', ar: '💰 العهدة المالية', en: 'Petty cash', mod: 'petty' },
    { id: 'org', ar: '🏢 الهيكل الوظيفي', en: 'Org chart', mod: 'org' },
    { id: 'tree', ar: '🌳 حسابات الدخول', en: 'Login tree', mod: 'tree' },
    { id: 'leave', ar: '🏖️ الأرصدة', en: 'Balances', mod: 'leaveBalances' },
    { id: 'vlog', ar: '⛽ سجل المركبات', en: 'Logbook', mod: 'vehicleLog' },
    { id: 'overtime', ar: '⏰ الإضافي', en: 'Overtime', mod: 'overtime' },
    { id: 'expenses', ar: '🧾 المصاريف', en: 'Expenses', mod: 'expenses' },
    { id: 'modules', ar: '⚙️ الوحدات', en: 'Modules' },
  ];

  const MOD_AR: Record<string, string> = {
    requests: 'الطلبات', team: 'فريق العمل', attendance: 'الحضور والتقارير',
    broadcasts: 'الإعلانات', payroll: 'الرواتب', actions: 'الجزاءات والمكافآت',
    investigations: 'التحقيقات', custody: 'العهد', vehicles: 'المركبات والمخالفات',
    deductions: 'كشف الخصومات', company: 'أوراق الشركة', petty: 'العهدة المالية',
    leaveBalances: 'أرصدة الإجازات', vehicleLog: 'سجل المركبات', overtime: 'الأجر الإضافي',
    expenses: 'مطالبات المصاريف', org: 'الهيكل الوظيفي', tree: 'حسابات الدخول',
  };

  const team = employees.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [e.fullName, e.full_name, e.email, e.employeeCode, e.phone, e.department].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  // Vehicle paperwork watch (istimara / insurance / inspection ≤ 60 days).
  const vehWatch = fleet
    .flatMap((v) => ([
      { code: `${v.vehicleCode}`, label: ar ? 'الاستمارة' : 'Reg', days: daysUntil(v.istimaraExpiry) },
      { code: `${v.vehicleCode}`, label: ar ? 'التأمين' : 'Ins', days: daysUntil(v.insuranceExpiresAt) },
      { code: `${v.vehicleCode}`, label: ar ? 'الفحص' : 'Insp', days: daysUntil(v.inspectionDueAt) },
    ]))
    .filter((w): w is { code: string; label: string; days: number } => w.days !== null && w.days <= 60)
    .sort((a, b) => a.days - b.days);

  // Company papers watch (expiry ≤ 60 days).
  const cdocWatch = cdocs
    .map((d) => ({ ...d, days: daysUntil(d.expiryDate) }))
    .filter((d) => d.days !== null && d.days <= 60)
    .sort((a, b) => (a.days as number) - (b.days as number));

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
          <div className="flex items-center gap-3">
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.companyName} className="w-12 h-12 rounded-xl object-contain bg-white p-1 shadow-lg shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-xl shrink-0">🏢</div>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white">
                {tenant?.companyName ?? (ar ? 'الموارد البشرية' : 'Human Resources')}
              </h1>
              {tenant?.plantName && (
                <p className="text-xs text-sky-300 font-bold mt-0.5">🏭 {tenant.plantName}</p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                {ar ? 'الموارد البشرية • طلبات الإجازات والسلف • فريق العمل • الحضور • الإعلانات • الرواتب' : 'HR • Leave & advances • team • attendance • broadcasts • payroll'}
              </p>
              {canBrand && (
                <label className={`inline-block mt-1 text-[11px] font-black rounded-lg px-2 py-1 border cursor-pointer ${brandingBusy ? 'opacity-50' : 'border-white/15 bg-white/[0.05] text-slate-300 hover:border-sky-400/60'}`}>
                  🖼️ {brandingBusy ? '…' : (ar ? 'تغيير شعار الشركة' : 'Change logo')}
                  <input type="file" accept="image/*" className="hidden" disabled={brandingBusy}
                    onChange={(e) => { uploadLogo(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 text-[11px] font-black text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2.5 py-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> {ar ? 'مباشر' : 'LIVE'}
            </span>
            <span className="text-center leading-tight">
              <span className="block text-xs font-mono font-black text-slate-200">
                {now.toLocaleTimeString(ar ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="block text-[10px] text-slate-400">
                {now.toLocaleDateString(ar ? 'ar-EG' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </span>
            <LangSelector />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {tabs.filter((t) => !t.mod || modules[t.mod] !== false).map((t) => (
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
                branding={brandParam}
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
                branding={brandParam}
                rows={team.map((e) => ({
                  name: nameOf(e), code: e.employeeCode ?? '',
                  title: e.role ?? e.jobTitle ?? '', dept: e.department ?? '',
                }))}
              />
            </div>
            {showAdd && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4 mb-3">
                <h3 className="text-sm font-black text-white mb-3">➕ {ar ? 'بيانات الموظف الجديد' : 'New employee'}</h3>
                <div className="flex items-center gap-3 mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                  {form.photoUrl ? (
                    <img src={form.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover border border-sky-500/40" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xl">👤</div>
                  )}
                  <div className="flex gap-2">
                    <label className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-white/15 bg-white/[0.05] text-slate-200 cursor-pointer hover:border-sky-400/60">
                      📁 {ar ? 'رفع صورة' : 'Upload'}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { usePhotoFile(e.target.files?.[0], { form: true }); e.target.value = ''; }} />
                    </label>
                    <button type="button" onClick={() => setCamFor({ form: true })}
                      className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25">
                      🎥 {ar ? 'تصوير' : 'Camera'}
                    </button>
                  </div>
                </div>
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
                  <div className="relative shrink-0">
                    {e.photoUrl ? (
                      <img src={e.photoUrl} alt={nameOf(e)} className="w-11 h-11 rounded-full object-cover border border-sky-500/40" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-lg font-black text-sky-300">
                        {(nameOf(e) || '?').trim().charAt(0)}
                      </div>
                    )}
                    {e.id && (
                      <>
                        <label title={ar ? 'رفع الصورة' : 'Upload photo'}
                          className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-white text-[10px] flex items-center justify-center cursor-pointer shadow hover:scale-110 transition">
                          {uploadingPhoto === e.id ? '…' : '📷'}
                          <input type="file" accept="image/*" className="hidden" disabled={!!uploadingPhoto}
                            onChange={(ev) => { uploadPhoto(e.id, ev.target.files?.[0]); ev.target.value = ''; }} />
                        </label>
                        <button title={ar ? 'تصوير بالكاميرا' : 'Camera'}
                          onClick={() => setCamFor({ employeeId: e.id })}
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-sky-500 text-[10px] flex items-center justify-center shadow hover:scale-110 transition">
                          🎥
                        </button>
                      </>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-white truncate">{nameOf(e)}{ageOf(e.dateOfBirth) !== null ? <span className="text-[10px] font-bold text-slate-400"> · {ageOf(e.dateOfBirth)} {ar ? 'سنة' : 'y'}</span> : null}</p>
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
                    <span className="font-bold text-slate-200">{d.title ?? DOC_KIND_AR[d.kind] ?? d.kind} · {d.fileName}</span>
                    {d.storageUrl ? (
                      <span className="flex gap-2 shrink-0">
                        <button onClick={() => printDoc(d)} className="text-slate-300 font-black hover:text-white">🖨️ {ar ? 'طباعة' : 'Print'}</button>
                        <a href={d.storageUrl} download={d.fileName} className="text-emerald-300 font-black">⬇ {ar ? 'تنزيل' : 'Save'}</a>
                        <a href={d.storageUrl} target="_blank" rel="noreferrer" className="text-sky-400 font-black">{ar ? 'فتح' : 'Open'}</a>
                      </span>
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
                  {docKind === 'OTHER' && (
                    <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
                      placeholder={ar ? '✏️ اسم الملف (مثال: شهادة خبرة)' : 'File name'}
                      className="flex-1 min-w-[140px] bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
                  )}
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
              <label className={`text-[11px] font-black rounded-lg px-3 py-1.5 border cursor-pointer ${importing ? 'opacity-50' : 'border-violet-500/50 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25'}`}>
                📤 {importing ? '…' : (ar ? 'استيراد بصمة / إكسل' : 'Import')}
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" disabled={importing}
                  onChange={(e) => { parseImportFile(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
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
                branding={brandParam}
                rows={attRows.map((r) => ({
                  name: r.fullName ?? r.name ?? '',
                  date: r.workDate ?? r.date ?? '',
                  hours: typeof r.minutesWorked === 'number' ? `${Math.floor(r.minutesWorked / 60)}h ${r.minutesWorked % 60}m` : (r.hours ?? ''),
                }))}
              />
            </div>
            {attRows.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا سجلات حضور.' : 'No attendance records.'}</p>}
            {importPreview && (
              <div className="rounded-2xl border border-violet-500/40 bg-violet-500/[0.07] p-3 mb-3">
                <p className="text-xs font-black text-violet-200 mb-1">
                  📄 {importPreview.length} {ar ? 'بصمة — أول 5 للمراجعة:' : 'punches, first 5:'}
                </p>
                {importPreview.slice(0, 5).map((p, i) => (
                  <p key={i} className="text-[11px] text-slate-300 font-mono">{p.code} · {p.datetime.slice(0, 16).replace('T', ' ')}</p>
                ))}
                <div className="flex gap-2 mt-2">
                  <button disabled={importing} onClick={confirmImport}
                    className="text-[11px] font-black rounded-lg px-4 py-1.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white">
                    {importing ? '…' : `✅ ${ar ? 'تأكيد الاستيراد' : 'Confirm'}`}
                  </button>
                  <button onClick={() => setImportPreview(null)} className="text-[11px] text-slate-400 px-2">{ar ? 'إلغاء' : 'Cancel'}</button>
                </div>
              </div>
            )}
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
            <button onClick={() => setShowCastForm((v) => !v)}
              className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25">
              ➕ {ar ? 'إعلان جديد' : 'New broadcast'}
            </button>
            {showCastForm && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4">
                <input value={castForm.title} onChange={(e) => setCastForm({ ...castForm, title: e.target.value })}
                  placeholder={ar ? 'عنوان الإعلان *' : 'Title *'}
                  className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none mb-2" />
                <textarea value={castForm.body} onChange={(e) => setCastForm({ ...castForm, body: e.target.value })} rows={3}
                  placeholder={ar ? 'نص الإعلان *' : 'Body *'}
                  className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
                <div className="mt-2">
                  <p className="text-[11px] text-slate-400 font-bold mb-1">{ar ? 'التوجيه إلى:' : 'Target:'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setCastDepts([])}
                      className={`text-[11px] font-black rounded-lg px-3 py-1 border ${castDepts.length === 0 ? 'bg-sky-500 text-white border-sky-400' : 'text-slate-400 border-white/10'}`}>
                      {ar ? '🌍 كل الإدارات' : 'All'}
                    </button>
                    {DEPTS.map((d) => {
                      const on = castDepts.includes(d);
                      return (
                        <button type="button" key={d} onClick={() => setCastDepts((p) => (on ? p.filter((x) => x !== d) : [...p, d]))}
                          className={`text-[11px] font-black rounded-lg px-3 py-1 border ${on ? 'bg-sky-500 text-white border-sky-400' : 'text-slate-400 border-white/10'}`}>
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button disabled={busy === 'cast'} onClick={publishCast}
                  className="mt-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
                  {busy === 'cast' ? '…' : `📢 ${ar ? 'نشر' : 'Publish'}`}
                </button>
              </div>
            )}
            {casts.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا إعلانات.' : 'No broadcasts.'}</p>}
            {casts.map((b, i) => (
              <div key={b.id ?? i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-white">{b.title ?? b.subject ?? (ar ? 'إعلان' : 'Broadcast')}</p>
                  <span className="text-[10px] text-slate-400 font-bold shrink-0">
                    {Array.isArray(b.audience) && b.audience.length
                      ? `🎯 ${[...new Set(b.audience.flatMap((r: string) => Object.entries(DEPT_ROLES).filter(([, roles]) => roles.includes(r)).map(([d]) => d)))].join('، ') || b.audience.join(', ')}`
                      : `🌍 ${ar ? 'الكل' : 'All'}`}
                  </span>
                </div>
                {(b.body ?? b.message) && <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap">{b.body ?? b.message}</p>}
                <p className="text-[10px] text-slate-500 mt-1">{b.createdAt ?? b.created_at ?? ''}</p>
              </div>
            ))}
          </div>
        )}

        {/* ===== payroll ===== */}
        {tab === 'payroll' && (
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <span className="text-[11px] text-slate-400 font-bold">{ar ? 'مسير شهر (YYYY-MM)' : 'Run month'}</span>
              <input value={runPeriod} onChange={(e) => setRunPeriod(e.target.value)}
                className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none font-mono" />
              <button disabled={busy === 'run'} onClick={createRun}
                className="text-[11px] font-black rounded-lg px-4 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 disabled:opacity-50">
                {busy === 'run' ? '…' : `➕ ${ar ? 'إنشاء مسير كمسودة' : 'Draft run'}`}
              </button>
            </div>
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
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <button onClick={() => toggleInvFiles(v)}
                      className="text-[11px] font-black rounded-lg px-3 py-1 border border-white/15 bg-white/[0.05] text-slate-200 hover:border-sky-400/60">
                      📎 {ar ? 'ملفات التحقيق' : 'Files'}{Array.isArray(invFiles[v.id]) ? ` (${invFiles[v.id].length})` : ''}
                    </button>
                    {v.employeeId && (
                      <label className={`text-[11px] font-black rounded-lg px-3 py-1 border cursor-pointer ${uploading ? 'opacity-50' : 'border-sky-500/50 bg-sky-500/15 text-sky-300'}`}>
                        ⬆ {uploading ? '…' : (ar ? 'رفع ملف PDF/صورة' : 'Upload')}
                        <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploading}
                          onChange={(e) => { uploadInvDoc(v, e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                    )}
                  </div>
                  {invFilesOpen[v.id] && (
                    <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.02] p-2">
                      {(invFiles[v.id] ?? []).length === 0 && <p className="text-[10px] text-slate-500">{ar ? 'لا ملفات مرفقة.' : 'No files.'}</p>}
                      {(invFiles[v.id] ?? []).map((d, di) => (
                        <div key={d.id ?? di} className="flex items-center justify-between text-[11px] py-0.5">
                          <span className="text-slate-300">{d.fileName}</span>
                          <a href={d.storageUrl} target="_blank" rel="noreferrer" className="text-sky-400 font-black">⬇ {ar ? 'فتح' : 'Open'}</a>
                        </div>
                      ))}
                      <p className="text-[10px] text-slate-500 mt-1">{ar ? 'تظهر نفس الملفات في لوحة مستندات الموظف.' : 'Also listed in the employee file.'}</p>
                    </div>
                  )}
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
                <div key={c.id ?? i} className={`rounded-xl border px-3 py-2 text-xs ${c.status === 'HELD' ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-transparent opacity-60'}`}>
                  <div className="flex items-center justify-between w-full">
                  <div>
                    <span className="font-black text-white">🎒 {c.item}</span>
                    <p className="text-slate-400 mt-0.5">{[c.serialNo, c.notes].filter(Boolean).join(' · ')}</p>
                    <p className="text-slate-500 text-[10px]">{String(c.handedAt ?? '').slice(0, 10)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleCustFiles(c)} title={ar ? 'صور وأوراق العهدة' : 'Files'}
                      className="text-[11px] font-black rounded-lg px-2 py-1.5 border border-white/15 bg-white/[0.04] text-slate-200 hover:border-sky-400/60">
                      📎{Array.isArray(custFiles[c.id]) ? ` ${custFiles[c.id].length}` : ''}
                    </button>
                    {c.status === 'HELD' && c.employeeId && (
                      <label title={ar ? 'رفع صورة / PDF' : 'Upload'}
                        className="text-base rounded-lg border border-white/10 bg-white/[0.04] w-9 h-9 flex items-center justify-center cursor-pointer hover:border-sky-400/60">
                        ⬆
                        <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploading}
                          onChange={(e) => { uploadCustodyPhoto(c.id, c.employeeId, e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                    )}
                    {c.status === 'HELD' ? (
                      <button disabled={busy === 'ret' + c.id} onClick={() => returnCustody(c.id)}
                        className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-black rounded-lg px-3 py-1.5 disabled:opacity-50">
                        {busy === 'ret' + c.id ? '…' : (ar ? 'استلام' : 'Return')}
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-bold">{ar ? 'مُعادة' : 'Returned'}</span>
                    )}
                  </div>
                  </div>
                  {custFilesOpen[c.id] && (
                    <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.02] p-2">
                      {(custFiles[c.id] ?? []).length === 0 && <p className="text-[10px] text-slate-500">{ar ? 'لا ملفات مرفقة.' : 'No files.'}</p>}
                      {(custFiles[c.id] ?? []).map((d, di) => (
                        <div key={d.id ?? di} className="flex items-center justify-between text-[11px] py-0.5">
                          <span className="text-slate-300">{d.fileName}</span>
                          <a href={d.storageUrl} target="_blank" rel="noreferrer" className="text-sky-400 font-black">⬇ {ar ? 'فتح' : 'Open'}</a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== vehicles: renewals + violations ===== */}
        {tab === 'vehicles' && (
          <div className="mt-4">
            {vehWatch.length > 0 && (
              <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/[0.07] p-3 mb-3">
                <h3 className="text-xs font-black text-yellow-300 mb-2">
                  ⏰ {ar ? `تجديدات المركبات القادمة (${vehWatch.length})` : `Vehicle renewals due (${vehWatch.length})`}
                </h3>
                {vehWatch.slice(0, 8).map((w, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b border-white/5 py-1 last:border-0">
                    <span className="font-bold text-slate-200">{w.code} · {w.label}</span>
                    <span className={`font-black ${w.days < 0 ? 'text-red-400' : w.days <= 30 ? 'text-yellow-300' : 'text-slate-300'}`}>
                      {w.days < 0 ? (ar ? `منتهية منذ ${-w.days} يوم` : `expired ${-w.days}d`) : (ar ? `متبقي ${w.days} يوم` : `${w.days}d left`)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button onClick={() => setShowVioForm((v) => !v)}
                className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-red-500/50 bg-red-500/15 text-red-300 hover:bg-red-500/25">
                ➕ {ar ? 'تسجيل مخالفة على سائق' : 'Record violation'}
              </button>
            </div>
            {showVioForm && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4 mb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'السائق *' : 'Driver *'}
                    <select value={vioForm.employeeId} onChange={(e) => setVioForm({ ...vioForm, employeeId: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="">—</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{nameOf(e)} · {e.employeeCode}</option>)}
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'المركبة' : 'Vehicle'}
                    <select value={vioForm.vehicleId} onChange={(e) => setVioForm({ ...vioForm, vehicleId: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="">—</option>
                      {fleet.map((v) => <option key={v.id} value={v.id}>{v.vehicleCode} · {v.plateNumber}</option>)}
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'المبلغ (ر.س) *' : 'Amount *'}
                    <input value={vioForm.amountSar} onChange={(e) => setVioForm({ ...vioForm, amountSar: e.target.value })} inputMode="decimal"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'تاريخ المخالفة' : 'Date'}
                    <input type="date" value={vioForm.violationDate} onChange={(e) => setVioForm({ ...vioForm, violationDate: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'المكان' : 'Location'}
                    <input value={vioForm.location} onChange={(e) => setVioForm({ ...vioForm, location: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'ملاحظات' : 'Notes'}
                    <input value={vioForm.notes} onChange={(e) => setVioForm({ ...vioForm, notes: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                </div>
                <button disabled={busy === 'vio'} onClick={addVio}
                  className="mt-3 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
                  {busy === 'vio' ? '…' : `✅ ${ar ? 'تسجيل' : 'Record'}`}
                </button>
              </div>
            )}
            {vios.length > 0 && (
              <div className="mb-3">
                <h3 className="text-xs font-black text-slate-300 mb-1">{ar ? 'المخالفات المسجلة' : 'Recorded violations'}</h3>
                <div className="space-y-1">
                  {vios.slice(0, 10).map((v, i) => (
                    <div key={v.id ?? i} className="flex items-center justify-between text-xs border-b border-white/5 py-1">
                      <span className="text-slate-300">{v.amountSar} {ar ? 'ر.س' : 'SAR'} · {String(v.violationDate ?? '').slice(0, 10)} {v.location ? `· ${v.location}` : ''}</span>
                      {v.paid ? (
                        <span className="text-[10px] text-emerald-300 font-bold">{ar ? 'مدفوعة' : 'Paid'}</span>
                      ) : (
                        <button disabled={busy === 'pay' + v.id} onClick={() => payVio(v.id)}
                          className="text-[10px] font-black rounded px-2 py-1 border border-emerald-500/40 text-emerald-300 disabled:opacity-50">
                          {busy === 'pay' + v.id ? '…' : (ar ? 'تحصيل' : 'Collect')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {fleet.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا مركبات.' : 'No vehicles.'}</p>}
            <div className="space-y-2">
              {fleet.map((v, i) => {
                const f = editVeh[v.id];
                return (
                  <div key={v.id ?? i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-white">🚛 {v.vehicleCode} · {v.plateNumber}</span>
                      <span className="text-slate-400">{v.driverName ?? (ar ? 'بدون سائق' : 'No driver')}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                      {([['istimara', 'الاستمارة', v.istimaraExpiry], ['insurance', 'التأمين', v.insuranceExpiresAt], ['inspection', 'الفحص', v.inspectionDueAt]] as const).map(([k, label, cur]) => (
                        <label key={k} className="text-[10px] text-slate-400 font-bold">{label} {cur ? `(${String(cur).slice(0, 10)})` : ''}
                          <span className="flex gap-1 mt-0.5">
                            <input type="date"
                              value={f?.[k] ?? ''}
                              onChange={(e) => setEditVeh((p) => ({ ...p, [v.id]: Object.assign({ istimara: '', insurance: '', inspection: '' }, p[v.id], { [k]: e.target.value }) }))}
                              className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none" />
                          </span>
                        </label>
                      ))}
                    </div>
                    <button disabled={busy === 'veh' + v.id} onClick={() => saveVehDates(v.id)}
                      className="mt-2 text-[11px] font-black rounded-lg px-4 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 disabled:opacity-50">
                      {busy === 'veh' + v.id ? '…' : (ar ? 'حفظ التواريخ' : 'Save dates')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== deductions: monthly statement ===== */}
        {tab === 'deductions' && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الشهر' : 'Month'}</label>
              <input value={dedPeriod} onChange={(e) => setDedPeriod(e.target.value)}
                className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none font-mono" />
              <ExportBar
                title={ar ? 'كشف الخصومات' : 'Deductions'}
                subtitle={dedPeriod}
                fileBase={`hr-deductions-${dedPeriod}`}
                columns={[
                  { header: 'الموظف', key: 'name' },
                  { header: 'الكود', key: 'code' },
                  { header: 'جزاءات', key: 'penalties' },
                  { header: 'مخالفات', key: 'violations' },
                  { header: 'سلف', key: 'advances' },
                  { header: 'الإجمالي', key: 'total' },
                ]}
                rows={dedRows.map((r) => ({ name: r.name, code: r.code, penalties: r.penalties, violations: r.violations, advances: r.advances, total: r.total }))}
                branding={brandParam}
              />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 mb-3 text-center">
              <p className="text-[11px] text-slate-400 font-bold">{ar ? 'إجمالي خصومات الشهر (ر.س)' : 'Month total (SAR)'}</p>
              <p className="text-2xl font-black text-white">{fmtMoney(dedTotal)}</p>
            </div>
            {dedRows.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا خصومات هذا الشهر.' : 'No deductions this month.'}</p>}
            <div className="space-y-1">
              {dedRows.map((r, i) => (
                <div key={r.employeeId ?? i} className="flex items-center justify-between text-xs border-b border-white/5 py-1.5">
                  <span className="font-bold text-slate-200">{r.name} <span className="text-slate-500">· {r.code}</span></span>
                  <span className="text-slate-400 text-[10px]">{ar ? 'جزاء' : 'P'} {r.penalties} · {ar ? 'مخالفات' : 'V'} {r.violations} · {ar ? 'سلف' : 'A'} {r.advances}</span>
                  <span className="font-black text-red-300">{fmtMoney(r.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== company docs vault ===== */}
        {tab === 'company' && (
          <div className="mt-4">
            <button onClick={() => setShowCdocForm((v) => !v)}
              className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 mb-3">
              ➕ {ar ? 'إضافة ورقة (سجل / ضريبة / ملف عامل…)' : 'Add paper'}
            </button>
            {showCdocForm && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4 mb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'اسم الملف *' : 'Title *'}
                    <input value={cdocForm.title} onChange={(e) => setCdocForm({ ...cdocForm, title: e.target.value })}
                      placeholder={ar ? 'مثال: السجل التجاري 2026' : 'e.g. Commercial reg 2026'}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'النوع' : 'Kind'}
                    <select value={cdocForm.kind} onChange={(e) => setCdocForm({ ...cdocForm, kind: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="COMMERCIAL_REG">{ar ? '📜 سجل تجاري' : 'Commercial reg'}</option>
                      <option value="TAX">{ar ? '🧾 ضريبة' : 'Tax'}</option>
                      <option value="EMPLOYEE_FILE">{ar ? '👤 ملف عامل' : 'Employee file'}</option>
                      <option value="LICENSE">{ar ? '📄 رخصة' : 'License'}</option>
                      <option value="OTHER">{ar ? 'أخرى' : 'Other'}</option>
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'تاريخ الانتهاء (للتنبيه)' : 'Expiry (watch)'}
                    <input type="date" value={cdocForm.expiryDate} onChange={(e) => setCdocForm({ ...cdocForm, expiryDate: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <div className="text-[11px] text-slate-400 font-bold">{ar ? 'الملف (PDF/صورة حتى 8MB)' : 'File'}
                    <label className={`block mt-0.5 text-center text-[11px] font-black rounded-lg px-3 py-1.5 border cursor-pointer ${uploadingCdoc ? 'opacity-50' : 'border-sky-500/50 bg-sky-500/15 text-sky-300'}`}>
                      📎 {uploadingCdoc ? '…' : (ar ? 'اختر الملف' : 'Choose file')}
                      <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploadingCdoc}
                        onChange={(e) => { uploadCdoc(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                  </div>
                </div>
              </div>
            )}
            {cdocWatch.length > 0 && (
              <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/[0.07] p-3 mb-3">
                <h3 className="text-xs font-black text-yellow-300 mb-2">⏰ {ar ? 'تجديدات أوراق الشركة' : 'Paper renewals'}</h3>
                {cdocWatch.slice(0, 8).map((d, i) => (
                  <div key={d.id ?? i} className="flex items-center justify-between text-xs border-b border-white/5 py-1 last:border-0">
                    <span className="font-bold text-slate-200">{d.title}</span>
                    <span className={`font-black ${d.days < 0 ? 'text-red-400' : 'text-yellow-300'}`}>
                      {d.days < 0 ? (ar ? `منتهية منذ ${-d.days} يوم` : `expired`) : (ar ? `متبقي ${d.days} يوم` : `${d.days}d`)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {cdocs.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا أوراق محفوظة.' : 'Vault is empty.'}</p>}
            <div className="space-y-1">
              {cdocs.map((d, i) => (
                <div key={d.id ?? i} className="flex items-center justify-between text-xs border-b border-white/5 py-1.5">
                  <span className="font-bold text-slate-200">{d.title} <span className="text-slate-500">· {d.fileName}{d.expiryDate ? ` · ${ar ? 'ينتهي' : 'exp'} ${String(d.expiryDate).slice(0, 10)}` : ''}</span></span>
                  <span className="flex gap-2 shrink-0">
                    <a href={d.storageUrl} target="_blank" rel="noreferrer" className="text-sky-400 font-black">⬇ {ar ? 'فتح' : 'Open'}</a>
                    <button onClick={() => deleteCdoc(d.id)} className="text-red-400 font-black">{ar ? 'حذف' : 'Del'}</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== petty cash: department financial custody ===== */}
        {tab === 'petty' && (
          <div className="mt-4">
            <button onClick={() => setShowFundForm((v) => !v)}
              className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 mb-3">
              ➕ {ar ? 'فتح عهدة مالية للقسم' : 'Open fund'}
            </button>
            {showFundForm && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4 mb-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'المبلغ المستلم (ر.س) *' : 'Received *'}
                    <input value={fundForm.amountReceived} onChange={(e) => setFundForm({ ...fundForm, amountReceived: e.target.value })} inputMode="decimal"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'تاريخ الاستلام *' : 'Date *'}
                    <input type="date" value={fundForm.receivedDate} onChange={(e) => setFundForm({ ...fundForm, receivedDate: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الغرض' : 'Purpose'}
                    <input value={fundForm.purpose} onChange={(e) => setFundForm({ ...fundForm, purpose: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                </div>
                <button disabled={busy === 'fund'} onClick={openFund_}
                  className="mt-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
                  {busy === 'fund' ? '…' : `✅ ${ar ? 'فتح' : 'Open'}`}
                </button>
              </div>
            )}
            {funds.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا عهد مالية.' : 'No funds.'}</p>}
            <div className="space-y-3">
              {funds.map((f, i) => (
                <div key={f.id ?? i} className={`rounded-2xl border p-3 ${f.status === 'OPEN' ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 opacity-70'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-black text-white">💰 {f.department} · {f.amountReceived} {ar ? 'ر.س' : 'SAR'}</span>
                    <span className="text-slate-400">{ar ? 'مصروف' : 'Spent'} <b className="text-yellow-300">{f.spent}</b> · {ar ? 'متبقي' : 'Left'} <b className="text-emerald-300">{f.remaining}</b></span>
                    <span className="flex gap-1">
                      {f.status === 'OPEN' ? (
                        <>
                          <button onClick={() => loadFundLines(f.id)}
                            className="text-[10px] font-black rounded px-2 py-1 border border-white/15 text-slate-200">
                            {openFund === f.id ? (ar ? 'إخفاء الصرف' : 'Hide') : (ar ? 'جدول الصرف' : 'Ledger')}
                          </button>
                          <button disabled={busy === 'settle' + f.id} onClick={() => settleFund(f.id)}
                            className="text-[10px] font-black rounded px-2 py-1 border border-emerald-500/40 text-emerald-300 disabled:opacity-50">
                            {busy === 'settle' + f.id ? '…' : (ar ? 'تصفية' : 'Settle')}
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-bold">✅ {f.settleNote ?? (ar ? 'مصفّاة' : 'Settled')}</span>
                      )}
                    </span>
                  </div>
                  {openFund === f.id && f.status === 'OPEN' && (
                    <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] p-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                        <label className="text-[10px] text-slate-400 font-bold">{ar ? 'المبلغ *' : 'Amount *'}
                          <input value={expForm.amountSar} onChange={(e) => setExpForm({ ...expForm, amountSar: e.target.value })} inputMode="decimal"
                            className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none" /></label>
                        <label className="text-[10px] text-slate-400 font-bold">{ar ? 'التاريخ *' : 'Date *'}
                          <input type="date" value={expForm.expenseDate} onChange={(e) => setExpForm({ ...expForm, expenseDate: e.target.value })}
                            className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none" /></label>
                        <label className="text-[10px] text-slate-400 font-bold">{ar ? 'البيان *' : 'Description *'}
                          <input value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })}
                            className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none" /></label>
                      </div>
                      <button disabled={busy === 'spend'} onClick={() => spendLine(f.id)}
                        className="text-[10px] font-black rounded-lg px-3 py-1 border border-sky-500/50 bg-sky-500/15 text-sky-300 disabled:opacity-50">
                        {busy === 'spend' ? '…' : `➕ ${ar ? 'تسجيل صرف' : 'Spend'}`}
                      </button>
                      <div className="mt-2 space-y-1">
                        {fundLines.map((l, j) => (
                          <div key={l.id ?? j} className="flex items-center justify-between text-[11px] border-b border-white/5 py-1">
                            <span className="text-slate-300">{l.description}</span>
                            <span className="text-slate-400">{String(l.expenseDate).slice(0, 10)} · <b className="text-white">{l.amountSar}</b></span>
                          </div>
                        ))}
                        {fundLines.length === 0 && <p className="text-[10px] text-slate-500">{ar ? 'لا صرف بعد.' : 'No spending yet.'}</p>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== leave balances ===== */}
        {tab === 'leave' && (
          <div className="mt-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 mb-3 flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الموظف' : 'Employee'}
                <select value={balForm.employeeId} onChange={(e) => setBalForm({ ...balForm, employeeId: e.target.value })}
                  className="mt-0.5 block bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none min-w-[160px]">
                  <option value="">—</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{nameOf(e)} · {e.employeeCode}</option>)}
                </select></label>
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'السنة' : 'Year'}
                <input value={balForm.year} onChange={(e) => setBalForm({ ...balForm, year: e.target.value })} inputMode="numeric"
                  className="mt-0.5 block w-24 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الرصيد السنوي (يوم)' : 'Allocated'}
                <input value={balForm.allocated} onChange={(e) => setBalForm({ ...balForm, allocated: e.target.value })} inputMode="decimal"
                  className="mt-0.5 block w-28 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
              <button disabled={busy === 'bal'} onClick={saveBalance}
                className="text-[11px] font-black rounded-lg px-4 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 disabled:opacity-50">
                {busy === 'bal' ? '…' : (ar ? 'تحديد الرصيد' : 'Set')}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mb-2">{ar ? 'قبول طلب إجازة يخصم من الرصيد تلقائياً (قد يظهر بالسالب = تجاوز).' : 'Approving leave auto-deducts.'}</p>
            {balances.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا أرصدة مسجلة.' : 'No balances.'}</p>}
            <div className="space-y-1">
              {balances.slice(0, 60).map((b, i) => {
                const left = Number(b.allocated ?? 0) - Number(b.used ?? 0);
                return (
                  <div key={b.id ?? i} className="flex items-center justify-between text-xs border-b border-white/5 py-1.5">
                    <span className="font-bold text-slate-200">{b.year} · {left} {ar ? 'متبقي' : 'left'}</span>
                    <span className={`font-black ${left < 0 ? 'text-red-400' : 'text-emerald-300'}`}>
                      {ar ? 'المستخدم' : 'Used'} {b.used} / {b.allocated}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== vehicle logbook ===== */}
        {tab === 'vlog' && (
          <div className="mt-4">
            <button onClick={() => setShowVlogForm((v) => !v)}
              className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 mb-3">
              ➕ {ar ? 'تسجيل قراءة (عداد / وقود)' : 'Log reading'}
            </button>
            {showVlogForm && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4 mb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'المركبة *' : 'Vehicle *'}
                    <select value={vlogForm.vehicleId} onChange={(e) => setVlogForm({ ...vlogForm, vehicleId: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="">—</option>
                      {fleet.map((v) => <option key={v.id} value={v.id}>{v.vehicleCode} · {v.plateNumber}</option>)}
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'التاريخ *' : 'Date *'}
                    <input type="date" value={vlogForm.logDate} onChange={(e) => setVlogForm({ ...vlogForm, logDate: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'العداد (كم)' : 'Odometer'}
                    <input value={vlogForm.odometerKm} onChange={(e) => setVlogForm({ ...vlogForm, odometerKm: e.target.value })} inputMode="decimal"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الوقود (لتر)' : 'Fuel (L)'}
                    <input value={vlogForm.fuelLitres} onChange={(e) => setVlogForm({ ...vlogForm, fuelLitres: e.target.value })} inputMode="decimal"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold sm:col-span-2">{ar ? 'ملاحظات' : 'Notes'}
                    <input value={vlogForm.notes} onChange={(e) => setVlogForm({ ...vlogForm, notes: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                </div>
                <button disabled={busy === 'vlog'} onClick={addVlog}
                  className="mt-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
                  {busy === 'vlog' ? '…' : `✅ ${ar ? 'تسجيل' : 'Log'}`}
                </button>
              </div>
            )}
            {vlogs.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا قراءات.' : 'No readings.'}</p>}
            <div className="space-y-1">
              {vlogs.slice(0, 40).map((l, i) => (
                <div key={l.id ?? i} className="flex items-center justify-between text-xs border-b border-white/5 py-1.5">
                  <span className="font-bold text-slate-200">{String(l.logDate).slice(0, 10)}</span>
                  <span className="text-slate-400">{l.odometerKm ? `${l.odometerKm} كم` : ''} {l.fuelLitres ? `· ⛽ ${l.fuelLitres} لتر` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== overtime ===== */}
        {tab === 'overtime' && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex gap-2">
                {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((f) => (
                  <button key={f} onClick={() => setOtFilter(f)}
                    className={`text-[11px] font-black rounded-lg px-3 py-1.5 border ${otFilter === f ? 'bg-white text-black border-white' : 'text-slate-400 border-white/10'}`}>
                    {f === 'ALL' ? (ar ? 'الكل' : 'All') : f === 'PENDING' ? (ar ? 'بانتظار' : 'Pending') : f === 'APPROVED' ? (ar ? 'معتمد' : 'Approved') : (ar ? 'مرفوض' : 'Rejected')}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowOtForm((v) => !v)}
                className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25">
                ➕ {ar ? 'تسجيل ساعات' : 'Log hours'}
              </button>
            </div>
            {showOtForm && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4 mb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الموظف *' : 'Employee *'}
                    <select value={otForm.employeeId} onChange={(e) => setOtForm({ ...otForm, employeeId: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="">—</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{nameOf(e)} · {e.employeeCode}</option>)}
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'التاريخ *' : 'Date *'}
                    <input type="date" value={otForm.workDate} onChange={(e) => setOtForm({ ...otForm, workDate: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الساعات *' : 'Hours *'}
                    <input value={otForm.hours} onChange={(e) => setOtForm({ ...otForm, hours: e.target.value })} inputMode="decimal"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'سعر الساعة (ر.س)' : 'Rate'}
                    <input value={otForm.rateSar} onChange={(e) => setOtForm({ ...otForm, rateSar: e.target.value })} inputMode="decimal"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold sm:col-span-2">{ar ? 'السبب' : 'Reason'}
                    <input value={otForm.reason} onChange={(e) => setOtForm({ ...otForm, reason: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                </div>
                <button disabled={busy === 'ot'} onClick={addOt}
                  className="mt-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
                  {busy === 'ot' ? '…' : `✅ ${ar ? 'تسجيل' : 'Log'}`}
                </button>
              </div>
            )}
            {otList.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا ساعات مسجلة.' : 'None.'}</p>}
            <div className="space-y-1">
              {otList.slice(0, 40).map((o, i) => (
                <div key={o.id ?? i} className="flex items-center justify-between text-xs border-b border-white/5 py-1.5">
                  <span className="font-bold text-slate-200">{o.hours}h · {String(o.workDate).slice(0, 10)} {o.rateSar ? `· ${o.rateSar} ر.س/س` : ''}</span>
                  {o.status === 'PENDING' ? (
                    <span className="flex gap-1">
                      <button disabled={busy === 'otr' + o.id} onClick={() => reviewOt(o.id, 'APPROVED')}
                        className="text-[10px] font-black rounded px-2 py-1 border border-emerald-500/40 text-emerald-300 disabled:opacity-50">✓</button>
                      <button disabled={busy === 'otr' + o.id} onClick={() => reviewOt(o.id, 'REJECTED')}
                        className="text-[10px] font-black rounded px-2 py-1 border border-red-500/40 text-red-300 disabled:opacity-50">✕</button>
                    </span>
                  ) : (
                    <span className={`text-[10px] font-bold ${o.status === 'APPROVED' ? 'text-emerald-300' : 'text-slate-500'}`}>{o.status}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== expenses ===== */}
        {tab === 'expenses' && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex gap-2">
                {['ALL', 'PENDING', 'APPROVED', 'PAID'].map((f) => (
                  <button key={f} onClick={() => setClaimFilter(f)}
                    className={`text-[11px] font-black rounded-lg px-3 py-1.5 border ${claimFilter === f ? 'bg-white text-black border-white' : 'text-slate-400 border-white/10'}`}>
                    {f === 'ALL' ? (ar ? 'الكل' : 'All') : f === 'PENDING' ? (ar ? 'بانتظار' : 'Pending') : f === 'APPROVED' ? (ar ? 'معتمدة' : 'Approved') : (ar ? 'مدفوعة' : 'Paid')}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowClaimForm((v) => !v)}
                className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25">
                ➕ {ar ? 'مطالبة جديدة' : 'New claim'}
              </button>
            </div>
            {showClaimForm && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4 mb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الموظف *' : 'Employee *'}
                    <select value={claimForm.employeeId} onChange={(e) => setClaimForm({ ...claimForm, employeeId: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="">—</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{nameOf(e)} · {e.employeeCode}</option>)}
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'النوع' : 'Kind'}
                    <select value={claimForm.kind} onChange={(e) => setClaimForm({ ...claimForm, kind: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                      <option value="FUEL">{ar ? '⛽ وقود' : 'Fuel'}</option>
                      <option value="TOLL">{ar ? '🛣️ رسوم' : 'Toll'}</option>
                      <option value="PARTS">{ar ? '🔧 قطع' : 'Parts'}</option>
                      <option value="OTHER">{ar ? 'أخرى' : 'Other'}</option>
                    </select></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'المبلغ (ر.س) *' : 'Amount *'}
                    <input value={claimForm.amountSar} onChange={(e) => setClaimForm({ ...claimForm, amountSar: e.target.value })} inputMode="decimal"
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'التاريخ *' : 'Date *'}
                    <input type="date" value={claimForm.expenseDate} onChange={(e) => setClaimForm({ ...claimForm, expenseDate: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  <label className="text-[11px] text-slate-400 font-bold sm:col-span-2">{ar ? 'ملاحظات' : 'Notes'}
                    <input value={claimForm.notes} onChange={(e) => setClaimForm({ ...claimForm, notes: e.target.value })}
                      className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                </div>
                <button disabled={busy === 'claim'} onClick={addClaim}
                  className="mt-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
                  {busy === 'claim' ? '…' : `✅ ${ar ? 'تقديم' : 'File'}`}
                </button>
              </div>
            )}
            {claims.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا مطالبات.' : 'None.'}</p>}
            <div className="space-y-1">
              {claims.slice(0, 40).map((c, i) => (
                <div key={c.id ?? i} className="flex items-center justify-between text-xs border-b border-white/5 py-1.5">
                  <span className="font-bold text-slate-200">{c.amountSar} {ar ? 'ر.س' : 'SAR'} · {String(c.expenseDate).slice(0, 10)} {c.notes ? `· ${c.notes}` : ''}</span>
                  {c.status === 'PENDING' ? (
                    <span className="flex gap-1">
                      <button disabled={busy === 'clr' + c.id} onClick={() => reviewClaim(c.id, 'APPROVED')}
                        className="text-[10px] font-black rounded px-2 py-1 border border-emerald-500/40 text-emerald-300 disabled:opacity-50">✓</button>
                      <button disabled={busy === 'clr' + c.id} onClick={() => reviewClaim(c.id, 'REJECTED')}
                        className="text-[10px] font-black rounded px-2 py-1 border border-red-500/40 text-red-300 disabled:opacity-50">✕</button>
                    </span>
                  ) : c.status === 'APPROVED' ? (
                    <button disabled={busy === 'clr' + c.id} onClick={() => reviewClaim(c.id, 'PAID')}
                      className="text-[10px] font-black rounded px-2 py-1 border border-sky-500/40 text-sky-300 disabled:opacity-50">
                      {busy === 'clr' + c.id ? '…' : (ar ? 'دفع' : 'Pay')}
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-bold">{c.status}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== modules toggles ===== */}
        {tab === 'modules' && (
          <div className="mt-4 max-w-xl">
            <p className="text-xs text-slate-400 mb-3">{ar ? 'شغّل الوحدات حسب نظام شركتك — المطفأة لا تظهر تبويباتها.' : 'Enable units per company policy.'}</p>
            {Object.entries(MOD_AR).map(([k, label]) => {
              const on = modules[k] !== false;
              return (
                <div key={k} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 mb-2">
                  <span className="text-sm font-black text-white">{label}</span>
                  <button onClick={() => toggleModule(k)}
                    className={`w-12 h-6 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-white/10'}`}>
                    <span className={`block w-5 h-5 rounded-full bg-white mt-0.5 transition ${on ? 'mr-0.5 ml-auto' : 'ml-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== org chart: company → departments → people ===== */}
        {tab === 'org' && (
          <div className="mt-4">
            <div className="flex flex-col items-center">
              <div className="rounded-2xl border border-sky-500/50 bg-sky-500/10 px-6 py-3 text-center shadow-[0_0_25px_rgba(56,189,248,0.25)]">
                {tenant?.logoUrl && <img src={tenant.logoUrl} alt="" className="w-10 h-10 rounded-lg object-contain bg-white p-0.5 mx-auto mb-1" />}
                <p className="text-base font-black text-white">{tenant?.companyName ?? (ar ? 'الشركة' : 'Company')}</p>
                <p className="text-[11px] text-slate-400">{employees.length} {ar ? 'موظف' : 'employees'}</p>
              </div>
              <div className="w-px h-6 bg-sky-500/40" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 w-full">
                {(() => {
                  const groups = new Map<string, any[]>();
                  for (const e of employees) {
                    const d = e.department || (ar ? 'بدون قسم' : 'Unassigned');
                    if (!groups.has(d)) groups.set(d, []);
                    groups.get(d)!.push(e);
                  }
                  const ordered = [...DEPTS.filter((d) => groups.has(d)), ...[...groups.keys()].filter((d) => !DEPTS.includes(d))];
                  return ordered.map((d) => (
                    <div key={d} className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                      <div className="bg-white/[0.05] border-b border-white/10 px-3 py-2 flex items-center justify-between">
                        <span className="text-xs font-black text-sky-300">{d}</span>
                        <span className="text-[10px] font-black text-slate-400 bg-white/10 rounded-full px-2 py-0.5">{groups.get(d)!.length}</span>
                      </div>
                      <div className="p-2 space-y-1.5 max-h-[320px] overflow-y-auto">
                        {(groups.get(d) ?? []).map((e, i) => (
                          <div key={e.id ?? i} className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-2 py-1.5">
                            <div className="w-7 h-7 shrink-0 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-xs font-black text-sky-300">
                              {(nameOf(e) || '?').trim().charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-black text-white truncate">{nameOf(e)}</p>
                              <p className="text-[10px] text-slate-500 truncate">{e.jobTitle ?? e.role ?? e.employeeCode ?? ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
              {employees.length === 0 && <p className="text-xs text-slate-500 mt-3">{ar ? 'لا بيانات فريق.' : 'No team data.'}</p>}
            </div>
          </div>
        )}

        {/* ===== login tree: Android app accounts (second-password gate) ===== */}
        {tab === 'tree' && (
          <div className="mt-4">
            {!treeUnlocked ? (
              <div className="max-w-md rounded-2xl border border-yellow-500/40 bg-yellow-500/[0.06] p-5">
                <h3 className="text-sm font-black text-yellow-300">🔒 {ar ? 'منطقة حساسة — أدخل الرقم الثاني' : 'Restricted area'}</h3>
                <p className="text-[11px] text-slate-400 mt-1">{ar ? 'حسابات دخول الأندرويد — للموارد البشرية فقط.' : 'Android login accounts.'}</p>
                <div className="flex gap-2 mt-3">
                  <input value={treePass} onChange={(e) => setTreePass(e.target.value)} inputMode="tel"
                    onKeyDown={(e) => { if (e.key === 'Enter') unlockTree(); }}
                    placeholder={ar ? 'الرقم الثاني' : 'Second password'}
                    className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
                  <button onClick={unlockTree} className="text-[11px] font-black rounded-lg px-4 py-1.5 bg-yellow-500/20 border border-yellow-500/50 text-yellow-200">
                    {ar ? 'فتح' : 'Unlock'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الشركة' : 'Company'}
                    <input value={treeCompany} onChange={(e) => setTreeCompany(e.target.value)}
                      className="mt-0.5 block bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none min-w-[160px]" /></label>
                  <button disabled={busy === 'tree'} onClick={() => loadTree()}
                    className="self-end text-[11px] font-black rounded-lg px-4 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 disabled:opacity-50">
                    {busy === 'tree' ? '…' : (ar ? 'تحميل الحسابات' : 'Load')}
                  </button>
                  <button onClick={() => { setTreeForm({ email: '', phone: '', role: '', password: '' }); setEditingTree(null); }}
                    className="self-end text-[11px] font-black rounded-lg px-3 py-1.5 border border-white/15 text-slate-300">
                    ➕ {ar ? 'حساب جديد' : 'New'}
                  </button>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 mb-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الإيميل / الدخول' : 'Login'}
                      <input value={treeForm.email} onChange={(e) => setTreeForm({ ...treeForm, email: e.target.value })}
                        className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                    <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الجوال' : 'Phone'}
                      <input value={treeForm.phone} onChange={(e) => setTreeForm({ ...treeForm, phone: e.target.value })} inputMode="tel"
                        className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                    <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الدور' : 'Role'}
                      <select value={treeForm.role} onChange={(e) => setTreeForm({ ...treeForm, role: e.target.value })}
                        className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                        <option value="">—</option>
                        {TREE_ROLES.map((r) => <option key={r.key} value={r.key}>{r.ar}</option>)}
                      </select></label>
                    <label className="text-[11px] text-slate-400 font-bold">{ar ? 'كلمة سر جديدة (فاضية = إبقاء)' : 'New password'}
                      <input type="password" value={treeForm.password} onChange={(e) => setTreeForm({ ...treeForm, password: e.target.value })}
                        className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
                  </div>
                  <button disabled={busy === 'treesave'} onClick={saveTreeAccount}
                    className="mt-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
                    {busy === 'treesave' ? '…' : `✅ ${editingTree !== null ? (ar ? 'حفظ التعديل' : 'Save') : (ar ? 'إضافة' : 'Add')}`}
                  </button>
                </div>
                {treeAccounts.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا حسابات.' : 'No accounts.'}</p>}
                <div className="space-y-1">
                  {treeAccounts.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs border-b border-white/5 py-1.5">
                      <span className="font-bold text-slate-200">{a.email || a.phone} <span className="text-slate-500">· {a.roleAr ?? a.role}</span></span>
                      <span className="flex gap-1 shrink-0">
                        <button onClick={() => { setEditingTree(i); setTreeForm({ email: a.email ?? '', phone: a.phone ?? '', role: a.role ?? '', password: '' }); }}
                          className="text-[10px] font-black rounded px-2 py-1 border border-sky-500/40 text-sky-300">✏️</button>
                        <button disabled={busy === 'treedel' + i} onClick={() => delTreeAccount(i)}
                          className="text-[10px] font-black rounded px-2 py-1 border border-red-500/40 text-red-300 disabled:opacity-50">🗑️</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {camFor && (
        <CameraModal
          ar={ar}
          onClose={() => setCamFor(null)}
          onCapture={(dataUrl) => {
            if ('form' in camFor) {
              setForm((f) => ({ ...f, photoUrl: dataUrl }));
              setMsg('✅ تم التقاط الصورة — احفظ الموظف');
            } else {
              setUploadingPhoto(camFor.employeeId);
              api.put(`/api/hr/employees/${camFor.employeeId}`, { photoUrl: dataUrl })
                .then(() => {
                  setMsg('✅ تم تحديث الصورة');
                  return load();
                })
                .catch((e: any) => setMsg(`❌ ${e?.message ?? 'فشل الحفظ'}`))
                .finally(() => setUploadingPhoto(''));
            }
            setCamFor(null);
          }}
        />
      )}
    </div>
  );
}
