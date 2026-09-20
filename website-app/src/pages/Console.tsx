import { useState, useEffect, type FormEvent, type ReactNode, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveUser, getAllUsers, saveCompanyTree, saveCompanySubscription, deleteCompany, uploadConsoleImage, saveSiteConfig, loadSiteConfig, getStorageStatus, loadPlantProfile, savePlantProfile, savePlantLogo, isOnline, type CompanyTree, type SiteConfig } from '../firebase/firestore';
import BrandLogo from '../components/BrandLogo';
import type { UserSession } from '../context/AuthContext';
import { TREE_ROLES, treeModsForRole } from '../lib/treeRoles';
import { hashPassword } from '../lib/passwords';
import { useConsoleDict } from '../i18n/consoleDict';

const STORAGE_KEY = 'fimto_module_config';
const SESSION_KEY = 'fimto_console_session';

const CONSOLE_MODULES = [
  { path: 'orders', en: 'Orders', ar: 'الطلبات' },
  { path: 'operations', en: 'Operations', ar: 'التشغيل' },
  { path: 'production', en: 'Production', ar: 'الإنتاج' },
  { path: 'workshop', en: 'Workshop', ar: 'الورشة' },
  { path: 'mixing', en: 'Mixing & Quality', ar: 'المختبر والجودة' },
  { path: 'schedule', en: 'Schedule', ar: 'الجدول' },
  { path: 'evaluation', en: 'Evaluation', ar: 'التقييم' },
  { path: 'rnd', en: 'R & D', ar: 'البحث والتطوير' },
  { path: 'materials', en: 'Materials (ERP)', ar: 'الموارد والمواد' },
  { path: 'governance', en: 'Governance', ar: 'الحوكمة' },
  { path: 'finance', en: 'Finance', ar: 'المالية' },
  { path: 'multiplant', en: 'Multi-Plant', ar: 'المحطات' },
];

const ROLES = TREE_ROLES;

// قوائم الدول والمدن
const COUNTRIES = ['مصر', 'السعودية', 'الإمارات', 'الكويت', 'قطر', 'البحرين', 'عمان', 'ليبيا', 'العراق', 'الأردن', 'لبنان', 'اليمن', 'السودان', 'فلسطين', 'سوريا', 'المغرب', 'الجزائر', 'تونس'];
const CITIES_BY_COUNTRY: Record<string, string[]> = {
  'مصر': ['القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'الشرقية', 'الغربية', 'القليوبية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'مطروح', 'شمال سيناء', 'جنوب سيناء', 'الوادي الجديد'],
  'السعودية': ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'الطائف', 'تبوك', 'أبها', 'بريدة', 'حائل', 'ينبع', 'الجبيل'],
  'الإمارات': ['أبوظبي', 'دبي', 'الشارقة', 'عجمان', 'العين', 'رأس الخيمة', 'الفجيرة', 'أم القيوين'],
  'الكويت': ['مدينة الكويت', 'حولي', 'الفروانية', 'الأحمدي', 'الجهراء'],
  'قطر': ['الدوحة', 'الريان', 'الوكرة', 'الخور', 'الظعاين'],
  'البحرين': ['المنامة', 'المحرق', 'الرفاع', 'سترة'],
  'عمان': ['مسقط', 'صلالة', 'نزوى', 'صحار', 'صور'],
  'ليبيا': ['طرابلس', 'بنغازي', 'مصراتة', 'سبها', 'البيضاء'],
  'العراق': ['بغداد', 'البصرة', 'الموصل', 'أربيل', 'النجف', 'كربلاء'],
  'الأردن': ['عمان', 'الزرقاء', 'إربد', 'العقبة', 'الكرك'],
  'لبنان': ['بيروت', 'طرابلس', 'صيدا', 'صور', 'جونيه'],
  'اليمن': ['صنعاء', 'عدن', 'تعز', 'الحديدة', 'المكلا'],
  'السودان': ['الخرطوم', 'أم درمان', 'بورتسودان', 'كسلا'],
  'فلسطين': ['غزة', 'رام الله', 'الخليل', 'نابلس', 'جنين', 'بيت لحم'],
  'سوريا': ['دمشق', 'حلب', 'حمص', 'اللاذقية', 'حماة'],
  'المغرب': ['الدار البيضاء', 'الرباط', 'مراكش', 'فاس', 'طنجة'],
  'الجزائر': ['الجزائر العاصمة', 'وهران', 'قسنطينة', 'عنابة'],
  'تونس': ['تونس', 'صفاقس', 'سوسة', 'القيروان'],
};

const PRODUCTS_OPTIONS = [
  { v: 'both', l: 'خرسانة وبلك' },
  { v: 'concrete', l: 'خرسانة فقط' },
  { v: 'blocks', l: 'بلك فقط' },
];
const STATION_TYPE_OPTIONS = [
  { v: 'concrete', l: 'خرسانة جاهزة' },
  { v: 'blocks', l: 'بلك' },
  { v: 'both', l: 'الاثنين معاً' },
];

const PRODUCT_X_KEY: Record<string, string> = { both: 'productBoth', concrete: 'productConcrete', blocks: 'productBlocks' };
const STATION_X_KEY: Record<string, string> = { concrete: 'stationTypeConcrete', blocks: 'stationTypeBlocks', both: 'stationTypeBoth' };

interface Overrides { [path: string]: { image: string; bgImage: string } }

function loadCfg() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const cfg = JSON.parse(raw);
      return { overrides: cfg.overrides || {} as Overrides, custom: cfg.custom || [] as any[] };
    }
  } catch {}
  return { overrides: {} as Overrides, custom: [] as any[] };
}

const saveCfg = (overrides: Overrides, custom: any[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ overrides, custom }));
  } catch (err) {
    console.error('saveCfg failed', err);
  }
};

class ConsoleErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; msg: string }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { hasError: false, msg: '' }; }
  static getDerivedStateFromError(err: any) { return { hasError: true, msg: err?.message || String(err) }; }
  componentDidCatch(err: any) { console.error('Console crash:', err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080C14] flex items-center justify-center p-6 text-center">
          <div className="max-w-md rounded-2xl border border-red-500/40 bg-[#1E0B0B]/80 p-6 text-red-200 shadow-[0_0_30px_rgba(239,68,68,0.4)]">
            <h2 className="text-xl font-black text-red-400 mb-2">💥 انهارت الصفحة</h2>
            <p className="text-sm font-mono break-all bg-red-500/10 p-2 rounded">{this.state.msg}</p>
            <button onClick={() => window.location.reload()} className="mt-4 w-full bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-bold px-3 py-2 rounded-lg hover:bg-red-500/25">🔁 إعادة تحميل</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const inputCls = "w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-slate-100 text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] transition placeholder:text-slate-500";

interface TreeAccount {
  email: string;
  password: string;
  phone: string;
  role: string;
  roleAr: string;
  permissions: string[];
  mods?: string[];
  truck?: string;
  gps?: string;
}

function defaultEmail(roleKey: string, n: number, company: string) {
  // Use the unique lowercase company username as the domain so emails can
  // NEVER collide across two companies (Arabic plant names strip to '').
  const slug = (company || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'fimto';
  return `${roleKey}${n}@${slug}.com`;
}

export default function Console() {
  return (
    <ConsoleErrorBoundary>
      <ConsoleInner />
    </ConsoleErrorBoundary>
  );
}

function ConsoleInner() {
  const navigate = useNavigate();
  const t = useConsoleDict();
  const [authed, setAuthed] = useState(false);
  const [step, setStep] = useState<'login' | 'otp' | 'panel'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSentTo, setOtpSentTo] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'sections' | 'companies'>('sections');

  const [overrides, setOverrides] = useState<Overrides>(() => loadCfg().overrides);
  const [custom, setCustom] = useState<any[]>(() => loadCfg().custom);

const [companies, setCompanies] = useState<any[]>([]);
  const [comp, setComp] = useState({ username: '', password: '', plantName: '', country: 'Egypt', city: '', phone: '', email: '' });
  const [dbLoaded, setDbLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  // Subscription dates per company (from companyTrees doc)
  const [subs, setSubs] = useState<Record<string, { subscriptionStart: string; subscriptionEnd: string; subscriptionStatus: string }>>({});
  // Inline company editing
  const [editingCompany, setEditingCompany] = useState<string | null>(null);
  // Storage usage per company (from users doc)
  const [storage, setStorage] = useState<Record<string, { usedMB: number; quotaMB: number; pct: number }>>({});
  // Plant profile per company (logo + capacity + fleet + all admin-panel data)
  const [plant, setPlant] = useState<Record<string, any>>({});
  const [plantDirty, setPlantDirty] = useState<Record<string, boolean>>({});
  // Delete confirmation: must type "مسح" twice (+ protection password if protected)
  const [deleteTarget, setDeleteTarget] = useState<{ uname: string; name: string; isProtected: boolean } | null>(null);
  const [delType1, setDelType1] = useState('');
  const [delType2, setDelType2] = useState('');
  const [delPass, setDelPass] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Protection: lock/unlock a company — needs the protection password
  const [protectTarget, setProtectTarget] = useState<{ uname: string; name: string; toLock: boolean } | null>(null);
  const [protectPass, setProtectPass] = useState('');
  const [protectSaving, setProtectSaving] = useState(false);

  const saveConfigBtn = async () => {
    setError(t('savingToDb'));
    try {
      await saveSiteConfig({ overrides, custom });
      setError(t('savedToDbMsg'));
    } catch (err) {
      console.error('site config save', err);
      setError(t('saveDbFailed'));
    }
  };

  const loadCfgFromDb = async () => {
    try {
      const cfg = await loadSiteConfig();
      if (cfg && (Object.keys(cfg.overrides || {}).length || (cfg.custom || []).length > 0)) {
        const ov = (cfg.overrides || {}) as Overrides;
        const cu = cfg.custom || [];
        setOverrides(ov);
        setCustom(cu);
        saveCfg(ov, cu);
        setError(t('loadedFromDbMsg'));
      }
    } catch (e) { console.error('load cfg', e); }
  };
  const [treeOpen, setTreeOpen] = useState<string | null>(null);
  const [trees, setTrees] = useState<Record<string, TreeAccount[]>>({});
  const [presence, setPresence] = useState<Record<string, any>>({});
  const [treeRole, setTreeRole] = useState('driver');
  const [treeCount, setTreeCount] = useState(1);
  const [treeDraft, setTreeDraft] = useState<TreeAccount[]>([]);
  const [treeSaving, setTreeSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, Record<string, boolean>>>({});
  const toggleCollapse = (uname: string, section: string) => {
    setCollapsed(prev => {
      const cur = prev[uname] || {};
      return { ...prev, [uname]: { ...cur, [section]: !cur[section] } };
    });
  };
  const isCollapsed = (uname: string, section: string) => !!(collapsed[uname] || {})[section];
  const [migrating, setMigrating] = useState<string | null>(null);
  const [uploadingPath, setUploadingPath] = useState('');
  const [customMedia, setCustomMedia] = useState({ image: '', bgImage: '' });

  useEffect(() => {
    if (localStorage.getItem(SESSION_KEY) === '1') {
      setAuthed(true);
      setStep('panel');
    }
  }, []);

  useEffect(() => {
    if (step !== 'panel') return;
    let mounted = true;
    (async () => {
      try {
        const { getAllCompanyTrees } = await import('../firebase/firestore');
        const [list, trs] = await Promise.all([getAllUsers(), getAllCompanyTrees()]);
        if (!mounted) return;

        const pm: Record<string, any> = {};
        (list || []).forEach((u: any) => { if (u?.username) pm[String(u.username).toLowerCase()] = u; });
        setPresence(pm);

        const clean = (list || []).map((u: any) => ({
          username: u.username || u.id || '',
          plantName: u.plantName || u.plant_name || u.name || u.username || '—',
          email: u.email || '',
          status: u.status || 'FREE_TRIAL',
          protected: u.protected === true,
        }));

        // الشركات الحقيقية = كل شجرة مسجلة في companyTrees (منع عدّ حسابات الموظفين كشركات)
        const tm: Record<string, CompanyTree> = {};
        (trs || []).forEach((t: CompanyTree) => {
          if (t?.companyUsername) tm[String(t.companyUsername).toLowerCase()] = t;
        });
        const treeNames = Object.keys(tm);
        const companies = treeNames.length > 0
          ? treeNames.map(uname => {
            const u: any = pm[uname] || {};
            return {
              username: uname,
              plantName: u.plantName || u.plant_name || u.name || uname,
              email: u.email || '',
              status: u.status || 'FREE_TRIAL',
              protected: u.protected === true,
            };
          })
          : clean;
        setCompanies(companies);

        // Load subscription dates for each company (from companyTrees doc)
        const smap: Record<string, { subscriptionStart: string; subscriptionEnd: string; subscriptionStatus: string }> = {};
        for (const c of companies) {
          const uname = (c.username || '').toLowerCase();
          if (!uname) continue;
          try {
            const t = tm[uname];
            smap[uname] = {
              subscriptionStart: t?.subscriptionStart || '',
              subscriptionEnd: t?.subscriptionEnd || '',
              subscriptionStatus: t?.subscriptionStatus || '',
            };
          } catch {}
        }
        setSubs(smap);
        // Load storage usage per company
        const stmap: Record<string, { usedMB: number; quotaMB: number; pct: number }> = {};
        for (const c of companies) {
          const uname = (c.username || '').toLowerCase();
          if (!uname) continue;
          try {
            const st = await getStorageStatus(uname);
            stmap[uname] = { usedMB: st.usedMB, quotaMB: st.quotaMB, pct: st.pct };
          } catch {}
        }
        setStorage(stmap);
      } catch {
        try {
          const saved = localStorage.getItem('registeredUsers');
          if (saved && mounted) setCompanies(JSON.parse(saved));
        } catch {}
      }
    })();
    if (!dbLoaded) { setDbLoaded(true); loadCfgFromDb(); }
    return () => { mounted = false; };
  }, [step]);

  const input2 = (v: string) => v === undefined ? '' : v;

  // Hash account passwords at persistence time — plaintext is shown once in the draft/print only.
  const hashTreeRows = async (rows: TreeAccount[]): Promise<TreeAccount[]> => {
    const out: TreeAccount[] = [];
    for (const a of rows) {
      const loginId = String(a.email || a.phone || '').trim().toLowerCase();
      const passwordHash = await hashPassword(loginId, a.password || '');
      out.push({ ...a, email: loginId, passwordHash, password: '' });
    }
    return out;
  };

  // Register each hashed tree account in the shared `users` collection so web/mobile
  // login works. Failures are collected (never swallowed) so the UI can report honestly.
  const registerTreeAccounts = async (
    hashed: TreeAccount[],
    company: UserSession,
    username: string,
  ): Promise<{ ok: number; failed: { email: string; error: string }[] }> => {
    const fs = await import('../firebase/firestore');
    const failed: { email: string; error: string }[] = [];
    let ok = 0;
    for (const a of hashed) {
      try {
        await fs.saveAppAccount({
          username: a.email,
          password: a.password,
          passwordHash: a.passwordHash,
          plantName: company.plantName || username,
          country: company.country,
          city: company.city,
          phone: a.phone,
          email: a.email,
          status: 'APP_ACCOUNT',
          role: a.role,
          roleAr: a.roleAr,
          permissions: a.permissions,
          mods: a.mods || treeModsForRole(a.role),
          truck: a.truck,
          gps: a.gps,
        });
        ok++;
      } catch (e: any) {
        failed.push({ email: a.email || a.phone || '?', error: String(e?.message || e) });
      }
    }
    return { ok, failed };
  };

  const treeSaveReport = (ok: number, failed: { email: string; error: string }[]) => {
    if (failed.length === 0) return `${t('treeSavedOk')}${ok}${t('accountsRegistered')}`;
    const names = failed.map(f => f.email).slice(0, 4).join('، ');
    const more = failed.length > 4 ? `${t('moreAccountsSuffix')}${failed.length - 4}${t('accountsMoreEnd')}` : '';
    return `${t('treeSavedPartial')}${ok}${t('outOfAccounts')}${ok + failed.length}${t('accountsFailedSuffix')}${names}${more}${t('resaveAfterCheck')}`;
  };

  const onlineBadge = (id: string) => {
    const u = presence[String(id || '').toLowerCase()];
    const on = !!u && isOnline(typeof u.lastSeenAt === 'number' ? u.lastSeenAt : null);
    return (
      <span
        title={`${t('lastActivityLabel')}${u?.lastSeenAt && typeof u.lastSeenAt === 'number' ? new Date(u.lastSeenAt).toLocaleString() : t('unknownTime')}`}
        className={`text-[10px] font-bold px-2 py-1 rounded border shrink-0 ${on ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-white/[0.04] text-slate-500 border-white/10'}`}
      >
        {on ? t('onlineStatus') : t('offlineStatus')}
      </span>
    );
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError(t('enterEmailPass')); return; }
    setSending(true);
    try {
      const res = await fetch('/api/console/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        // Credentials were verified server-side; only the OTP email failed → allow direct entry
        if (json?.errorCode === 'EMAIL_FAILED') {
          localStorage.setItem(SESSION_KEY, '1');
          setAuthed(true);
          setStep('panel');
          setError(t('loginNoOtpMsg'));
          setSending(false);
          return;
        }
        setError(json?.message || t('invalidLogin'));
        setSending(false);
        return;
      }
      setOtpSentTo(email.trim().toLowerCase());
      setStep('otp');
      setError(t('otpSentMsg'));
    } catch (err: any) {
      console.error('console login error:', err);
      setError(t('serverUnreachable'));
    }
    setSending(false);
  };

  const handleOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(otp)) { setError(t('otpInvalid')); return; }
    setSending(true);
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: otpSentTo || email.trim().toLowerCase(), code: otp }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        setError(json?.message || t('otpWrong'));
        setSending(false);
        return;
      }
      localStorage.setItem(SESSION_KEY, '1');
      setAuthed(true);
      setStep('panel');
    } catch (err: any) {
      setError(t('serverUnreachable'));
    }
    setSending(false);
  };

  const updateOverride = (path: string, key: 'image' | 'bgImage', value: string) => {
    const cur = overrides[path] || { image: '', bgImage: '' };
    const next: Overrides = { ...overrides, [path]: { ...cur, [key]: value } };
    setOverrides(next);
    saveCfg(next, custom);
    setError(t('savedMsg'));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, path: string, key: 'image' | 'bgImage') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPath(`${path}:${key}`);
    try {
      setError(t('uploadImage'));
      const url = await uploadConsoleImage(file, `modules/${path}`);
      if (!url) throw new Error(t('uploadFailedNoResult'));
      updateOverride(path, key, url);
      setError(t('uploadResultMsg'));
    } catch (err) {
      console.error('Upload failed', err);
      setError(`${t('uploadFailed')}${err instanceof Error ? err.message : t('unknownError')}`);
    } finally {
      setUploadingPath('');
      e.target.value = '';
    }
  };

  const handleCustomUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: 'image' | 'bgImage') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPath(`custom:${key}`);
    try {
      setError(t('uploadImage'));
      const url = await uploadConsoleImage(file, 'custom');
      if (!url) throw new Error(t('uploadFailedNoResult'));
      setCustomMedia(prev => ({ ...prev, [key]: url }));
      setError(t('customUploadMsg'));
    } catch (err) {
      console.error('Upload failed', err);
      setError(`${t('uploadFailed')}${err instanceof Error ? err.message : t('unknownError')}`);
    } finally {
      setUploadingPath('');
      e.target.value = '';
    }
  };

  const openTree = async (username: string) => {
    if (treeOpen === username) { setTreeOpen(null); return; }
    setTreeOpen(username);
    setTreeDraft([]);
    setError('');
    try {
      const t = await loadTree(username);
      if (t) setTrees(prev => ({ ...prev, [username]: t }));
    } catch {}
    // Load the plant profile (logo, capacity, fleet, all admin-panel data)
    try {
      const p = await loadPlantProfile(username);
      if (p && Object.keys(p).length > 0) {
        setPlant(prev => ({ ...prev, [username]: { ...p } }));
      } else {
        setPlant(prev => ({ ...prev, [username]: { name: '', logo: '' } }));
      }
    } catch {}
  };

  const loadTree = async (username: string): Promise<TreeAccount[] | null> => {
    const { loadCompanyTree } = await import('../firebase/firestore');
    const t: CompanyTree | null = await loadCompanyTree(username);
    const accs = t?.accounts?.map(a => ({
      email: a.email || '',
      password: a.password || '',
      phone: a.phone || '',
      role: a.role || '',
      roleAr: a.roleAr || '',
      permissions: a.permissions || [],
      mods: a.mods || treeModsForRole(a.role || ''),
      truck: a.truck || '',
      gps: a.gps || '',
    })) || null;
    return accs;
  };

  const updateSavedRow = (username: string, idx: number, field: keyof TreeAccount, value: string) => {
    setTrees(prev => {
      const rows = [...(prev[username] || [])];
      if (!rows[idx]) return prev;
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, [username]: rows };
    });
  };

  const saveAllTree = async (username: string) => {
    const rows = trees[username] || [];
    if (rows.length === 0) { setError(t('treeEmptyMsg')); return; }
    setTreeSaving(true);
    const company = companies.find(c => c.username?.toLowerCase() === username) || {} as UserSession;
    try {
      const fs = await import('../firebase/firestore');
      const hashed = await hashTreeRows(rows);
      const problems = await fs.checkTreeAccountConflicts(hashed, username);
      if (problems.length > 0) {
        setError(t('treeConflictPrefix') + problems.slice(0, 8).join('\n'));
        setTreeSaving(false);
        return;
      }
      const sub = subs[username.toLowerCase()] || {};
      const tree: CompanyTree = {
        companyUsername: username,
        accounts: hashed,
        subscriptionStart: sub.subscriptionStart,
        subscriptionEnd: sub.subscriptionEnd,
        subscriptionStatus: sub.subscriptionStatus,
      };
      await fs.saveCompanyTree(tree);
      const { ok, failed } = await registerTreeAccounts(hashed, company, username);
      setError(treeSaveReport(ok, failed));
    } catch (err) {
      console.error('Tree save failed', err);
      setError(t('treeSaveFailed'));
    }
    setTreeSaving(false);
  };

  // ===== نقل بيانات المتصفح (localStorage) إلى القاعدة — مرة واحدة لكل شركة =====
  const migrateBrowserData = async (username: string) => {
    setMigrating(username);
    setError('');
    const read = (k: string): any => {
      try {
        const s = localStorage.getItem(k);
        return s ? JSON.parse(s) : null;
      } catch { return null; }
    };
    const hasData = (v: any): boolean =>
      v !== null && v !== undefined &&
      !(Array.isArray(v) && v.length === 0) &&
      !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

    const fs = await import('../firebase/firestore');
    // [اسم القسم, مفاتيح localStorage (بالترتيب), دالة الحفظ]
    const MAP: Array<[string, string[], (u: string, v: any) => Promise<void>]> = [
      [t('migTrips'), ['trips_data', 'trips'], fs.saveTrips],
      [t('migOrders'), ['concrete_plant_orders'], fs.saveOrders],
      [t('migCustomers'), ['concrete_plant_customers'], fs.saveCustomers],
      [t('migProduction'), ['plantProductionRuns'], fs.saveProductionRuns],
      [t('migInventory'), ['plantInventory'], fs.saveInventory],
      [t('migRecipes'), ['plantRecipes'], fs.saveRecipes],
      [t('migCalibration'), ['calibrationLogs'], fs.saveCalibrationLogs],
      [t('migQc'), ['qcRecords'], fs.saveQCRecords],
      [t('migDeliveries'), ['plantDeliveries'], fs.saveDeliveries],
      [t('migPayments'), ['plantPayments'], fs.savePayments],
      [t('migPurchaseOrders'), ['plantPOs'], fs.savePurchaseOrders],
      [t('migReturns'), ['plantReturns'], fs.saveReturns],
      [t('migWeighbridge'), ['plantWeigh'], fs.saveWeighbridgeRecords],
      [t('migPlants'), ['plantAdditions'], fs.savePlants],
      [t('migBlockPlants'), ['plantBlocks'], fs.saveBlockPlants],
      [t('migFuel'), ['ws_fuel'], fs.saveFuelLogs],
      [t('migOil'), ['ws_oil'], fs.saveOilLogs],
      [t('migSpareParts'), ['ws_parts'], fs.saveSparePartLogs],
      [t('migBreakdowns'), ['ws_breakdowns'], fs.saveBreakdowns],
      [t('migWarehouse'), ['ws_warehouse'], fs.saveWarehouse],
      [t('migPurchaseReqs'), ['ws_purchreq'], fs.savePurchaseReqs],
      [t('migStations'), ['ws_stations'], fs.saveStations],
      [t('migPeriodicMaints'), ['ws_maints'], fs.savePeriodicMaints],
    ];

    // أسطول الورشة + إعداداتها مخزنة بمفاتيح ديناميكية fms_assets_<plant> / fms_cfg_<plant>
    const plantAssets = Object.keys(localStorage).filter((k) => k.startsWith('fms_assets_'));
    for (const k of plantAssets) {
      const v = read(k);
      if (!hasData(v)) continue;
      try { await fs.saveAssets(username, v); done.push(t('migWorkshopFleet') + k.replace('fms_assets_', '') + t('migNameEnd')); } catch (e) { console.error('migrate assets', e); failed++; }
    }
    const plantCfg = Object.keys(localStorage).filter((k) => k.startsWith('fms_cfg_'));
    for (const k of plantCfg) {
      const v = read(k);
      if (!hasData(v)) continue;
      try { await fs.saveWorkshopConfig(username, v); done.push(t('migWorkshopCfg') + k.replace('fms_cfg_', '') + t('migNameEnd')); } catch (e) { console.error('migrate cfg', e); failed++; }
    }

    const done: string[] = [];
    let failed = 0;
    for (const [label, keys, saveFn] of MAP) {
      let v: any = null;
      for (const k of keys) { v = read(k); if (hasData(v)) break; }
      if (!hasData(v)) continue;
      try {
        await saveFn(username, v);
        done.push(label);
      } catch (e) {
        console.error(`migrate ${label}`, e);
        failed++;
      }
    }
    const msg = done.length
      ? `${t('migrateMsgPrefix')}${done.join('، ')}` + (failed ? `${t('migrateFailedCount')}${failed}${t('migrateFailedCountEnd')}` : '')
      : t('migrateNoDataMsg');
    setError(msg);
    setMigrating(null);
  };

  const exportCsv = (username: string) => {
    const rows = trees[username] || [];
    const company = companies.find(c => c.username?.toLowerCase() === username);
    const head = [t('csvEmailHead'), t('csvRoleHead'), t('csvTruckHead'), 'GPS', t('csvPhoneHead'), t('csvPasswordHead'), t('csvPermsHead')];
    const lines = [head.join(',')];
    rows.forEach(r => {
      const perms = '"' + (r.permissions || []).join(' | ') + '"';
      lines.push([r.email, r.roleAr, r.truck || '', r.gps || '', r.phone || '', r.password || '', perms].join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tree-${username}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setError(t('csvDownloadMsg'));
  };

  const exportPdf = (username: string) => {
    const rows = trees[username] || [];
    const company = companies.find(c => c.username?.toLowerCase() === username);
    const w = window.open('', '_blank');
    if (!w) { setError(t('popupHint')); return; }
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${t('pdfTitlePrefix')}${company?.plantName || username}</title>
      <style>
        * { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
        body { padding: 24px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        h2 { font-size: 13px; color: #666; font-weight: 400; margin: 0 0 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #0B111E; color: #fff; padding: 8px; text-align: right; }
        td { border: 1px solid #ccc; padding: 7px 8px; }
        tr:nth-child(even) td { background: #f4f7fb; }
        .badge { display: inline-block; background: #e0f2fe; color: #0369a1; border-radius: 4px; padding: 1px 6px; font-size: 10px; margin-left: 4px; }
        @media print { body { padding: 8px; } }
      </style></head><body>
      <h1>${t('pdfH1Prefix')}${company?.plantName || username}</h1>
      <h2>${t('pdfTotalPrefix')}${rows.length} · ${new Date().toLocaleDateString('ar-EG')}</h2>
      <table>
        <thead><tr><th>#</th><th>${t('pdfEmailHead')}</th><th>${t('csvRoleHead')}</th><th>${t('csvTruckHead')}</th><th>GPS</th><th>${t('csvPhoneHead')}</th><th>${t('csvPasswordHead')}</th><th>${t('csvPermsHead')}</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `<tr><td>${i + 1}</td><td dir="ltr">${r.email}</td><td>${r.roleAr}</td><td>${r.truck || '—'}</td><td>${r.gps || '—'}</td><td dir="ltr">${r.phone || '—'}</td><td dir="ltr">${r.password || '—'}</td><td>${(r.permissions || []).map(p => `<span class="badge">${p}</span>`).join('')}</td></tr>`).join('')}
        </tbody>
      </table>
      <script>window.onload = () => { window.print(); };<\/script>
    </body></html>`);
    w.document.close();
    setError(t('pdfPageOpened'));
  };

  const generateDraft = () => {
    const role = ROLES.find(r => r.key === treeRole)!;
    const existing = trees[treeOpen || ''] || [];
    const n = treeCount < 1 ? 1 : treeCount;
    const rows: TreeAccount[] = [];
    // Use the unique company username for email domain + a unique password
    // per account so no two accounts (even in the same company) ever match.
    const companySlug = (treeOpen || 'fimto').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'fimto';
    for (let i = 0; i < n; i++) {
      const idx = existing.filter(a => a.role === role.key).length + i + 1;
      rows.push({
        email: defaultEmail(role.key, idx, companySlug),
        password: `Fimto${companySlug.slice(0, 4)}${role.key}${idx}${i}`,
        phone: '',
        role: role.key,
        roleAr: role.ar,
        permissions: role.perms,
        mods: role.mods,
        truck: '',
        gps: '',
      });
    }
    setTreeDraft(rows);
    setError('');
  };

  const resetDraft = () => setTreeDraft([]);

  const saveTree = async () => {
    if (!treeOpen) return;
    setTreeSaving(true);
    const role = ROLES.find(r => r.key === treeRole)!;
    const company = companies.find(c => c.username?.toLowerCase() === treeOpen) || {} as UserSession;
    const rows = [...(trees[treeOpen] || []), ...treeDraft];
    try {
      const fs = await import('../firebase/firestore');
      const problems = await fs.checkTreeAccountConflicts(rows, treeOpen);
      if (problems.length > 0) {
        setError(t('treeConflictPrefix') + problems.slice(0, 8).join('\n'));
        setTreeSaving(false);
        return;
      }
      const hashed = await hashTreeRows(rows);
      const sub = subs[treeOpen.toLowerCase()] || {};
      const tree: CompanyTree = {
        companyUsername: treeOpen,
        accounts: hashed,
        subscriptionStart: sub.subscriptionStart,
        subscriptionEnd: sub.subscriptionEnd,
        subscriptionStatus: sub.subscriptionStatus,
      };
      await fs.saveCompanyTree(tree);
      const { ok, failed } = await registerTreeAccounts(hashed, company, treeOpen);
      setTrees(prev => ({ ...prev, [treeOpen]: rows }));
      setTreeDraft([]);
      setError(treeSaveReport(ok, failed));
    } catch (err) {
      console.error('Tree save failed', err);
      setError(t('treeSaveFailed'));
    }
    setTreeSaving(false);
  };

  const updateTreeRow = (idx: number, field: keyof TreeAccount, value: string) => {
    setTreeDraft(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const deleteTreeAccount = async (username: string, idx: number) => {
    const rows = [...(trees[username] || [])];
    const gone = rows[idx];
    rows.splice(idx, 1);
    setTrees(prev => ({ ...prev, [username]: rows }));
    saveCompanyTree({ companyUsername: username, accounts: rows }).catch(() => {});
    // Also delete the login account doc so the deleted account can't log in.
    if (gone?.email) {
      try {
        const fs = await import('../firebase/firestore');
        await fs.deleteAppAccount(gone.email);
      } catch (e) { console.error('delete account doc', e); }
    }
    setError(`${t('accountDeletedMsgPrefix')}${gone?.email || ''}${t('accountDeletedMsgSuffix')}`);
  };

  const addCustom = (e: FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const en = String(fd.get('en') || '').trim();
    const ar = String(fd.get('ar') || '').trim();
    const desc = String(fd.get('desc') || '').trim();
    const image = customMedia.image;
    const bgImage = customMedia.bgImage;
    if (!en) { setError(t('customSectionNameReq')); return; }
    const next = [...custom, { id: `custom-${Date.now()}`, en, ar: ar || en, image, bgImage, desc }];
    setCustom(next);
    saveCfg(overrides, next);
    form.reset();
    setCustomMedia({ image: '', bgImage: '' });
    setError(t('addCustomSectionDone'));
  };

  const removeCustom = (id: string) => {
    const next = custom.filter(c => c.id !== id);
    setCustom(next);
    saveCfg(overrides, next);
  };

  const createCompany = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    const { username, password, plantName, country, city, phone, email } = comp;
    if (!username || !password || !plantName || !email) { setError(t('createCompanyReq')); setCreating(false); return; }
    const uname = username.trim().toLowerCase();
    if (uname.length < 3) { setError(t('usernameMinMsg')); setCreating(false); return; }
    if (password.length < 6) { setError(t('passwordMinMsg')); setCreating(false); return; }
    try {
      const fs = await import('../firebase/firestore');
      const problems = await fs.checkLoginUniqueness(uname, password);
      if (problems.length > 0) { setError('❌ ' + problems.join(' — ')); setCreating(false); return; }
      const user: UserSession = { username: uname, password: '', country, city, plantName, phone, email, status: 'FREE_TRIAL' };
      (user as any).passwordHash = await hashPassword(uname, password);
      await fs.saveUser(user);
      setCompanies(prev => [user, ...prev.filter(c => (c.username || '').toLowerCase() !== uname)]);
      setComp({ username: '', password: '', plantName: '', country: 'Egypt', city: '', phone: '', email: '' });
      setError(`${t('companyCreatedPrefix')}${uname}${t('companyCreatedSuffix')}`);
    } catch (err) {
      console.error('create company failed', err);
      setError(t('companyCreateFailed'));
    }
    setCreating(false);
  };

  // ===== تعديل بيانات الشركة =====
  const updateCompanyInfoLocal = (username: string, patch: Partial<UserSession>) => {
    const uname = username.toLowerCase();
    setCompanies(prev => prev.map(c => ((c.username || '').toLowerCase() === uname ? { ...c, ...patch } : c)));
  };

  const updateCompanyInfo = async (username: string, patch: Partial<UserSession>) => {
    setError('');
    const uname = username.toLowerCase();
    try {
      const cur = companies.find(c => (c.username || '').toLowerCase() === uname) || {} as UserSession;
      await saveUser({ ...cur, ...patch, username: uname });
      setCompanies(prev => prev.map(c => ((c.username || '').toLowerCase() === uname ? { ...c, ...patch } : c)));
      setEditingCompany(null);
      setError(`${t('companyUpdatedPrefix')}${patch.plantName || uname}`);
    } catch (err) {
      console.error('update company failed', err);
      setError(t('companyUpdateFailed'));
    }
  };

  // ===== إدارة الاشتراك =====
  const saveSubscription = async (username: string) => {
    setError('');
    const uname = username.toLowerCase();
    const sub = subs[uname] || { subscriptionStart: '', subscriptionEnd: '', subscriptionStatus: '' };
    if (!sub.subscriptionEnd) { setError(t('setSubEndFirst')); return; }
    try {
      await saveCompanySubscription(uname, sub);
      const cur = companies.find(c => (c.username || '').toLowerCase() === uname) || {} as UserSession;
      await saveUser({ ...cur, username: uname, subscriptionStart: sub.subscriptionStart, subscriptionEnd: sub.subscriptionEnd, subscriptionStatus: sub.subscriptionStatus }).catch(() => {});
      setError(`${t('subSavedPrefix')}${uname}${t('untilPrefix')}${sub.subscriptionEnd}`);
    } catch (err) {
      console.error('save subscription failed', err);
      setError(t('subSaveFailed'));
    }
  };

  const setSub = (username: string, field: 'subscriptionStart' | 'subscriptionEnd' | 'subscriptionStatus', value: string) => {
    const uname = username.toLowerCase();
    setSubs(prev => ({ ...prev, [uname]: { ...(prev[uname] || { subscriptionStart: '', subscriptionEnd: '', subscriptionStatus: '' }), [field]: value } }));
  };

  // ===== بيانات الشركة (اللوغو + الانتاجية + المعدات + الاسطول) =====
  const plantField = (username: string, field: string, value: any) => {
    const uname = username.toLowerCase();
    setPlant(prev => ({ ...prev, [uname]: { ...(prev[uname] || {}), [field]: value } }));
    setPlantDirty(prev => ({ ...prev, [uname]: true }));
  };

  const handlePlantLogo = (username: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError(t('imageOnlyMsg')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 300;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        plantField(username, 'logo', dataUrl);
      };
      img.onerror = () => setError(t('imageReadFailed'));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const savePlantProfileNow = async (username: string) => {
    const uname = username.toLowerCase();
    const p = plant[uname] || {};
    setError('');
    try {
      const { name, logo, ...rest } = p;
      await savePlantProfile(uname, {
        name: name || '',
        logo: logo || '',
        ...rest,
        updatedAt: new Date().toISOString(),
      });
      await savePlantLogo(uname, logo || '').catch(() => {});
      setPlantDirty(prev => ({ ...prev, [uname]: false }));
      setError(`${t('plantSavedPrefix')}${name || uname}${t('plantSavedSuffix')}`);
    } catch (err) {
      console.error('save plant profile failed', err);
      setError(t('plantSaveFailed'));
    }
  };

  // ===== الأفرع والمحطات والمنتجات والورديات =====
  const branches = (uname: string): any[] => (plant[uname]?.branches && Array.isArray(plant[uname].branches)) ? plant[uname].branches : [];

  const setBranchCount = (uname: string, n: number) => {
    const cur = branches(uname);
    const next = Array.from({ length: Math.max(0, n) }, (_, i) => cur[i] || { name: '', stations: [] });
    plantField(uname, 'branches', next);
  };

  const setBranchField = (uname: string, bi: number, field: string, value: any) => {
    const next = branches(uname).map((b, i) => (i === bi ? { ...b, [field]: value } : b));
    plantField(uname, 'branches', next);
  };

  const setStationCount = (uname: string, bi: number, n: number) => {
    const next = branches(uname).map((b, i) => {
      if (i !== bi) return b;
      const cur = (b.stations && Array.isArray(b.stations)) ? b.stations : [];
      return { ...b, stations: Array.from({ length: Math.max(0, n) }, (_, j) => cur[j] || { code: '', type: 'concrete', designCap: '', actualCap: '', operators: [], chillers: [] }) };
    });
    plantField(uname, 'branches', next);
  };

  const setStationField = (uname: string, bi: number, si: number, field: string, value: any) => {
    const next = branches(uname).map((b, i) => {
      if (i !== bi) return b;
      return { ...b, stations: (b.stations || []).map((s: any, j: number) => (j === si ? { ...s, [field]: value } : s)) };
    });
    plantField(uname, 'branches', next);
  };

  const station = (uname: string, bi: number, si: number) => branches(uname)[bi]?.stations?.[si] || {};

  const setOperatorField = (uname: string, bi: number, si: number, oi: number, field: string, value: any) => {
    const ops = [...((station(uname, bi, si).operators || []))];
    if (!ops[oi]) ops[oi] = { name: '', shift: '' };
    ops[oi] = { ...ops[oi], [field]: value };
    setStationField(uname, bi, si, 'operators', ops);
  };

  const setChillerField = (uname: string, bi: number, si: number, ci: number, field: string, value: any) => {
    const ch = [...((station(uname, bi, si).chillers || []))];
    if (!ch[ci]) ch[ci] = { name: '', capacity: '' };
    ch[ci] = { ...ch[ci], [field]: value };
    setStationField(uname, bi, si, 'chillers', ch);
  };

  const refreshStorage = async (uname: string) => {
    try {
      const st = await getStorageStatus(uname);
      setStorage(prev => ({ ...prev, [uname]: { usedMB: st.usedMB, quotaMB: st.quotaMB, pct: st.pct } }));
      setError(t('storageRefreshed'));
    } catch { setError(t('storageRefreshFailed')); }
  };

  // ===== حذف شركة بالكامل — يتطلب كتابة "مسح" مرتين + باسورد الحماية لو محمية =====
  const askDeleteCompany = (username: string) => {
    const uname = username.toLowerCase();
    const company = companies.find(c => (c.username || '').toLowerCase() === uname);
    const name = company?.plantName || uname;
    setDeleteTarget({ uname, name, isProtected: company?.protected === true });
    setDelType1('');
    setDelType2('');
    setDelPass('');
  };

  const askProtect = (username: string, toLock: boolean) => {
    const uname = username.toLowerCase();
    const name = companies.find(c => (c.username || '').toLowerCase() === uname)?.plantName || uname;
    setProtectTarget({ uname, name, toLock });
    setProtectPass('');
  };

  const doProtect = async () => {
    if (!protectTarget) return;
    const { uname, name, toLock } = protectTarget;
    setProtectSaving(true);
    setError('');
    try {
      // Verify protection password server-side
      const vres = await fetch('/api/console/protect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: protectPass }),
      });
      const vjson = await vres.json().catch(() => ({}));
      if (!vres.ok || vjson?.success === false) {
        setError('❌ ' + (vjson?.message || t('wrongProtectPass')));
        setProtectPass('');
        setProtectSaving(false);
        return;
      }
      const cur = companies.find(c => (c.username || '').toLowerCase() === uname) || {} as UserSession;
      await saveUser({ ...cur, username: uname, protected: toLock });
      setCompanies(prev => prev.map(c => ((c.username || '').toLowerCase() === uname ? { ...c, protected: toLock } : c)));
      setError(`${t('companyProtectedMsg')}${toLock ? t('protectedLock') : t('protectedUnlock')}${t('companyNameSuffix')}${name}`);
      setProtectTarget(null);
    } catch (err) {
      console.error('protect company failed', err);
      setError(t('protectSaveFailed'));
    } finally {
      setProtectSaving(false);
      setProtectPass('');
    }
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDelType1('');
    setDelType2('');
    setDelPass('');
  };

  const doDeleteCompany = async () => {
    if (!deleteTarget) return;
    const { uname, name, isProtected } = deleteTarget;
    if (delType1.trim() !== 'مسح' || delType2.trim() !== 'مسح') {
      setError(t('deleteConfirmEnuf'));
      return;
    }
    setDeleting(true);
    setError('');
    try {
      if (isProtected) {
        // Verify protection password server-side before deleting a protected company
        const vres = await fetch('/api/console/protect', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: delPass }),
        });
        const vjson = await vres.json().catch(() => ({}));
        if (!vres.ok || vjson?.success === false) {
          setDeleting(false);
          setError('❌ ' + (vjson?.message || t('wrongProtectPassDelete')));
          return;
        }
      }
      await deleteCompany(uname);
      // Also purge from the browser's localStorage fallback list so it never comes back
      try {
        const saved = localStorage.getItem('registeredUsers');
        if (saved) {
          const users = JSON.parse(saved).filter((x: any) => {
            const xu = String((x.username || x.id || x.email || '')).toLowerCase();
            return xu !== uname;
          });
          localStorage.setItem('registeredUsers', JSON.stringify(users));
        }
      } catch {}
      setCompanies(prev => prev.filter(c => (c.username || '').toLowerCase() !== uname));
      setSubs(prev => { const n = { ...prev }; delete n[uname]; return n; });
      setTrees(prev => { const n = { ...prev }; delete n[uname]; return n; });
      setPlant(prev => { const n = { ...prev }; delete n[uname]; return n; });
      setStorage(prev => { const n = { ...prev }; delete n[uname]; return n; });
      setError(`${t('companyDeletedPrefix')}${name}`);
      setDeleteTarget(null);
    } catch (err) {
      console.error('delete company failed', err);
      setError(t('companyDeleteFailed'));
    } finally {
      setDeleting(false);
      setDelType1('');
      setDelType2('');
      setDelPass('');
    }
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setAuthed(false);
    setStep('login');
  };

  if (step === 'otp') {
    return (
      <Shell>
        <div className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-md p-8 shadow-[0_0_60px_rgba(56,189,248,0.12)]">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4"><BrandLogo width={150} fill rounded="rounded-2xl" /></div>
            <h2 className="text-xl font-black text-white mb-2">{t('otpTitle')}</h2>
            <p className="text-sm text-slate-400">{t('otpSentToPrefix')}{otpSentTo}</p>
          </div>
          <form onSubmit={handleOtp} className="space-y-4">
            <input value={otp} onChange={o => setOtp(o.target.value)} placeholder={t('otpPlaceholder')} className={`${inputCls} text-center text-lg tracking-widest`} />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-bold py-3 rounded-lg transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">{t('otpSubmit')}</button>
            <button type="button" onClick={() => { setStep('login'); setError(''); }} className="w-full text-slate-400 text-sm underline mt-1">{t('otpBackToLogin')}</button>
          </form>
        </div>
      </Shell>
    );
  }

  if (step === 'login') {
    return (
      <Shell>
        <div className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-md p-8 shadow-[0_0_60px_rgba(56,189,248,0.12)]">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4"><BrandLogo width={150} fill rounded="rounded-2xl" /></div>
            <h2 className="text-xl font-black text-white mb-2">{t('loginTitle')}</h2>
            <p className="text-xs text-slate-500">{t('loginSubtitle')}</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="flex flex-col">
              <label className="text-xs text-slate-400 font-semibold mb-1">{t('emailLabel')}</label>
              <input type="email" value={email} onChange={o => setEmail(o.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-slate-400 font-semibold mb-1">{t('passwordLabel')}</label>
              <input type="password" value={password} onChange={o => setPassword(o.target.value)} className={inputCls} />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" disabled={sending} className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-wait text-white font-bold py-3 rounded-lg transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">
              {sending ? t('sendingCode') : t('loginBtn')}
            </button>
            <button type="button" onClick={() => navigate('/')} className="w-full text-slate-400 text-sm underline mt-1">{t('backToHome')}</button>
          </form>
        </div>
      </Shell>
    );
  }

  const companiesTab = (
    <div className="grid grid-cols-1 gap-5">
      <div className="rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-5">
        <h3 className="text-base font-black text-white mb-3">{t('newCompanyTitle')}</h3>
        <form onSubmit={createCompany} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={comp.username} onChange={o => setComp({ ...comp, username: o.target.value })} placeholder={t('usernamePh')} className={inputCls} />
            <input type="password" value={comp.password} onChange={o => setComp({ ...comp, password: o.target.value })} placeholder={t('webPasswordPh')} className={inputCls} />
          </div>
          <input value={comp.plantName} onChange={o => setComp({ ...comp, plantName: o.target.value })} placeholder={t('plantNamePh')} className={inputCls} />
          <div className="grid grid-cols-3 gap-3">
            <input value={comp.country} onChange={o => setComp({ ...comp, country: o.target.value })} placeholder={t('countryPh')} className={inputCls} />
            <input value={comp.city} onChange={o => setComp({ ...comp, city: o.target.value })} placeholder={t('cityPh')} className={inputCls} />
            <input value={comp.phone} onChange={o => setComp({ ...comp, phone: o.target.value })} placeholder={t('phonePh')} className={inputCls} />
          </div>
          <input type="email" value={comp.email} onChange={o => setComp({ ...comp, email: o.target.value })} placeholder={t('emailPh')} className={inputCls} />
          <button type="submit" disabled={creating} className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">{creating ? t('checkingSaving') : t('createAccountBtn')}</button>
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-5">
        <h3 className="text-base font-black text-white mb-3">{t('registeredCompanies')} ({companies.length}) {companies.filter(u => isOnline(typeof presence[(u.username || '').toLowerCase()]?.lastSeenAt === 'number' ? presence[(u.username || '').toLowerCase()]?.lastSeenAt : null)).length > 0 && <span className="text-emerald-400">· 🟢 {companies.filter(u => isOnline(typeof presence[(u.username || '').toLowerCase()]?.lastSeenAt === 'number' ? presence[(u.username || '').toLowerCase()]?.lastSeenAt : null)).length}{t('onlineNow')}</span>}</h3>
        {companies.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">{t('noCompaniesYet')}</p>
        ) : (
          <div className="space-y-2 max-h-[75vh] overflow-y-auto">
{companies.map(u => {
              const uname = (u.username || u.id || u.email || 'user').toLowerCase();
              const open = treeOpen === uname;
              const accts = trees[uname] || [];
              const isProtected = u.protected === true;
              const st = storage[uname];
              const plantInfo = plant[uname] || {};
              return (
                <div key={uname} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">🏢 {u.plantName || u.username || u.name || '—'}</p>
                      <p className="text-[10px] text-slate-500 truncate" dir="ltr">@{u.username || u.email || '—'} · {u.email || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded ${u.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-sky-500/10 text-sky-300 border border-sky-500/30'}`}>{u.status || 'FREE_TRIAL'}</span>
                      {onlineBadge(uname)}
                      {isProtected && (
                        <span className="text-[10px] font-bold px-2 py-1 rounded bg-yellow-500/10 text-yellow-300 border border-yellow-500/30" title={t('protectedBadgeTitle')}>{t('protectedBadge')}</span>
                      )}
                      <button
                        onClick={() => openTree(uname)}
                        className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${open ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'bg-white/[0.05] border-white/10 text-slate-300 hover:border-sky-400/50'}`}
                      >
                        {t('treeBtn')} {accts.length > 0 ? `(${accts.length})` : ''}
                      </button>
                      <button
                        onClick={() => setEditingCompany(editingCompany === uname ? null : uname)}
                        className="bg-white/[0.05] border border-white/10 text-amber-300 text-[11px] font-bold px-2.5 py-1.5 rounded-lg hover:border-amber-400/50 transition-colors"
                        title={t('editCompanyTitle')}
                      >
                        {t('editBtn')}
                      </button>
                      <button
                        onClick={() => askProtect(uname, !isProtected)}
                        className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${isProtected ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/30' : 'bg-black/60 border border-white/10 text-slate-300 hover:border-yellow-500/50 hover:text-yellow-300'}`}
                        title={isProtected ? t('unlockTitle') : t('protectTitle')}
                      >
                        {isProtected ? t('unlockProtectBtn') : t('protectBtn')}
                      </button>
                      <button
                        onClick={() => askDeleteCompany(uname)}
                        className={`bg-white/[0.05] border border-white/10 text-red-400 hover:border-red-400/50 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors`}
                        title={isProtected ? t('deleteCompanyTitleProtected') : t('deleteCompanyTitleShort')}
                      >
                        {t('deleteBtnFull')}
                      </button>
                      <button
                        onClick={() => migrateBrowserData(uname)}
                        disabled={migrating === uname}
                        className="bg-white/[0.05] border border-white/10 text-emerald-300 text-[11px] font-bold px-2.5 py-1.5 rounded-lg hover:border-emerald-400/50 disabled:opacity-50 transition-colors"
                        title={t('migrateBtnTitle')}
                      >
                        {migrating === uname ? t('migratingBtn') : t('migrateBtn')}
                      </button>
                    </div>
                  </div>

                  {editingCompany === uname && (
                    <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={(companies.find(c => (c.username || '').toLowerCase() === uname)?.plantName || '') as string}
                        onChange={o => updateCompanyInfoLocal(uname, { plantName: o.target.value })}
                        className={inputCls}
                        placeholder={t('companyNamePh')}
                      />
                      <input
                        value={(companies.find(c => (c.username || '').toLowerCase() === uname)?.email || '') as string}
                        onChange={o => updateCompanyInfoLocal(uname, { email: o.target.value })}
                        className={inputCls}
                        placeholder={t('emailLabel')}
                        dir="ltr"
                      />
                      <input
                        value={(companies.find(c => (c.username || '').toLowerCase() === uname)?.phone || '') as string}
                        onChange={o => updateCompanyInfoLocal(uname, { phone: o.target.value })}
                        className={inputCls}
                        placeholder={t('phonePh')}
                      />
                      <input
                        value={(companies.find(c => (c.username || '').toLowerCase() === uname)?.country || '') as string}
                        onChange={o => updateCompanyInfoLocal(uname, { country: o.target.value })}
                        className={inputCls}
                        placeholder={t('countryPh')}
                      />
                      <input
                        value={(companies.find(c => (c.username || '').toLowerCase() === uname)?.city || '') as string}
                        onChange={o => updateCompanyInfoLocal(uname, { city: o.target.value })}
                        className={inputCls}
                        placeholder={t('cityPh')}
                      />
                      <button
                        onClick={() => {
                          const cur = companies.find(c => (c.username || '').toLowerCase() === uname) || {} as UserSession;
                          updateCompanyInfo(uname, cur);
                        }}
                        className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition"
                      >
                        {t('saveCompanyEdits')}
                      </button>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <p className="text-[11px] font-bold text-slate-300">{t('subscriptionLabel')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="date"
                        value={(subs[uname]?.subscriptionStart || '') as string}
                        onChange={o => setSub(uname, 'subscriptionStart', o.target.value)}
                        className={`${inputCls} text-xs`}
                        title={t('subStartTitle')}
                      />
                      <input
                        type="date"
                        value={(subs[uname]?.subscriptionEnd || '') as string}
                        onChange={o => setSub(uname, 'subscriptionEnd', o.target.value)}
                        className={`${inputCls} text-xs`}
                        title={t('subEndTitle')}
                      />
                      <select
                        value={(subs[uname]?.subscriptionStatus || '') as string}
                        onChange={o => setSub(uname, 'subscriptionStatus', o.target.value)}
                        className={inputCls}
                      >
                        <option value="">{t('subStatusPlaceholder')}</option>
                        <option value="active">{t('subStatusActive')}</option>
                        <option value="trial">{t('subStatusTrial')}</option>
                        <option value="expired">{t('subStatusExpired')}</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveSubscription(uname)}
                        className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition"
                      >
                        {t('saveSubscriptionBtn')}
                      </button>
                      {(subs[uname]?.subscriptionStatus === 'expired' || (subs[uname]?.subscriptionEnd && new Date(subs[uname].subscriptionEnd) < new Date())) ? (
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded">{t('subExpiredMsg')}</span>
                      ) : (subs[uname]?.subscriptionEnd ? (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded">{t('subActivePrefix')}{subs[uname].subscriptionEnd}</span>
                      ) : null)}
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/10">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-bold text-slate-300">{t('storageUsage')}</p>
                      <button onClick={() => refreshStorage(uname)} className="text-[10px] font-bold text-sky-400 hover:text-sky-300 underline">{t('refreshBtn')}</button>
                    </div>
                    {st ? (
                      <div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                          <span dir="ltr">{st.usedMB} MB</span>
                          <span dir="ltr">/ {st.quotaMB} MB</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${st.pct >= 90 ? 'bg-red-500' : st.pct >= 70 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                            style={{ width: `${Math.min(100, st.pct)}%` }}
                          />
                        </div>
                        <p className={`text-[10px] mt-1 font-bold ${st.pct >= 90 ? 'text-red-400' : st.pct >= 70 ? 'text-amber-300' : 'text-emerald-400'}`}>
                          {st.pct >= 90 ? t('storageFull') : st.pct >= 70 ? t('storageWarning') : t('storageOk')}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500">{t('readingStorage')}</p>
                    )}
                  </div>

                  {open && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
                      <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg px-3 py-2">
                        <p className="text-sm font-black text-white">{t('treeHeaderPrefix')}{u.plantName || u.username || uname}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5" dir="ltr">@{uname}</p>
                      </div>

                      {/* بيانات الشركة — نفس خواص لوحة الادارة (اللوجو + الانتاجية + المعدات + الاسطول) */}
                      <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2">
                        <button onClick={() => toggleCollapse(uname, 'plant')} className="w-full flex items-center justify-between gap-2 group">
                          <p className="text-[11px] font-bold text-slate-300">{t('plantDataBtn')}</p>
                          <span className={`text-[10px] text-slate-400 transition-transform ${isCollapsed(uname, 'plant') ? 'rotate-180' : ''}`}>{isCollapsed(uname, 'plant') ? '▲' : '▼'}</span>
                        </button>
                        {!isCollapsed(uname, 'plant') && (
                        <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          {plantInfo.logo ? (
                            <img src={plantInfo.logo} alt={t('logoAlt')} className="h-14 w-auto object-contain rounded-lg bg-white p-1" />
                          ) : (
                            <div className="h-14 w-20 rounded-lg bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center text-[9px] text-slate-500">{t('noLogo')}</div>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            <label className="bg-sky-500/15 text-sky-300 border border-sky-500/40 hover:bg-sky-500/25 text-[10px] px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors">
                              {plantInfo.logo ? t('changeLogo') : t('uploadLogo')}
                              <input type="file" accept="image/*" onChange={e => handlePlantLogo(uname, e)} className="hidden" />
                            </label>
                            {plantInfo.logo && (
                              <button onClick={() => plantField(uname, 'logo', '')} className="bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 text-[10px] px-3 py-1.5 rounded-lg font-bold transition-colors">{t('deleteLogo')}</button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input value={plantInfo.name || ''} onChange={o => plantField(uname, 'name', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('plantNamePh2')} />
                          <input value={plantInfo.manager || ''} onChange={o => plantField(uname, 'manager', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('plantManagerPh')} />
                          <input value={plantInfo.phone || ''} onChange={o => plantField(uname, 'phone', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('phonePh')} />
                          <input value={plantInfo.email || ''} onChange={o => plantField(uname, 'email', o.target.value)} className={`${inputCls} text-xs`} dir="ltr" placeholder={t('emailLabel')} />
                          <select value={plantInfo.country || ''} onChange={o => plantField(uname, 'country', o.target.value)} className={inputCls}>
                            <option value="">{t('countryPlaceholder')}</option>
                            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <select value={plantInfo.city || ''} onChange={o => plantField(uname, 'city', o.target.value)} className={inputCls}>
                            <option value="">{t('cityPlaceholder')}</option>
                            {(CITIES_BY_COUNTRY[plantInfo.country] || []).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input value={plantInfo.address || ''} onChange={o => plantField(uname, 'address', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('addressPh')} />
                          <input value={plantInfo.licenseNumber || ''} onChange={o => plantField(uname, 'licenseNumber', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('licensePh')} />
                          <input value={plantInfo.foundingYear || ''} onChange={o => plantField(uname, 'foundingYear', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('foundingYearPh')} />
                          <select value={plantInfo.products || 'both'} onChange={o => plantField(uname, 'products', o.target.value)} className={inputCls} title={t('productsTitle')}>
                            <option value="">{t('productsPlaceholder')}</option>
                            {PRODUCTS_OPTIONS.map(p => <option key={p.v} value={p.v}>{t(PRODUCT_X_KEY[p.v])}</option>)}
                          </select>
                          <input type="number" value={plantInfo.capacityM3 || ''} onChange={o => plantField(uname, 'capacityM3', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('capacityPh')} title={t('capacityTitle')} />
                          <input type="number" value={plantInfo.mixerCount || ''} onChange={o => plantField(uname, 'mixerCount', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('mixerCountPh')} title={t('mixerCountTitle')} />
                          <input type="number" value={plantInfo.truckCount || ''} onChange={o => plantField(uname, 'truckCount', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('fleetPh')} title={t('fleetTitle')} />
                        </div>

                        {/* الأفرع والمحطات */}
                        <div className="pt-2 border-t border-white/10 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <button onClick={() => toggleCollapse(uname, 'branches')} className="flex items-center gap-1.5 group">
                              <p className="text-[11px] font-bold text-slate-300">{t('branchesHeader')}</p>
                              <span className={`text-[10px] text-slate-400 transition-transform ${isCollapsed(uname, 'branches') ? 'rotate-180' : ''}`}>{isCollapsed(uname, 'branches') ? '▲' : '▼'}</span>
                            </button>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">{t('branchCountLabel')}</span>
                              <input
                                type="number" min={0} max={20}
                                value={(branches(uname).length || 0)}
                                onChange={o => setBranchCount(uname, Number(o.target.value) || 0)}
                                className="w-16 bg-white/[0.04] border border-white/10 rounded-lg p-1.5 text-slate-100 text-xs text-center outline-none focus:border-sky-400/70"
                              />
                            </div>
                          </div>

                          {!isCollapsed(uname, 'branches') && (
                          <div className="space-y-2">
                          {branches(uname).length === 0 && (
                            <p className="text-[10px] text-slate-500 text-center py-2">{t('branchesHint')}</p>
                          )}

                          {branches(uname).map((b, bi) => (
                            <div key={bi} className="rounded-lg bg-white/[0.03] border border-white/10 p-2.5 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-sky-300 w-14 shrink-0">{t('branchPrefix')}{bi + 1}</span>
                                <input value={b.name || ''} onChange={o => setBranchField(uname, bi, 'name', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('branchNamePh')} />
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] text-slate-400">{t('stationsLabel')}</span>
                                  <input
                                    type="number" min={0} max={30}
                                    value={((b.stations && b.stations.length) || 0)}
                                    onChange={o => setStationCount(uname, bi, Number(o.target.value) || 0)}
                                    className="w-14 bg-white/[0.04] border border-white/10 rounded-lg p-1.5 text-slate-100 text-xs text-center outline-none focus:border-sky-400/70"
                                  />
                                </div>
                              </div>

                              {(b.stations || []).map((s: any, si: number) => (
                                <div key={si} className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-2 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-amber-300 w-14 shrink-0">{t('stationPrefix')}{si + 1}</span>
                                    <input value={s.code || ''} onChange={o => setStationField(uname, bi, si, 'code', o.target.value)} className={`${inputCls} text-xs`} dir="ltr" placeholder={t('stationCodePh')} />
                                    <select value={s.type || 'concrete'} onChange={o => setStationField(uname, bi, si, 'type', o.target.value)} className={`${inputCls} text-xs shrink-0`} title={t('stationTypeTitle')}>
                                      {STATION_TYPE_OPTIONS.map(p => <option key={p.v} value={p.v}>{t(STATION_X_KEY[p.v])}</option>)}
                                    </select>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input type="number" value={s.designCap || ''} onChange={o => setStationField(uname, bi, si, 'designCap', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('designCapPh')} />
                                    <input type="number" value={s.actualCap || ''} onChange={o => setStationField(uname, bi, si, 'actualCap', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('actualCapPh')} />
                                  </div>

                                  {/* زراعات البلك */}
                                  {s.type !== 'concrete' && (
                                    <input type="number" value={s.blockMachines || ''} onChange={o => setStationField(uname, bi, si, 'blockMachines', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('blockMachinesPh')} title={t('blockMachinesTitle')} />
                                  )}

                                  {/* المشغلين والورديات */}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <p className="text-[10px] font-bold text-slate-400">{t('operatorsHeader')}</p>
                                      <button onClick={() => { const ops = [...((station(uname, bi, si).operators || []))]; ops.push({ name: '', shift: '' }); setStationField(uname, bi, si, 'operators', ops); }} className="text-[10px] font-bold text-sky-400 hover:text-sky-300 border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 rounded">{t('addOperator')}</button>
                                    </div>
                                    {(s.operators || []).map((op: any, oi: number) => (
                                      <div key={oi} className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-500 w-6 shrink-0">{oi + 1}</span>
                                        <input value={op.name || ''} onChange={o => setOperatorField(uname, bi, si, oi, 'name', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('operatorNamePh')} />
                                        <input value={op.shift || ''} onChange={o => setOperatorField(uname, bi, si, oi, 'shift', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('operatorShiftPh')} />
                                        <button onClick={() => setStationField(uname, bi, si, 'operators', (s.operators || []).filter((_: any, j: number) => j !== oi))} className="text-red-400 hover:bg-red-500/10 text-[10px] font-bold px-2 py-1 rounded border border-red-500/30 shrink-0">✕</button>
                                      </div>
                                    ))}
                                  </div>

                                  {/* الشيلارات (مصانع الثلج) */}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <p className="text-[10px] font-bold text-slate-400">{t('chillersHeader')}</p>
                                      <button onClick={() => { const ch = [...((station(uname, bi, si).chillers || []))]; ch.push({ name: '', capacity: '' }); setStationField(uname, bi, si, 'chillers', ch); }} className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 rounded">{t('addChiller')}</button>
                                    </div>
                                    {(s.chillers || []).map((c: any, ci: number) => (
                                      <div key={ci} className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-500 w-6 shrink-0">{ci + 1}</span>
                                        <input value={c.name || ''} onChange={o => setChillerField(uname, bi, si, ci, 'name', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('chillerNamePh')} />
                                        <input type="number" value={c.capacity || ''} onChange={o => setChillerField(uname, bi, si, ci, 'capacity', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('chillerCapPh')} />
                                        <button onClick={() => setStationField(uname, bi, si, 'chillers', (s.chillers || []).filter((_: any, j: number) => j !== ci))} className="text-red-400 hover:bg-red-500/10 text-[10px] font-bold px-2 py-1 rounded border border-red-500/30 shrink-0">✕</button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                        )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => savePlantProfileNow(uname)}
                            disabled={!plantDirty[uname]}
                            className={`${plantDirty[uname] ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400' : 'bg-white/[0.05] text-slate-500 cursor-not-allowed'} text-white text-[11px] font-bold px-4 py-2 rounded-lg transition`}
                          >
                            {t('saveCompanyDataBtn')}
                          </button>
                          {plantDirty[uname] && <span className="text-[10px] font-bold text-amber-300">{t('unsavedEdits')}</span>}
                          <span className="text-[10px] text-slate-500">{t('plantDataNote')}</span>
                        </div>
                        </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => saveAllTree(uname)} disabled={treeSaving} className="bg-gradient-to-r from-emerald-500 to-cyan-500 disabled:opacity-50 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition shadow-[0_0_14px_rgba(56,189,248,0.25)]">
                          {treeSaving ? t('uploadingShort') : t('saveAllDbBtn')}
                        </button>
                        <button onClick={() => exportCsv(uname)} className="bg-white/[0.06] border border-white/10 text-slate-300 text-[11px] font-bold px-3 py-2 rounded-lg hover:bg-sky-400/10 hover:border-sky-400/40 hover:text-sky-300 transition-colors">{t('exportCsvBtn')}</button>
                        <button onClick={() => exportPdf(uname)} className="bg-white/[0.06] border border-white/10 text-slate-300 text-[11px] font-bold px-3 py-2 rounded-lg hover:bg-sky-400/10 hover:border-sky-400/40 hover:text-sky-300 transition-colors">{t('exportPdfBtn')}</button>
                      </div>

                      {accts.length > 0 && (
                        <div className="flex flex-col gap-2">
                          {accts.map((a, i) => (
                            <div key={i} className="rounded-lg bg-white/[0.03] border border-white/10 p-2.5 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-bold text-sky-300 truncate" dir="ltr">{a.email}</p>
                                <div className="flex items-center gap-2 shrink-0">
                                  {onlineBadge(a.email)}
                                  <p className="text-[10px] text-slate-400">{a.roleAr} · {a.permissions.join('، ')}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input value={a.truck || ''} onChange={o => updateSavedRow(uname, i, 'truck', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('truckPh')} />
                                <input value={a.gps || ''} onChange={o => updateSavedRow(uname, i, 'gps', o.target.value)} className={`${inputCls} text-xs`} placeholder={t('gpsPh')} />
                              </div>
                              <div className="flex justify-end">
                                <button onClick={() => deleteTreeAccount(uname, i)} className="text-red-400 hover:bg-red-500/10 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-red-500/30 shrink-0">{t('deleteBtn')}</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-[1fr_80px_auto] gap-2">
                        <select value={treeRole} onChange={o => setTreeRole(o.target.value)} className={inputCls}>
                          {ROLES.map(r => <option key={r.key} value={r.key}>{t('role_' + r.key)}</option>)}
                        </select>
                        <input type="number" min={1} value={treeCount} onChange={o => setTreeCount(Number(o.target.value))} className={inputCls} placeholder={t('countPh')} />
                        <button onClick={generateDraft} className="bg-sky-500/15 border border-sky-500/40 text-sky-300 text-xs font-bold px-3 py-2 rounded-lg hover:bg-sky-500/25 transition-colors whitespace-nowrap">{t('generateBtn')}{t('role_' + (ROLES.find(r => r.key === treeRole)?.key || treeRole))}</button>
                      </div>

                      {treeDraft.length > 0 && (
                        <div className="space-y-2">
                          {treeDraft.map((r, i) => (
                            <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg bg-white/[0.03] border border-white/10 p-2.5">
                              <input value={r.email} onChange={o => updateTreeRow(i, 'email', o.target.value)} className={`${inputCls} text-sm`} dir="ltr" placeholder={t('emailPhShort')} />
                              <input value={r.phone} onChange={o => updateTreeRow(i, 'phone', o.target.value)} className={`${inputCls} text-sm`} dir="ltr" placeholder={t('phonePh')} />
                              <input type="password" value={r.password} onChange={o => updateTreeRow(i, 'password', o.target.value)} className={`${inputCls} text-sm`} dir="ltr" placeholder={t('passwordPhShort')} />
                              <input value={r.truck || ''} onChange={o => updateTreeRow(i, 'truck', o.target.value)} className={`${inputCls} text-sm`} dir="ltr" placeholder={t('truckPhShort')} />
                              <input value={r.gps || ''} onChange={o => updateTreeRow(i, 'gps', o.target.value)} className={`${inputCls} text-sm`} dir="ltr" placeholder={t('gpsPhShort')} />
                              <div className="text-[10px] text-slate-400">
                                {r.permissions.map(p => <span key={p} className="inline-block bg-slate-700/30 text-slate-300 px-1.5 py-0.5 rounded mr-1 mb-1">{p}</span>)}
                              </div>
                            </div>
                          ))}
                          <div className="flex gap-2">
                            <button onClick={saveTree} disabled={treeSaving} className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-lg transition shadow-[0_0_16px_rgba(56,189,248,0.25)]">
                              {treeSaving ? t('uploadingShort') : `${t('saveAccountsPrefix')}${treeDraft.length}${t('newAccountsSuffix')}`}
                            </button>
                            <button onClick={resetDraft} className="bg-white/[0.05] border border-white/10 text-slate-300 text-xs font-bold px-3 rounded-lg hover:border-red-400/50">{t('cancelBtn')}</button>
                          </div>
                        </div>
                      )}

                      {accts.length === 0 && treeDraft.length === 0 && (
                        <p className="text-[11px] text-slate-400 text-center">{t('treeHint')}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Shell>
      <div className="w-full max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">{t('panelTitle')}</h2>
            <p className="text-xs text-slate-400 mt-1">{t('panelSubtitle')}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/')} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-sky-400/60 hover:text-sky-300 transition-colors">{t('homeBtn')}</button>
            <button onClick={logout} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">{t('logout')}</button>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('sections')} className={`text-sm px-4 py-2 rounded-lg font-bold border transition-colors ${tab === 'sections' ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200'}`}>{t('tabSections')}</button>
          <button onClick={() => setTab('companies')} className={`text-sm px-4 py-2 rounded-lg font-bold border transition-colors ${tab === 'companies' ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200'}`}>{t('tabCompanies')}</button>
        </div>

        {tab === 'sections' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-5">
              <h3 className="text-base font-black text-white mb-1">{t('sectionsHint')}</h3>
              <p className="text-[11px] text-slate-500 mb-3">{t('sectionsHint2')}</p>
              <button onClick={saveConfigBtn} className="mb-3 w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white text-xs font-bold py-2.5 rounded-lg shadow-[0_0_16px_rgba(56,189,248,0.25)] transition">{t('saveConfigBtn')}</button>
              <div className="space-y-4">
                {CONSOLE_MODULES.map(mod => {
                  const ov = overrides[mod.path] || { image: '', bgImage: '' };
                  const upl = (k: 'image' | 'bgImage') => uploadingPath === `${mod.path}:${k}`;
                  return (
                    <div key={mod.path} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-sky-300">{mod.en} — {t(mod.path)}</span>
                        {ov.image || ov.bgImage ? <span className="text-[10px] text-emerald-400 font-bold">{t('activeBadge')}</span> : <span className="text-[10px] text-slate-500">{t('defaultBadge')}</span>}
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-center">
                          <input value={ov.image} onChange={o => updateOverride(mod.path, 'image', o.target.value)} placeholder={t('iconImageUrl')} className={`${inputCls} text-xs`} dir="ltr" />
                          <label className="shrink-0 bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-bold px-2.5 py-2.5 rounded-lg hover:bg-sky-500/25 transition-colors cursor-pointer">
                            {upl('image') ? t('uploadingShort') : t('uploadBtn')}
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, mod.path, 'image')} />
                          </label>
                        </div>
                        <div className="flex gap-2 items-center">
                          <input value={ov.bgImage} onChange={o => updateOverride(mod.path, 'bgImage', o.target.value)} placeholder={t('bgImageUrl')} className={`${inputCls} text-xs`} dir="ltr" />
                          <label className="shrink-0 bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-bold px-2.5 py-2.5 rounded-lg hover:bg-sky-500/25 transition-colors cursor-pointer">
                            {upl('bgImage') ? t('uploadingShort') : t('uploadBtn')}
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, mod.path, 'bgImage')} />
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-5">
                <h3 className="text-base font-black text-white mb-3">{t('addCustomSectionTitle')}</h3>
                <form onSubmit={addCustom} className="space-y-3">
                  <input name="en" placeholder={t('customNameEn')} className={inputCls} />
                  <input name="ar" placeholder={t('customNameAr')} className={inputCls} />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex gap-2 items-center">
                      <input value={customMedia.image} onChange={o => setCustomMedia(prev => ({ ...prev, image: o.target.value }))} placeholder={t('iconUrlCustom')} className={`${inputCls} text-xs`} dir="ltr" />
                      <label className="shrink-0 bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-bold px-2.5 py-2.5 rounded-lg hover:bg-sky-500/25 transition-colors cursor-pointer">
                        {uploadingPath === 'custom:image' ? t('uploadingShort') : t('uploadBtn')}
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleCustomUpload(e, 'image')} />
                      </label>
                    </div>
                    <div className="flex gap-2 items-center">
                      <input value={customMedia.bgImage} onChange={o => setCustomMedia(prev => ({ ...prev, bgImage: o.target.value }))} placeholder={t('bgUrlCustom')} className={`${inputCls} text-xs`} dir="ltr" />
                      <label className="shrink-0 bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-bold px-2.5 py-2.5 rounded-lg hover:bg-sky-500/25 transition-colors cursor-pointer">
                        {uploadingPath === 'custom:bgImage' ? t('uploadingShort') : t('uploadBtn')}
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleCustomUpload(e, 'bgImage')} />
                      </label>
                    </div>
                  </div>
                  <input name="desc" placeholder={t('customDesc')} className={inputCls} />
                  <button type="submit" className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-bold py-2.5 rounded-lg text-sm transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">{t('addSectionBtn')}</button>
                </form>
              </div>

              {custom.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-5">
                  <h3 className="text-base font-black text-white mb-3">{t('customSectionsTitle')} ({custom.length})</h3>
                  <div className="space-y-2">
                    {custom.map(c => (
                      <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{c.en} — {c.ar}</p>
                          <p className="text-[10px] text-slate-500 truncate" dir="ltr">{c.image || c.bgImage || t('noImage')}</p>
                        </div>
                        <button onClick={() => removeCustom(c.id)} className="text-red-400 hover:bg-red-500/10 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-red-500/30 shrink-0">{t('deleteBtn')}</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : companiesTab}

        {error && <p className="text-center text-sm mt-5 text-sky-300 font-bold">{error}</p>}

        {/* نافذة الحماية — باسورد الحماية للتحكم في حماية الشركة */}
        {protectTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-violet-500/40 bg-[#140B1E]/95 p-6 shadow-[0_0_60px_rgba(139,92,246,0.25)]">
              <h3 className="text-lg font-black text-violet-300 mb-1">
                {protectTarget.toLock ? t('protectModalTitleLocked') : t('protectModalTitleUnlock')}
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                {t('protectModalDescPrefix')}<b className="text-white">{protectTarget.name}</b>{t('protectModalDescSuffix')}
                {protectTarget.toLock && <><br />{t('protectModalLockedNote')}</>}
              </p>
              <input
                type="password"
                value={protectPass}
                onChange={o => setProtectPass(o.target.value)}
                placeholder={t('protectPassPh')}
                className={`${inputCls} text-center text-base font-black mb-4`}
                dir="ltr"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={doProtect}
                  disabled={protectSaving || !protectPass}
                  className={`flex-1 disabled:opacity-30 disabled:cursor-not-allowed ${protectTarget.toLock ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-500 hover:to-fuchsia-400' : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400'} text-white font-bold py-2.5 rounded-lg transition`}
                >
                  {protectSaving ? t('savingShort') : protectTarget.toLock ? t('protectSaveBtn') : t('unprotectSaveBtn')}
                </button>
                <button onClick={() => { setProtectTarget(null); setProtectPass(''); }} disabled={protectSaving} className="bg-white/[0.06] border border-white/10 text-slate-300 text-sm font-bold px-5 rounded-lg hover:border-slate-400/50 transition-colors">{t('cancelBtn')}</button>
              </div>
            </div>
          </div>
        )}

        {/* نافذة تأكيد الحذف — كتابة "مسح" مرتين + باسورد الحماية لو محمية */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={closeDeleteModal}>
            <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-[#140A0A]/95 p-6 shadow-[0_0_60px_rgba(239,68,68,0.25)]" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-black text-red-300 mb-1">{t('deleteModalTitle')}</h3>
              <p className="text-xs text-slate-400 mb-4">
                {t('deleteModalDescPrefix')}<b className="text-white">{deleteTarget.name}</b>{t('deleteModalDescSuffix')}
                <br />{t('deleteModalHintPrefix')}<b className="text-red-300">مسح</b>{t('deleteModalHintSuffix')}
              </p>
              <input
                value={delType1}
                onChange={o => setDelType1(o.target.value)}
                placeholder={t('delType1Ph')}
                className={`${inputCls} text-center text-base font-black mb-2 ${delType1.trim() === 'مسح' ? 'border-emerald-400/60' : ''}`}
                dir="rtl"
                autoFocus
              />
              <input
                value={delType2}
                onChange={o => setDelType2(o.target.value)}
                placeholder={t('delType2Ph')}
                className={`${inputCls} text-center text-base font-black mb-4 ${delType2.trim() === 'مسح' ? 'border-emerald-400/60' : ''}`}
                dir="rtl"
              />
              {deleteTarget.isProtected && (
                <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-2.5">
                  <p className="text-[11px] font-bold text-yellow-300 mb-1.5">{t('protectedDeleteNote')}</p>
                  <input
                    type="password"
                    value={delPass}
                    onChange={o => setDelPass(o.target.value)}
                    placeholder={t('protectPassPh')}
                    className={`${inputCls} text-center text-base font-black ${delPass.length > 0 ? 'border-emerald-400/60' : ''}`}
                    dir="ltr"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={doDeleteCompany}
                  disabled={deleting || delType1.trim() !== 'مسح' || delType2.trim() !== 'مسح' || (deleteTarget.isProtected && delPass.length < 3)}
                  className="flex-1 bg-gradient-to-r from-red-600 to-red-500 disabled:opacity-30 disabled:cursor-not-allowed hover:from-red-500 hover:to-red-400 text-white font-bold py-2.5 rounded-lg transition"
                >
                  {deleting ? t('deletingShort') : t('confirmDeleteBtn')}
                </button>
                <button onClick={closeDeleteModal} disabled={deleting} className="bg-white/[0.06] border border-white/10 text-slate-300 text-sm font-bold px-5 rounded-lg hover:border-slate-400/50 transition-colors">{t('cancelBtn')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-start justify-center p-4 py-10 text-slate-200" dir="rtl"
      style={{ background: "radial-gradient(ellipse 80% 40% at 50% -10%, rgba(56,189,248,0.13), transparent), #080C14" }}>
      {children}
    </div>
  );
}