import { useState, useEffect, type FormEvent, type ReactNode, Component } from 'react';
import emailjs from '@emailjs/browser';
import { useNavigate } from 'react-router-dom';
import { saveUser, getAllUsers, saveCompanyTree, saveAppAccount, uploadConsoleImage, saveSiteConfig, loadSiteConfig, type CompanyTree, type SiteConfig } from '../firebase/firestore';
import BrandLogo from '../components/BrandLogo';
import type { UserSession } from '../context/AuthContext';
import { TREE_ROLES, treeModsForRole } from '../lib/treeRoles';

const EMAILJS_PUBLIC_KEY = 'UPIUNYeckrEK-z_xz';
const EMAILJS_SERVICE_ID = 'service_mdtxmv8';
const EMAILJS_TEMPLATE_ID = 'template_ablqhm3';

const CONSOLE_EMAIL = 'eng.ahmedabdoualyan@gmail.com';
const CONSOLE_PASSWORD = 'Fimto@ata';

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
  return `${roleKey}${n}@${company.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}.com`;
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
  const [otpCode, setOtpCode] = useState('');
  const [otpShown, setOtpShown] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'sections' | 'companies'>('sections');

  const [overrides, setOverrides] = useState<Overrides>(() => loadCfg().overrides);
  const [custom, setCustom] = useState<any[]>(() => loadCfg().custom);

  const [companies, setCompanies] = useState<UserSession[]>([]);
  const [comp, setComp] = useState({ username: '', password: '', plantName: '', country: 'Egypt', city: '', phone: '', email: '' });
  const [dbLoaded, setDbLoaded] = useState(false);

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
      }));
      setCompanies(clean.length > 0 ? clean : (() => {
        try {
          const saved = localStorage.getItem('registeredUsers');
          return saved ? JSON.parse(saved) : [];
        } catch { return []; }
      })());
    }).catch(() => {
      try {
        const saved = localStorage.getItem('registeredUsers');
        if (saved) setCompanies(JSON.parse(saved));
      } catch {}
    });
    if (!dbLoaded) { setDbLoaded(true); loadCfgFromDb(); }
  }, [step]);

  const input2 = (v: string) => v === undefined ? '' : v;

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('اكتب الإيميل والباسورد'); return; }
    if (email.toLowerCase() !== CONSOLE_EMAIL.toLowerCase() || password !== CONSOLE_PASSWORD) {
      setError('بيانات الدخول غير صحيحة');
      return;
    }
    setSending(true);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setOtpCode(code);
    let sent = false;
    try {
      const res = await emailjs.send(
        EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
        { to_email: CONSOLE_EMAIL, to_name: 'Administrator', code, plant_name: 'Fimto Control Panel' },
        { publicKey: EMAILJS_PUBLIC_KEY }
      );
      if (res.status === 200) sent = true;
    } catch (err: any) {
      console.error('EmailJS Error:', err?.text || err?.message || err);
    }
    setSending(false);
    setOtpShown(sent);
    setStep('otp');
  };

  const handleOtp = (e: FormEvent) => {
    e.preventDefault();
    if (otp !== otpCode) { setError('كود التاكيد غير صحيح'); return; }
    localStorage.setItem(SESSION_KEY, '1');
    setAuthed(true);
    setStep('panel');
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
      const tree: CompanyTree = { companyUsername: username, accounts: rows };
      await saveCompanyTree(tree);
      for (const a of rows) {
        try {
          await saveAppAccount({
            username: a.email,
            password: a.password,
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
    for (let i = 0; i < n; i++) {
      const idx = existing.filter(a => a.role === role.key).length + i + 1;
      rows.push({
        email: defaultEmail(role.key, idx, (companies.find(c => c.username === treeOpen)?.plantName || treeOpen || 'fimto')),
        password: 'Fimto@123',
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
      const tree: CompanyTree = { companyUsername: treeOpen, accounts: rows };
      await saveCompanyTree(tree);
      for (const a of treeDraft) {
        try {
          await saveAppAccount({
            username: a.email,
            password: a.password,
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

  const deleteTreeAccount = (username: string, idx: number) => {
    setTrees(prev => {
      const rows = [...(prev[username] || [])];
      rows.splice(idx, 1);
      const next = { ...prev, [username]: rows };
      saveCompanyTree({ companyUsername: username, accounts: rows }).catch(() => {});
      return next;
    });
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
    const { username, password, plantName, country, city, phone, email } = comp;
    if (!username || !password || !plantName || !email) { setError('الاسم والباسورد واسم الشركة والايميل مطلوبين'); return; }
    const user: UserSession = { username, password, country, city, plantName, phone, email, status: 'FREE_TRIAL' };
    try {
      await saveUser(user);
    } catch (err) {
      console.error('Firebase save failed', err);
    }
    try {
      const saved = localStorage.getItem('registeredUsers');
      const users: UserSession[] = saved ? JSON.parse(saved) : [];
      users.push(user);
      localStorage.setItem('registeredUsers', JSON.stringify(users));
    } catch {}
    setCompanies(prev => [user, ...prev]);
    setComp({ username: '', password: '', plantName: '', country: 'Egypt', city: '', phone: '', email: '' });
    setError(`تم انشاء حساب الشركة ${username} ✓ — افتح الشجرة واضيف حسابات التطبيق`);
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
            <p className="text-sm text-slate-400">{otpShown ? `تم ارسال الكود الى ${CONSOLE_EMAIL}` : 'فشل ارسال الميل — الكود معروض ادناه'}</p>
            {!otpShown && (
              <p className="text-2xl font-mono tracking-[0.3em] text-yellow-300 font-bold mt-3">{otpCode}</p>
            )}
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
          <button type="submit" className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-bold py-2.5 rounded-lg text-sm transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">انشاء الحساب</button>
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-5">
        <h3 className="text-base font-black text-white mb-3">الشركات المسجلة ({companies.length})</h3>
        {companies.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">لا توجد شركات بعد — انشئ شركة ثم افتح شجرتها</p>
        ) : (
          <div className="space-y-2 max-h-[520px] overflow-y-auto">
{companies.map(u => {
              const uname = (u.username || u.id || u.email || 'user').toLowerCase();
              const open = treeOpen === uname;
              const accts = trees[uname] || [];
              return (
                <div key={uname} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">🏢 {u.plantName || u.username || u.name || '—'}</p>
                      <p className="text-[10px] text-slate-500 truncate" dir="ltr">@{u.username || u.email || '—'} · {u.email || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded ${u.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-sky-500/10 text-sky-300 border border-sky-500/30'}`}>{u.status || 'FREE_TRIAL'}</span>
                      <button
                        onClick={() => openTree(uname)}
                        className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${open ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'bg-white/[0.05] border-white/10 text-slate-300 hover:border-sky-400/50'}`}
                      >
                        🌳 الشجرة {accts.length > 0 ? `(${accts.length})` : ''}
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
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
              <p className="text-[11px] text-slate-500 mb-3">اضغط "رفع صورة" واختار ملف من جهازك — تظهر فوراً. بعد الانتهاء اضغط "حفظ على القاعدة" عشان الصور تبقى محفوظة ومتاحة للوقت الفعلي.</p>
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