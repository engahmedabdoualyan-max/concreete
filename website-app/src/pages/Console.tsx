import { useState, useEffect, type FormEvent, type ReactNode, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveUser, getAllUsers, saveCompanyTree, saveCompanySubscription, deleteCompany, uploadConsoleImage, saveSiteConfig, loadSiteConfig, getStorageStatus, loadPlantProfile, savePlantProfile, savePlantLogo, type CompanyTree, type SiteConfig } from '../firebase/firestore';
import BrandLogo from '../components/BrandLogo';
import type { UserSession } from '../context/AuthContext';
import { TREE_ROLES, treeModsForRole } from '../lib/treeRoles';
import { hashPassword } from '../lib/passwords';

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
    setError('💾 جاري حفظ الاعدادات على القاعدة...');
    try {
      await saveSiteConfig({ overrides, custom });
      setError('✅ تم حفظ الصور واعدادات الأقسام على القاعدة — دايمًا');
    } catch (err) {
      console.error('site config save', err);
      setError('❌ فشل الحفظ على القاعدة (محلياً محفوظ)');
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
        setError('📥 تم تحميل الاعدادات المحفوظة من القاعدة');
      }
    } catch (e) { console.error('load cfg', e); }
  };
  const [treeOpen, setTreeOpen] = useState<string | null>(null);
  const [trees, setTrees] = useState<Record<string, TreeAccount[]>>({});
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
    getAllUsers().then(list => {
      const clean = (list || []).map((u: any) => ({
        username: u.username || u.id || '',
        plantName: u.plantName || u.plant_name || u.name || u.username || '—',
        email: u.email || '',
        status: u.status || 'FREE_TRIAL',
        protected: u.protected === true,
      }));
      setCompanies(clean.length > 0 ? clean : (() => {
        try {
          const saved = localStorage.getItem('registeredUsers');
          return saved ? JSON.parse(saved) : [];
        } catch { return []; }
      })());
      // Load subscription dates for each company (from companyTrees doc)
      (async () => {
        try {
          const { loadCompanyTree } = await import('../firebase/firestore');
          const map: Record<string, { subscriptionStart: string; subscriptionEnd: string; subscriptionStatus: string }> = {};
          for (const c of clean) {
            const uname = (c.username || '').toLowerCase();
            if (!uname) continue;
            try {
              const t = await loadCompanyTree(uname);
              map[uname] = {
                subscriptionStart: t?.subscriptionStart || '',
                subscriptionEnd: t?.subscriptionEnd || '',
                subscriptionStatus: t?.subscriptionStatus || '',
              };
            } catch {}
          }
          setSubs(map);
        } catch {}
      })();
      // Load storage usage per company
      (async () => {
        try {
          const map: Record<string, { usedMB: number; quotaMB: number; pct: number }> = {};
          for (const c of clean) {
            const uname = (c.username || '').toLowerCase();
            if (!uname) continue;
            try {
              const st = await getStorageStatus(uname);
              map[uname] = { usedMB: st.usedMB, quotaMB: st.quotaMB, pct: st.pct };
            } catch {}
          }
          setStorage(map);
        } catch {}
      })();
    }).catch(() => {
      try {
        const saved = localStorage.getItem('registeredUsers');
        if (saved) setCompanies(JSON.parse(saved));
      } catch {}
    });
    if (!dbLoaded) { setDbLoaded(true); loadCfgFromDb(); }
  }, [step]);

  const input2 = (v: string) => v === undefined ? '' : v;

  // Hash account passwords at persistence time — plaintext is shown once in the draft/print only.
  const hashTreeRows = async (rows: TreeAccount[]): Promise<TreeAccount[]> => {
    const out: TreeAccount[] = [];
    for (const a of rows) {
      const passwordHash = await hashPassword(a.email || a.phone || '', a.password || '');
      out.push({ ...a, passwordHash, password: '' });
    }
    return out;
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('اكتب الإيميل والباسورد'); return; }
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
          setError('⚠️ تم الدخول بدون كود تحقق (خدمة البريد غير مفعّلة للخادم مؤقتاً)');
          setSending(false);
          return;
        }
        setError(json?.message || 'بيانات الدخول غير صحيحة');
        setSending(false);
        return;
      }
      setOtpSentTo(email.trim().toLowerCase());
      setStep('otp');
      setError('📩 تم إرسال كود التحقق على الإيميل');
    } catch (err: any) {
      console.error('console login error:', err);
      setError('تعذر الاتصال بالخادم — حاول مرة أخرى');
    }
    setSending(false);
  };

  const handleOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(otp)) { setError('أدخل كوداً مكوّناً من 6 أرقام'); return; }
    setSending(true);
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: otpSentTo || email.trim().toLowerCase(), code: otp }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        setError(json?.message || 'كود التأكيد غير صحيح');
        setSending(false);
        return;
      }
      localStorage.setItem(SESSION_KEY, '1');
      setAuthed(true);
      setStep('panel');
    } catch (err: any) {
      setError('تعذر الاتصال بالخادم — حاول مرة أخرى');
    }
    setSending(false);
  };

  const updateOverride = (path: string, key: 'image' | 'bgImage', value: string) => {
    const cur = overrides[path] || { image: '', bgImage: '' };
    const next: Overrides = { ...overrides, [path]: { ...cur, [key]: value } };
    setOverrides(next);
    saveCfg(next, custom);
    setError('تم الحفظ ✓');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, path: string, key: 'image' | 'bgImage') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPath(`${path}:${key}`);
    try {
      setError('⏳ رفع الصورة...');
      const url = await uploadConsoleImage(file, `modules/${path}`);
      if (!url) throw new Error('الرفع فشل بدون نتيجة');
      updateOverride(path, key, url);
      setError('✅ تم رفع الصورة وتحديث الإعدادات محلياً — اضغط "حفظ على القاعدة" لتخزينها');
    } catch (err) {
      console.error('Upload failed', err);
      setError(`❌ فشل رفع الصورة: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
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
      setError('⏳ رفع الصورة...');
      const url = await uploadConsoleImage(file, 'custom');
      if (!url) throw new Error('الرفع فشل بدون نتيجة');
      setCustomMedia(prev => ({ ...prev, [key]: url }));
      setError('✅ تم رفع الصورة — اضغط "اضافة القسم" للمتابعة');
    } catch (err) {
      console.error('Upload failed', err);
      setError(`❌ فشل رفع الصورة: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
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
    if (rows.length === 0) { setError('الشجرة فاضية — توليد حسابات اولاً'); return; }
    setTreeSaving(true);
    const company = companies.find(c => c.username?.toLowerCase() === username) || {} as UserSession;
    try {
      const fs = await import('../firebase/firestore');
      const hashed = await hashTreeRows(rows);
      const problems = await fs.checkTreeAccountConflicts(hashed, username);
      if (problems.length > 0) {
        setError('❌ تعارض في الحسابات — تم ايقاف الحفظ:\n' + problems.slice(0, 8).join('\n'));
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
      for (const a of hashed) {
        try {
          await fs.saveAppAccount({
            username: a.email,
            password: a.password,
            passwordHash: a.passwordHash,
            plantName: company.plantName || username,
            country: company.country, city: company.city,
            phone: a.phone, email: a.email,             status: 'APP_ACCOUNT',
            role: a.role, roleAr: a.roleAr, permissions: a.permissions, mods: a.mods || treeModsForRole(a.role), truck: a.truck, gps: a.gps,
          });
        } catch (e) { console.error('acct save', e); }
      }
      setError(`✅ تم حفظ وتسجيل ${rows.length} حساب في الداتابيز + الشجرة`);
    } catch (err) {
      console.error('Tree save failed', err);
      setError('فشل حفظ الشجرة ❌');
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
      ['الرحلات', ['trips_data', 'trips'], fs.saveTrips],
      ['الطلبات', ['concrete_plant_orders'], fs.saveOrders],
      ['العملاء', ['concrete_plant_customers'], fs.saveCustomers],
      ['الانتاج', ['plantProductionRuns'], fs.saveProductionRuns],
      ['المخزون', ['plantInventory'], fs.saveInventory],
      ['الوصفات', ['plantRecipes'], fs.saveRecipes],
      ['معايرة المختبر', ['calibrationLogs'], fs.saveCalibrationLogs],
      ['فحوصات الجودة', ['qcRecords'], fs.saveQCRecords],
      ['التسليمات', ['plantDeliveries'], fs.saveDeliveries],
      ['المدفوعات', ['plantPayments'], fs.savePayments],
      ['امر التوريد', ['plantPOs'], fs.savePurchaseOrders],
      ['الخرسانة الراجعة', ['plantReturns'], fs.saveReturns],
      ['كشوف الوزن', ['plantWeigh'], fs.saveWeighbridgeRecords],
      ['المصانع', ['plantAdditions'], fs.savePlants],
      ['مصانع البلوك', ['plantBlocks'], fs.saveBlockPlants],
      ['وقود الورشة', ['ws_fuel'], fs.saveFuelLogs],
      ['زيت الورشة', ['ws_oil'], fs.saveOilLogs],
      ['قطع غيار الورشة', ['ws_parts'], fs.saveSparePartLogs],
      ['أعطال الورشة', ['ws_breakdowns'], fs.saveBreakdowns],
      ['مخزون الورشة', ['ws_warehouse'], fs.saveWarehouse],
      ['طلبات شراء الورشة', ['ws_purchreq'], fs.savePurchaseReqs],
      ['محطات الخلط', ['ws_stations'], fs.saveStations],
      ['صيانة المحطات', ['ws_maints'], fs.savePeriodicMaints],
    ];

    // أسطول الورشة + إعداداتها مخزنة بمفاتيح ديناميكية fms_assets_<plant> / fms_cfg_<plant>
    const plantAssets = Object.keys(localStorage).filter((k) => k.startsWith('fms_assets_'));
    for (const k of plantAssets) {
      const v = read(k);
      if (!hasData(v)) continue;
      try { await fs.saveAssets(username, v); done.push('أسطول الورشة (' + k.replace('fms_assets_', '') + ')'); } catch (e) { console.error('migrate assets', e); failed++; }
    }
    const plantCfg = Object.keys(localStorage).filter((k) => k.startsWith('fms_cfg_'));
    for (const k of plantCfg) {
      const v = read(k);
      if (!hasData(v)) continue;
      try { await fs.saveWorkshopConfig(username, v); done.push('إعدادات الورشة (' + k.replace('fms_cfg_', '') + ')'); } catch (e) { console.error('migrate cfg', e); failed++; }
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
      ? `✅ تم نقل بيانات المتصفح للقاعدة: ${done.join('، ')}` + (failed ? ` (فشل ${failed})` : '')
      : '⚠️ لا توجد بيانات في المتصفح لهذه الشركة — سجّل دخولك على الموقع أولاً ثم عد هنا';
    setError(msg);
    setMigrating(null);
  };

  const exportCsv = (username: string) => {
    const rows = trees[username] || [];
    const company = companies.find(c => c.username?.toLowerCase() === username);
    const head = ['الايميل', 'الوظيفة', 'السيارة', 'GPS', 'التليفون', 'الباسورد', 'الصلاحيات'];
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
    setError('تم تنزيل ملف Excel (CSV) ✓');
  };

  const exportPdf = (username: string) => {
    const rows = trees[username] || [];
    const company = companies.find(c => c.username?.toLowerCase() === username);
    const w = window.open('', '_blank');
    if (!w) { setError('يفضل السماح بالنوافذ المنبثقة للطباعة'); return; }
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>شجرة التطبيق — ${company?.plantName || username}</title>
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
      <h1>🌳 شجرة حسابات التطبيق — ${company?.plantName || username}</h1>
      <h2>إجمالي الحسابات: ${rows.length} · ${new Date().toLocaleDateString('ar-EG')}</h2>
      <table>
        <thead><tr><th>#</th><th>الإيميل</th><th>الوظيفة</th><th>السيارة</th><th>GPS</th><th>التليفون</th><th>الباسورد</th><th>الصلاحيات</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `<tr><td>${i + 1}</td><td dir="ltr">${r.email}</td><td>${r.roleAr}</td><td>${r.truck || '—'}</td><td>${r.gps || '—'}</td><td dir="ltr">${r.phone || '—'}</td><td dir="ltr">${r.password || '—'}</td><td>${(r.permissions || []).map(p => `<span class="badge">${p}</span>`).join('')}</td></tr>`).join('')}
        </tbody>
      </table>
      <script>window.onload = () => { window.print(); };<\/script>
    </body></html>`);
    w.document.close();
    setError('نافذة الطباعة مفتوحة — PDF من خيار الحفظ كـ PDF');
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
        setError('❌ تعارض في الحسابات — تم ايقاف الحفظ:\n' + problems.slice(0, 8).join('\n'));
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
      for (const a of hashed) {
        try {
          await fs.saveAppAccount({
            username: a.email,
            password: a.password,
            passwordHash: a.passwordHash,
            plantName: company.plantName || treeOpen,
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
        } catch (e) { console.error('acct save', e); }
      }
      setTrees(prev => ({ ...prev, [treeOpen]: rows }));
      setTreeDraft([]);
      setError(`تم حفظ الشجرة — ${rows.length} حساب مسجل في الداتابيز ✓`);
    } catch (err) {
      console.error('Tree save failed', err);
      setError('فشل حفظ الشجرة ❌');
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
    setError(`تم حذف الحساب ${gone?.email || ''} نهائياً من الداتابيز ✓`);
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
    if (!en) { setError('اسم القسم مطلوب (انجليزي)'); return; }
    const next = [...custom, { id: `custom-${Date.now()}`, en, ar: ar || en, image, bgImage, desc }];
    setCustom(next);
    saveCfg(overrides, next);
    form.reset();
    setCustomMedia({ image: '', bgImage: '' });
    setError('تمت اضافة القسم ✓');
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
    if (!username || !password || !plantName || !email) { setError('الاسم والباسورد واسم الشركة والايميل مطلوبين'); setCreating(false); return; }
    const uname = username.trim().toLowerCase();
    if (uname.length < 3) { setError('اسم المستخدم يجب ان يكون ٣ احرف على الاقل'); setCreating(false); return; }
    if (password.length < 6) { setError('كلمة المرور يجب ان تكون ٦ احرف على الاقل'); setCreating(false); return; }
    try {
      const fs = await import('../firebase/firestore');
      const problems = await fs.checkLoginUniqueness(uname, password);
      if (problems.length > 0) { setError('❌ ' + problems.join(' — ')); setCreating(false); return; }
      const user: UserSession = { username: uname, password: '', country, city, plantName, phone, email, status: 'FREE_TRIAL' };
      (user as any).passwordHash = await hashPassword(uname, password);
      await fs.saveUser(user);
      setCompanies(prev => [user, ...prev.filter(c => (c.username || '').toLowerCase() !== uname)]);
      setComp({ username: '', password: '', plantName: '', country: 'Egypt', city: '', phone: '', email: '' });
      setError(`✅ تم انشاء حساب الشركة ${uname} ✓ — افتح الشجرة واضيف حسابات التطبيق`);
    } catch (err) {
      console.error('create company failed', err);
      setError('فشل انشاء الشركة — تأكد من اتصال الداتابيز ❌');
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
      setError(`✅ تم تحديث بيانات ${patch.plantName || uname}`);
    } catch (err) {
      console.error('update company failed', err);
      setError('فشل تحديث بيانات الشركة ❌');
    }
  };

  // ===== إدارة الاشتراك =====
  const saveSubscription = async (username: string) => {
    setError('');
    const uname = username.toLowerCase();
    const sub = subs[uname] || { subscriptionStart: '', subscriptionEnd: '', subscriptionStatus: '' };
    if (!sub.subscriptionEnd) { setError('اضبط تاريخ نهاية الاشتراك أولاً'); return; }
    try {
      await saveCompanySubscription(uname, sub);
      const cur = companies.find(c => (c.username || '').toLowerCase() === uname) || {} as UserSession;
      await saveUser({ ...cur, username: uname, subscriptionStart: sub.subscriptionStart, subscriptionEnd: sub.subscriptionEnd, subscriptionStatus: sub.subscriptionStatus }).catch(() => {});
      setError(`✅ تم حفظ الاشتراك لـ ${uname} حتى ${sub.subscriptionEnd}`);
    } catch (err) {
      console.error('save subscription failed', err);
      setError('فشل حفظ الاشتراك ❌');
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
    if (!file.type.startsWith('image/')) { setError('⚠️ اختر صورة فقط'); return; }
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
      img.onerror = () => setError('⚠️ تعذر قراءة الصورة');
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
      setError(`✅ تم حفظ بيانات شركة ${name || uname} (اللوغو والانتاجية والمعدات والاسطول)`);
    } catch (err) {
      console.error('save plant profile failed', err);
      setError('فشل حفظ بيانات الشركة ❌');
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
      setError('✅ تم تحديث مؤشر استهلاك البيانات');
    } catch { setError('فشل تحديث المؤشر ❌'); }
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
        setError('❌ ' + (vjson?.message || 'باسورد الحماية غير صحيح'));
        setProtectPass('');
        setProtectSaving(false);
        return;
      }
      const cur = companies.find(c => (c.username || '').toLowerCase() === uname) || {} as UserSession;
      await saveUser({ ...cur, username: uname, protected: toLock });
      setCompanies(prev => prev.map(c => ((c.username || '').toLowerCase() === uname ? { ...c, protected: toLock } : c)));
      setError(`✅ تم ${toLock ? 'حماية' : 'إلغاء حماية'} الشركة ${name}`);
      setProtectTarget(null);
    } catch (err) {
      console.error('protect company failed', err);
      setError('فشل تحديث الحماية ❌');
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
      setError('اكتب "مسح" في الحقلين لتأكيد الحذف');
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
          setError('❌ ' + (vjson?.message || 'باسورد الحماية غير صحيح — لا يمكن حذف شركة محمية بدونه'));
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
      setError(`✅ تم حذف الشركة ${name}`);
      setDeleteTarget(null);
    } catch (err) {
      console.error('delete company failed', err);
      setError('فشل حذف الشركة ❌');
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
            <h2 className="text-xl font-black text-white mb-2">🔐 كود التاكيد</h2>
            <p className="text-sm text-slate-400">تم ارسال الكود الى {otpSentTo}</p>
          </div>
          <form onSubmit={handleOtp} className="space-y-4">
            <input value={otp} onChange={o => setOtp(o.target.value)} placeholder="كود من 6 ارقام" className={`${inputCls} text-center text-lg tracking-widest`} />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-bold py-3 rounded-lg transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">✅ تأكيد الدخول</button>
            <button type="button" onClick={() => { setStep('login'); setError(''); }} className="w-full text-slate-400 text-sm underline mt-1">← رجوع للتسجيل</button>
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
            <h2 className="text-xl font-black text-white mb-2">🛡️ لوحة التحكم</h2>
            <p className="text-xs text-slate-500">دخول المسؤول — سيتم ارسال كود تاكيد على البريد</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="flex flex-col">
              <label className="text-xs text-slate-400 font-semibold mb-1">البريد الالكتروني</label>
              <input type="email" value={email} onChange={o => setEmail(o.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-slate-400 font-semibold mb-1">كلمة المرور</label>
              <input type="password" value={password} onChange={o => setPassword(o.target.value)} className={inputCls} />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" disabled={sending} className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-wait text-white font-bold py-3 rounded-lg transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">
              {sending ? '⏳ جاري ارسال الكود...' : '🔓 دخول'}
            </button>
            <button type="button" onClick={() => navigate('/')} className="w-full text-slate-400 text-sm underline mt-1">← العودة للرئيسية</button>
          </form>
        </div>
      </Shell>
    );
  }

  const companiesTab = (
    <div className="grid grid-cols-1 gap-5">
      <div className="rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-5">
        <h3 className="text-base font-black text-white mb-3">➕ انشاء حساب شركة جديدة</h3>
        <form onSubmit={createCompany} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={comp.username} onChange={o => setComp({ ...comp, username: o.target.value })} placeholder="اسم المستخدم *" className={inputCls} />
            <input type="password" value={comp.password} onChange={o => setComp({ ...comp, password: o.target.value })} placeholder="كلمة المرور (لوحة الويب) *" className={inputCls} />
          </div>
          <input value={comp.plantName} onChange={o => setComp({ ...comp, plantName: o.target.value })} placeholder="اسم الشركة / المحطة *" className={inputCls} />
          <div className="grid grid-cols-3 gap-3">
            <input value={comp.country} onChange={o => setComp({ ...comp, country: o.target.value })} placeholder="الدولة" className={inputCls} />
            <input value={comp.city} onChange={o => setComp({ ...comp, city: o.target.value })} placeholder="المدينة" className={inputCls} />
            <input value={comp.phone} onChange={o => setComp({ ...comp, phone: o.target.value })} placeholder="التليفون" className={inputCls} />
          </div>
          <input type="email" value={comp.email} onChange={o => setComp({ ...comp, email: o.target.value })} placeholder="البريد الالكتروني *" className={inputCls} />
          <button type="submit" disabled={creating} className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">{creating ? '⏳ جاري الفحص والحفظ...' : 'انشاء الحساب'}</button>
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-5">
        <h3 className="text-base font-black text-white mb-3">الشركات المسجلة ({companies.length})</h3>
        {companies.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">لا توجد شركات بعد — انشئ شركة ثم افتح شجرتها</p>
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
                      {isProtected && (
                        <span className="text-[10px] font-bold px-2 py-1 rounded bg-yellow-500/10 text-yellow-300 border border-yellow-500/30" title="شركة محمية — الحذف يتطلب باسورد الحماية">🔒 محمية</span>
                      )}
                      <button
                        onClick={() => openTree(uname)}
                        className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${open ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'bg-white/[0.05] border-white/10 text-slate-300 hover:border-sky-400/50'}`}
                      >
                        🌳 الشجرة {accts.length > 0 ? `(${accts.length})` : ''}
                      </button>
                      <button
                        onClick={() => setEditingCompany(editingCompany === uname ? null : uname)}
                        className="bg-white/[0.05] border border-white/10 text-amber-300 text-[11px] font-bold px-2.5 py-1.5 rounded-lg hover:border-amber-400/50 transition-colors"
                        title="تعديل بيانات الشركة"
                      >
                        ✏️ تعديل
                      </button>
                      <button
                        onClick={() => askProtect(uname, !isProtected)}
                        className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${isProtected ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/30' : 'bg-black/60 border border-white/10 text-slate-300 hover:border-yellow-500/50 hover:text-yellow-300'}`}
                        title={isProtected ? 'الشركة محمية — اضغط لفك الحماية (بباسورد)' : 'حماية الشركة من الحذف (بباسورد)'}
                      >
                        {isProtected ? '🔓 فك الحماية' : '🔒 حماية'}
                      </button>
                      <button
                        onClick={() => askDeleteCompany(uname)}
                        className={`bg-white/[0.05] border border-white/10 text-red-400 hover:border-red-400/50 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors`}
                        title={isProtected ? 'حذف الشركة نهائياً — يتطلب باسورد الحماية' : 'حذف الشركة نهائياً'}
                      >
                        🗑️ حذف
                      </button>
                      <button
                        onClick={() => migrateBrowserData(uname)}
                        disabled={migrating === uname}
                        className="bg-white/[0.05] border border-white/10 text-emerald-300 text-[11px] font-bold px-2.5 py-1.5 rounded-lg hover:border-emerald-400/50 disabled:opacity-50 transition-colors"
                        title="نقل بيانات المتصفح (الرحلات والطلبات والمخزون...) إلى قاعدة البيانات مرة واحدة"
                      >
                        {migrating === uname ? '⏳ نقل...' : '📥 نقل بيانات'}
                      </button>
                    </div>
                  </div>

                  {editingCompany === uname && (
                    <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={(companies.find(c => (c.username || '').toLowerCase() === uname)?.plantName || '') as string}
                        onChange={o => updateCompanyInfoLocal(uname, { plantName: o.target.value })}
                        className={inputCls}
                        placeholder="اسم الشركة"
                      />
                      <input
                        value={(companies.find(c => (c.username || '').toLowerCase() === uname)?.email || '') as string}
                        onChange={o => updateCompanyInfoLocal(uname, { email: o.target.value })}
                        className={inputCls}
                        placeholder="البريد الالكتروني"
                        dir="ltr"
                      />
                      <input
                        value={(companies.find(c => (c.username || '').toLowerCase() === uname)?.phone || '') as string}
                        onChange={o => updateCompanyInfoLocal(uname, { phone: o.target.value })}
                        className={inputCls}
                        placeholder="التليفون"
                      />
                      <input
                        value={(companies.find(c => (c.username || '').toLowerCase() === uname)?.country || '') as string}
                        onChange={o => updateCompanyInfoLocal(uname, { country: o.target.value })}
                        className={inputCls}
                        placeholder="الدولة"
                      />
                      <input
                        value={(companies.find(c => (c.username || '').toLowerCase() === uname)?.city || '') as string}
                        onChange={o => updateCompanyInfoLocal(uname, { city: o.target.value })}
                        className={inputCls}
                        placeholder="المدينة"
                      />
                      <button
                        onClick={() => {
                          const cur = companies.find(c => (c.username || '').toLowerCase() === uname) || {} as UserSession;
                          updateCompanyInfo(uname, cur);
                        }}
                        className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition"
                      >
                        💾 حفظ تعديلات الشركة
                      </button>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <p className="text-[11px] font-bold text-slate-300">📅 الاشتراك</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="date"
                        value={(subs[uname]?.subscriptionStart || '') as string}
                        onChange={o => setSub(uname, 'subscriptionStart', o.target.value)}
                        className={`${inputCls} text-xs`}
                        title="بداية الاشتراك"
                      />
                      <input
                        type="date"
                        value={(subs[uname]?.subscriptionEnd || '') as string}
                        onChange={o => setSub(uname, 'subscriptionEnd', o.target.value)}
                        className={`${inputCls} text-xs`}
                        title="نهاية الاشتراك"
                      />
                      <select
                        value={(subs[uname]?.subscriptionStatus || '') as string}
                        onChange={o => setSub(uname, 'subscriptionStatus', o.target.value)}
                        className={inputCls}
                      >
                        <option value="">— الحالة —</option>
                        <option value="active">نشط</option>
                        <option value="trial">تجريبي</option>
                        <option value="expired">منتهي</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveSubscription(uname)}
                        className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition"
                      >
                        💾 حفظ الاشتراك
                      </button>
                      {(subs[uname]?.subscriptionStatus === 'expired' || (subs[uname]?.subscriptionEnd && new Date(subs[uname].subscriptionEnd) < new Date())) ? (
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded">🔒 الاشتراك منتهي — سيتم قفل التطبيق عند الدخول</span>
                      ) : (subs[uname]?.subscriptionEnd ? (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded">✅ اشتراك مفعل حتى {subs[uname].subscriptionEnd}</span>
                      ) : null)}
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/10">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-bold text-slate-300">💾 استهلاك البيانات</p>
                      <button onClick={() => refreshStorage(uname)} className="text-[10px] font-bold text-sky-400 hover:text-sky-300 underline">تحديث</button>
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
                          {st.pct >= 90 ? '⚠️ مساحة شبه ممتلئة — احذف بيانات قديمة' : st.pct >= 70 ? 'تنبيه: الاقتراب من حد المساحة' : 'المساحة متاحة'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500">جارِ قراءة مساحة البيانات...</p>
                    )}
                  </div>

                  {open && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
                      <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg px-3 py-2">
                        <p className="text-sm font-black text-white">🌳 شجرة حسابات — {u.plantName || u.username || uname}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5" dir="ltr">@{uname}</p>
                      </div>

                      {/* بيانات الشركة — نفس خواص لوحة الادارة (اللوجو + الانتاجية + المعدات + الاسطول) */}
                      <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2">
                        <button onClick={() => toggleCollapse(uname, 'plant')} className="w-full flex items-center justify-between gap-2 group">
                          <p className="text-[11px] font-bold text-slate-300">🏭 بيانات الشركة (لوحة الادارة)</p>
                          <span className={`text-[10px] text-slate-400 transition-transform ${isCollapsed(uname, 'plant') ? 'rotate-180' : ''}`}>{isCollapsed(uname, 'plant') ? '▲' : '▼'}</span>
                        </button>
                        {!isCollapsed(uname, 'plant') && (
                        <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          {plantInfo.logo ? (
                            <img src={plantInfo.logo} alt="لوجو الشركة" className="h-14 w-auto object-contain rounded-lg bg-white p-1" />
                          ) : (
                            <div className="h-14 w-20 rounded-lg bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center text-[9px] text-slate-500">لا يوجد لوجو</div>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            <label className="bg-sky-500/15 text-sky-300 border border-sky-500/40 hover:bg-sky-500/25 text-[10px] px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors">
                              📤 {plantInfo.logo ? 'تغيير اللوجو' : 'رفع اللوجو'}
                              <input type="file" accept="image/*" onChange={e => handlePlantLogo(uname, e)} className="hidden" />
                            </label>
                            {plantInfo.logo && (
                              <button onClick={() => plantField(uname, 'logo', '')} className="bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 text-[10px] px-3 py-1.5 rounded-lg font-bold transition-colors">🗑️ حذف اللوجو</button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input value={plantInfo.name || ''} onChange={o => plantField(uname, 'name', o.target.value)} className={`${inputCls} text-xs`} placeholder="اسم المصنع" />
                          <input value={plantInfo.manager || ''} onChange={o => plantField(uname, 'manager', o.target.value)} className={`${inputCls} text-xs`} placeholder="مدير المصنع" />
                          <input value={plantInfo.phone || ''} onChange={o => plantField(uname, 'phone', o.target.value)} className={`${inputCls} text-xs`} placeholder="التليفون" />
                          <input value={plantInfo.email || ''} onChange={o => plantField(uname, 'email', o.target.value)} className={`${inputCls} text-xs`} dir="ltr" placeholder="البريد الالكتروني" />
                          <select value={plantInfo.country || ''} onChange={o => plantField(uname, 'country', o.target.value)} className={inputCls}>
                            <option value="">— الدولة —</option>
                            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <select value={plantInfo.city || ''} onChange={o => plantField(uname, 'city', o.target.value)} className={inputCls}>
                            <option value="">— المدينة —</option>
                            {(CITIES_BY_COUNTRY[plantInfo.country] || []).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input value={plantInfo.address || ''} onChange={o => plantField(uname, 'address', o.target.value)} className={`${inputCls} text-xs`} placeholder="العنوان" />
                          <input value={plantInfo.licenseNumber || ''} onChange={o => plantField(uname, 'licenseNumber', o.target.value)} className={`${inputCls} text-xs`} placeholder="رقم الترخيص" />
                          <input value={plantInfo.foundingYear || ''} onChange={o => plantField(uname, 'foundingYear', o.target.value)} className={`${inputCls} text-xs`} placeholder="سنة التأسيس" />
                          <select value={plantInfo.products || 'both'} onChange={o => plantField(uname, 'products', o.target.value)} className={inputCls} title="المنتجات">
                            <option value="">— المنتجات —</option>
                            {PRODUCTS_OPTIONS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
                          </select>
                          <input type="number" value={plantInfo.capacityM3 || ''} onChange={o => plantField(uname, 'capacityM3', o.target.value)} className={`${inputCls} text-xs`} placeholder="📏 الانتاجية م³" title="الانتاجية م³" />
                          <input type="number" value={plantInfo.mixerCount || ''} onChange={o => plantField(uname, 'mixerCount', o.target.value)} className={`${inputCls} text-xs`} placeholder="🎛️ عدد الخلاطات / المعدات" title="عدد الخلاطات / المعدات" />
                          <input type="number" value={plantInfo.truckCount || ''} onChange={o => plantField(uname, 'truckCount', o.target.value)} className={`${inputCls} text-xs`} placeholder="🚛 حجم الاسطول" title="عدد السيارات / حجم الاسطول" />
                        </div>

                        {/* الأفرع والمحطات */}
                        <div className="pt-2 border-t border-white/10 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <button onClick={() => toggleCollapse(uname, 'branches')} className="flex items-center gap-1.5 group">
                              <p className="text-[11px] font-bold text-slate-300">🏗️ الأفرع والمحطات والورديات</p>
                              <span className={`text-[10px] text-slate-400 transition-transform ${isCollapsed(uname, 'branches') ? 'rotate-180' : ''}`}>{isCollapsed(uname, 'branches') ? '▲' : '▼'}</span>
                            </button>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">عدد الأفرع</span>
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
                            <p className="text-[10px] text-slate-500 text-center py-2">اختر عدد الأفرع ثم املأ بيانات كل فرع ومحطاته</p>
                          )}

                          {branches(uname).map((b, bi) => (
                            <div key={bi} className="rounded-lg bg-white/[0.03] border border-white/10 p-2.5 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-sky-300 w-14 shrink-0">فرع {bi + 1}</span>
                                <input value={b.name || ''} onChange={o => setBranchField(uname, bi, 'name', o.target.value)} className={`${inputCls} text-xs`} placeholder="اسم الفرع" />
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] text-slate-400">المحطات</span>
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
                                    <span className="text-[10px] font-bold text-amber-300 w-14 shrink-0">محطة {si + 1}</span>
                                    <input value={s.code || ''} onChange={o => setStationField(uname, bi, si, 'code', o.target.value)} className={`${inputCls} text-xs`} dir="ltr" placeholder="كود المحطة" />
                                    <select value={s.type || 'concrete'} onChange={o => setStationField(uname, bi, si, 'type', o.target.value)} className={`${inputCls} text-xs shrink-0`} title="نوع المحطة">
                                      {STATION_TYPE_OPTIONS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
                                    </select>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input type="number" value={s.designCap || ''} onChange={o => setStationField(uname, bi, si, 'designCap', o.target.value)} className={`${inputCls} text-xs`} placeholder="🎚️ الانتاجية التصميمية م³/س" />
                                    <input type="number" value={s.actualCap || ''} onChange={o => setStationField(uname, bi, si, 'actualCap', o.target.value)} className={`${inputCls} text-xs`} placeholder="⚙️ الانتاجية الفعلية م³/س" />
                                  </div>

                                  {/* زراعات البلك */}
                                  {s.type !== 'concrete' && (
                                    <input type="number" value={s.blockMachines || ''} onChange={o => setStationField(uname, bi, si, 'blockMachines', o.target.value)} className={`${inputCls} text-xs`} placeholder="🧱 عدد زراعات البلك (ماكينات الانتاج)" title="عدد زراعات البلك (ماكينة انتاج البلك)" />
                                  )}

                                  {/* المشغلين والورديات */}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <p className="text-[10px] font-bold text-slate-400">👷 المشغلون والورديات</p>
                                      <button onClick={() => { const ops = [...((station(uname, bi, si).operators || []))]; ops.push({ name: '', shift: '' }); setStationField(uname, bi, si, 'operators', ops); }} className="text-[10px] font-bold text-sky-400 hover:text-sky-300 border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 rounded">➕ مشغل</button>
                                    </div>
                                    {(s.operators || []).map((op: any, oi: number) => (
                                      <div key={oi} className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-500 w-6 shrink-0">{oi + 1}</span>
                                        <input value={op.name || ''} onChange={o => setOperatorField(uname, bi, si, oi, 'name', o.target.value)} className={`${inputCls} text-xs`} placeholder="اسم المشغل" />
                                        <input value={op.shift || ''} onChange={o => setOperatorField(uname, bi, si, oi, 'shift', o.target.value)} className={`${inputCls} text-xs`} placeholder="الوردية / فترة التواجد" />
                                        <button onClick={() => setStationField(uname, bi, si, 'operators', (s.operators || []).filter((_: any, j: number) => j !== oi))} className="text-red-400 hover:bg-red-500/10 text-[10px] font-bold px-2 py-1 rounded border border-red-500/30 shrink-0">✕</button>
                                      </div>
                                    ))}
                                  </div>

                                  {/* الشيلارات (مصانع الثلج) */}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <p className="text-[10px] font-bold text-slate-400">🧊 الشيلارات (مصانع الثلج)</p>
                                      <button onClick={() => { const ch = [...((station(uname, bi, si).chillers || []))]; ch.push({ name: '', capacity: '' }); setStationField(uname, bi, si, 'chillers', ch); }} className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 rounded">➕ شيلار</button>
                                    </div>
                                    {(s.chillers || []).map((c: any, ci: number) => (
                                      <div key={ci} className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-500 w-6 shrink-0">{ci + 1}</span>
                                        <input value={c.name || ''} onChange={o => setChillerField(uname, bi, si, ci, 'name', o.target.value)} className={`${inputCls} text-xs`} placeholder="اسم / كود الشيلار" />
                                        <input type="number" value={c.capacity || ''} onChange={o => setChillerField(uname, bi, si, ci, 'capacity', o.target.value)} className={`${inputCls} text-xs`} placeholder="الانتاجية طن/يوم" />
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
                            💾 حفظ بيانات الشركة
                          </button>
                          {plantDirty[uname] && <span className="text-[10px] font-bold text-amber-300">تعديلات غير محفوظة</span>}
                          <span className="text-[10px] text-slate-500">تُقرأ في لوحة الادارة والطباعة والتقرير في تطبيق الشركة</span>
                        </div>
                        </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => saveAllTree(uname)} disabled={treeSaving} className="bg-gradient-to-r from-emerald-500 to-cyan-500 disabled:opacity-50 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition shadow-[0_0_14px_rgba(56,189,248,0.25)]">
                          {treeSaving ? '⏳...' : '💾 حفظ كل التعديلات على الداتابيز'}
                        </button>
                        <button onClick={() => exportCsv(uname)} className="bg-white/[0.06] border border-white/10 text-slate-300 text-[11px] font-bold px-3 py-2 rounded-lg hover:bg-sky-400/10 hover:border-sky-400/40 hover:text-sky-300 transition-colors">📊 Excel CSV</button>
                        <button onClick={() => exportPdf(uname)} className="bg-white/[0.06] border border-white/10 text-slate-300 text-[11px] font-bold px-3 py-2 rounded-lg hover:bg-sky-400/10 hover:border-sky-400/40 hover:text-sky-300 transition-colors">🖨️ PDF/طباعة</button>
                      </div>

                      {accts.length > 0 && (
                        <div className="flex flex-col gap-2">
                          {accts.map((a, i) => (
                            <div key={i} className="rounded-lg bg-white/[0.03] border border-white/10 p-2.5 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-bold text-sky-300 truncate" dir="ltr">{a.email}</p>
                                <p className="text-[10px] text-slate-400">{a.roleAr} · {a.permissions.join('، ')}</p>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input value={a.truck || ''} onChange={o => updateSavedRow(uname, i, 'truck', o.target.value)} className={`${inputCls} text-xs`} placeholder="🚚 السيارة / لوحة التسجيل" />
                                <input value={a.gps || ''} onChange={o => updateSavedRow(uname, i, 'gps', o.target.value)} className={`${inputCls} text-xs`} placeholder="📡 جهاز GPS / Tracker ID" />
                              </div>
                              <div className="flex justify-end">
                                <button onClick={() => deleteTreeAccount(uname, i)} className="text-red-400 hover:bg-red-500/10 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-red-500/30 shrink-0">حذف</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-[1fr_80px_auto] gap-2">
                        <select value={treeRole} onChange={o => setTreeRole(o.target.value)} className={inputCls}>
                          {ROLES.map(r => <option key={r.key} value={r.key}>{r.ar}</option>)}
                        </select>
                        <input type="number" min={1} value={treeCount} onChange={o => setTreeCount(Number(o.target.value))} className={inputCls} placeholder="عدد" />
                        <button onClick={generateDraft} className="bg-sky-500/15 border border-sky-500/40 text-sky-300 text-xs font-bold px-3 py-2 rounded-lg hover:bg-sky-500/25 transition-colors whitespace-nowrap">⚙️ توليد {ROLES.find(r => r.key === treeRole)?.ar}</button>
                      </div>

                      {treeDraft.length > 0 && (
                        <div className="space-y-2">
                          {treeDraft.map((r, i) => (
                            <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg bg-white/[0.03] border border-white/10 p-2.5">
                              <input value={r.email} onChange={o => updateTreeRow(i, 'email', o.target.value)} className={`${inputCls} text-sm`} dir="ltr" placeholder="الايميل" />
                              <input value={r.phone} onChange={o => updateTreeRow(i, 'phone', o.target.value)} className={`${inputCls} text-sm`} dir="ltr" placeholder="التليفون" />
                              <input type="password" value={r.password} onChange={o => updateTreeRow(i, 'password', o.target.value)} className={`${inputCls} text-sm`} dir="ltr" placeholder="الباسورد" />
                              <input value={r.truck || ''} onChange={o => updateTreeRow(i, 'truck', o.target.value)} className={`${inputCls} text-sm`} dir="ltr" placeholder="🚚 السيارة" />
                              <input value={r.gps || ''} onChange={o => updateTreeRow(i, 'gps', o.target.value)} className={`${inputCls} text-sm`} dir="ltr" placeholder="📡 GPS" />
                              <div className="text-[10px] text-slate-400">
                                {r.permissions.map(p => <span key={p} className="inline-block bg-slate-700/30 text-slate-300 px-1.5 py-0.5 rounded mr-1 mb-1">{p}</span>)}
                              </div>
                            </div>
                          ))}
                          <div className="flex gap-2">
                            <button onClick={saveTree} disabled={treeSaving} className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-lg transition shadow-[0_0_16px_rgba(56,189,248,0.25)]">
                              {treeSaving ? '⏳...' : `💾 حفظ ${treeDraft.length} حساب جديد في الداتابيز`}
                            </button>
                            <button onClick={resetDraft} className="bg-white/[0.05] border border-white/10 text-slate-300 text-xs font-bold px-3 rounded-lg hover:border-red-400/50">إلغاء</button>
                          </div>
                        </div>
                      )}

                      {accts.length === 0 && treeDraft.length === 0 && (
                        <p className="text-[11px] text-slate-400 text-center">اختر الوظيفة وعدد التطبيقات ثم اضغط توليد — كل حساب هيتسجل ايميله وصلاحياته وربط سيارته وGPS في الداتابيز</p>
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
            <h2 className="text-2xl font-black text-white tracking-tight">🛡️ لوحة التحكم الكاملة</h2>
            <p className="text-xs text-slate-400 mt-1">رفع صور الاقسام + شجرة حسابات التطبيق للشركات</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/')} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-sky-400/60 hover:text-sky-300 transition-colors">🏠 الرئيسية</button>
            <button onClick={logout} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">🚪 خروج</button>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('sections')} className={`text-sm px-4 py-2 rounded-lg font-bold border transition-colors ${tab === 'sections' ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200'}`}>🖼️ الاقسام والصور</button>
          <button onClick={() => setTab('companies')} className={`text-sm px-4 py-2 rounded-lg font-bold border transition-colors ${tab === 'companies' ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-slate-200'}`}>🏢 الشركات واشجار التطبيق</button>
        </div>

        {tab === 'sections' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-5">
              <h3 className="text-base font-black text-white mb-1">الاقسام الحالية — رفع الصور من الجهاز</h3>
              <p className="text-[11px] text-slate-500 mb-3">اضغط "رفع صورة" واختار ملف من جهازك — تظهر فوراً. بعد الانتهاء اضغط "حفظ على القاعدة" حتى تُحفظ الصور وتتاح مباشرة.</p>
              <button onClick={saveConfigBtn} className="mb-3 w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white text-xs font-bold py-2.5 rounded-lg shadow-[0_0_16px_rgba(56,189,248,0.25)] transition">💾 حفظ الصور والأقسام المخصصة على القاعدة</button>
              <div className="space-y-4">
                {CONSOLE_MODULES.map(mod => {
                  const ov = overrides[mod.path] || { image: '', bgImage: '' };
                  const upl = (k: 'image' | 'bgImage') => uploadingPath === `${mod.path}:${k}`;
                  return (
                    <div key={mod.path} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-sky-300">{mod.en} — {mod.ar}</span>
                        {ov.image || ov.bgImage ? <span className="text-[10px] text-emerald-400 font-bold">مفعّل ✓</span> : <span className="text-[10px] text-slate-500">افتراضي</span>}
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-center">
                          <input value={ov.image} onChange={o => updateOverride(mod.path, 'image', o.target.value)} placeholder="رابط صورة الايقونة (او ارفع)" className={`${inputCls} text-xs`} dir="ltr" />
                          <label className="shrink-0 bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-bold px-2.5 py-2.5 rounded-lg hover:bg-sky-500/25 transition-colors cursor-pointer">
                            {upl('image') ? '⏳...' : '⬆️ رفع'}
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload(e, mod.path, 'image')} />
                          </label>
                        </div>
                        <div className="flex gap-2 items-center">
                          <input value={ov.bgImage} onChange={o => updateOverride(mod.path, 'bgImage', o.target.value)} placeholder="رابط صورة خلفية القسم (او ارفع)" className={`${inputCls} text-xs`} dir="ltr" />
                          <label className="shrink-0 bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-bold px-2.5 py-2.5 rounded-lg hover:bg-sky-500/25 transition-colors cursor-pointer">
                            {upl('bgImage') ? '⏳...' : '⬆️ رفع'}
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
                <h3 className="text-base font-black text-white mb-3">➕ اضافة قسم جديد (بالصور المرفوعة)</h3>
                <form onSubmit={addCustom} className="space-y-3">
                  <input name="en" placeholder="اسم القسم بالانجليزي *" className={inputCls} />
                  <input name="ar" placeholder="اسم القسم بالعربي" className={inputCls} />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex gap-2 items-center">
                      <input value={customMedia.image} onChange={o => setCustomMedia(prev => ({ ...prev, image: o.target.value }))} placeholder="رابط صورة الايقونة" className={`${inputCls} text-xs`} dir="ltr" />
                      <label className="shrink-0 bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-bold px-2.5 py-2.5 rounded-lg hover:bg-sky-500/25 transition-colors cursor-pointer">
                        {uploadingPath === 'custom:image' ? '⏳...' : '⬆️ رفع'}
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleCustomUpload(e, 'image')} />
                      </label>
                    </div>
                    <div className="flex gap-2 items-center">
                      <input value={customMedia.bgImage} onChange={o => setCustomMedia(prev => ({ ...prev, bgImage: o.target.value }))} placeholder="رابط صورة الخلفية" className={`${inputCls} text-xs`} dir="ltr" />
                      <label className="shrink-0 bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-bold px-2.5 py-2.5 rounded-lg hover:bg-sky-500/25 transition-colors cursor-pointer">
                        {uploadingPath === 'custom:bgImage' ? '⏳...' : '⬆️ رفع'}
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleCustomUpload(e, 'bgImage')} />
                      </label>
                    </div>
                  </div>
                  <input name="desc" placeholder="وصف مختصر" className={inputCls} />
                  <button type="submit" className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-bold py-2.5 rounded-lg text-sm transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">اضافة القسم</button>
                </form>
              </div>

              {custom.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-5">
                  <h3 className="text-base font-black text-white mb-3">الاقسام المضافة ({custom.length})</h3>
                  <div className="space-y-2">
                    {custom.map(c => (
                      <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{c.en} — {c.ar}</p>
                          <p className="text-[10px] text-slate-500 truncate" dir="ltr">{c.image || c.bgImage || 'بدون صورة'}</p>
                        </div>
                        <button onClick={() => removeCustom(c.id)} className="text-red-400 hover:bg-red-500/10 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-red-500/30 shrink-0">حذف</button>
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
                {protectTarget.toLock ? '🔒 حماية الشركة من الحذف' : '🔓 إلغاء حماية الشركة'}
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                الشركة <b className="text-white">{protectTarget.name}</b> — اكتب باسورد الحماية للمتابعة.
                {protectTarget.toLock && <><br />الشركة المحمية لا يمكن حذفها بالخطأ.</>}
              </p>
              <input
                type="password"
                value={protectPass}
                onChange={o => setProtectPass(o.target.value)}
                placeholder="باسورد الحماية"
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
                  {protectSaving ? '⏳ جاري الحفظ...' : protectTarget.toLock ? '🔒 تفعيل الحماية' : '🔓 فك الحماية'}
                </button>
                <button onClick={() => { setProtectTarget(null); setProtectPass(''); }} disabled={protectSaving} className="bg-white/[0.06] border border-white/10 text-slate-300 text-sm font-bold px-5 rounded-lg hover:border-slate-400/50 transition-colors">إلغاء</button>
              </div>
            </div>
          </div>
        )}

        {/* نافذة تأكيد الحذف — كتابة "مسح" مرتين + باسورد الحماية لو محمية */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={closeDeleteModal}>
            <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-[#140A0A]/95 p-6 shadow-[0_0_60px_rgba(239,68,68,0.25)]" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-black text-red-300 mb-1">⚠️ حذف الشركة نهائياً</h3>
              <p className="text-xs text-slate-400 mb-4">
                سيتم حذف <b className="text-white">{deleteTarget.name}</b> مع شجرة التطبيق وجميع حساباتها وبياناتها — لا يمكن التراجع.
                <br />اكتب كلمة <b className="text-red-300">مسح</b> في الحقلين أدناه لتأكيد الحذف.
              </p>
              <input
                value={delType1}
                onChange={o => setDelType1(o.target.value)}
                placeholder="اكتب: مسح"
                className={`${inputCls} text-center text-base font-black mb-2 ${delType1.trim() === 'مسح' ? 'border-emerald-400/60' : ''}`}
                dir="rtl"
                autoFocus
              />
              <input
                value={delType2}
                onChange={o => setDelType2(o.target.value)}
                placeholder="اكتبها مرة أخرى للتأكيد: مسح"
                className={`${inputCls} text-center text-base font-black mb-4 ${delType2.trim() === 'مسح' ? 'border-emerald-400/60' : ''}`}
                dir="rtl"
              />
              {deleteTarget.isProtected && (
                <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-2.5">
                  <p className="text-[11px] font-bold text-yellow-300 mb-1.5">🔒 هذه الشركة محمية — اكتب باسورد الحماية لتأكيد الحذف</p>
                  <input
                    type="password"
                    value={delPass}
                    onChange={o => setDelPass(o.target.value)}
                    placeholder="باسورد الحماية"
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
                  {deleting ? '⏳ جاري الحذف...' : '🗑️ نعم، احذف نهائياً'}
                </button>
                <button onClick={closeDeleteModal} disabled={deleting} className="bg-white/[0.06] border border-white/10 text-slate-300 text-sm font-bold px-5 rounded-lg hover:border-slate-400/50 transition-colors">إلغاء</button>
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