import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type UserSession } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { useLang } from '../context/LangContext';
import { loadTrips, loadEffectiveConfig } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import QuotaBanner from '../components/QuotaBanner';
import mainPhoto from '../assets/logos/mainphoto.jpg';

interface Trip {
  id: number; plant: string; date: string; code: string; driver: string;
  qty: number; pump: string; estTime: number;
  stationArr: string; stationDep: string; siteArr: string; siteDep: string;
  siteName: string; projectName: string; status: string;
}

interface ModuleDef {
  access: string;
  path: string;
  en: string;
  ar: string;
  desc: string;
  icon: ReactNode;
  image?: string;
  bgImage?: string;
}

const COUNTRIES = ["Egypt", "Saudi Arabia", "UAE", "Kuwait", "Qatar", "Bahrain", "Oman", "Jordan", "Lebanon", "Iraq", "Yemen", "Other"];
const CITIES: Record<string, string[]> = {
  Egypt: ["Cairo", "Alexandria", "Giza", "Sharm El-Sheikh", "Hurghada"],
  "Saudi Arabia": ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam", "Khobar"],
  UAE: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"],
  Kuwait: ["Kuwait City"],
  Qatar: ["Doha"],
  Bahrain: ["Manama"],
  Oman: ["Muscat"],
};

const ICON = {
  box: (
    <>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h12v11H3z" />
      <path d="M15 10h4l2 2v5h-6z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </>
  ),
  factory: (
    <>
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M17 18h1" /><path d="M12 18h1" /><path d="M7 18h1" />
    </>
  ),
  wrench: (
    <>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </>
  ),
  flask: (
    <>
      <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
      <path d="M8.5 2h7" /><path d="M7 16h10" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
    </>
  ),
  chart: (
    <>
      <path d="M3 21h18" /><path d="M7 17v-6" /><path d="M12 17V7" /><path d="M17 17v-9" />
    </>
  ),
  atom: (
    <>
      <circle cx="12" cy="12" r="1" />
      <path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z" />
      <path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12" />
      <path d="M15 9.5c0-1.38-1.34-2.5-3-2.5s-3 1.12-3 2.5 1.34 2.5 3 2.5 3 1.12 3 2.5-1.34 2.5-3 2.5" />
    </>
  ),
  layers: (
    <>
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
};

const MODULES: ModuleDef[] = [
  { access: 'orders', path: 'orders', en: 'Orders', ar: 'الطلبات', desc: 'Order entry & approvals', icon: ICON.box },
  { access: 'operation', path: 'operations', en: 'Operations', ar: 'التشغيل', desc: 'Fleet dispatch & tracking', icon: ICON.truck },
  { access: 'production', path: 'production', en: 'Production', ar: 'الإنتاج', desc: 'Batching & inventory', icon: ICON.factory },
  { access: 'materials', path: 'materials', en: 'Materials', ar: 'المواد', desc: 'Silo inventory & reorder', icon: ICON.layers },
  { access: 'workshop', path: 'workshop', en: 'Workshop', ar: 'الورشة', desc: 'Maintenance & fleet', icon: ICON.wrench },
  { access: 'mixing', path: 'mixing', en: 'Mixing & Quality', ar: 'المختبر والجودة', desc: 'QC samples & calibration', icon: ICON.flask },
  { access: 'governance', path: 'governance', en: 'Governance', ar: 'الحوكمة', desc: 'Weighbridge & returns', icon: ICON.shield },
  { access: 'schedule', path: 'schedule', en: 'Schedule', ar: 'الجدول', desc: 'Smart daily pouring', icon: ICON.calendar },
  { access: 'evaluation', path: 'evaluation', en: 'Evaluation', ar: 'التقييم', desc: 'Plant OEE & KPI', icon: ICON.chart },
  { access: 'finance', path: 'finance', en: 'Finance', ar: 'المالية', desc: 'Payments & POs', icon: ICON.coin },
  { access: 'rnd', path: 'rnd', en: 'R & D', ar: 'البحث والتطوير', desc: 'Innovation & training', icon: ICON.atom },
  { access: 'multiplant', path: 'multiplant', en: 'Multi Plant', ar: 'المحطات', desc: 'Multi-plant command center', icon: ICON.grid },
];

const DEFAULT_TRIPS: Trip[] = [
  { id: 1, plant: "PLANT-A", date: "2026-06-18", code: "m01", driver: "Ahmed Ali", qty: 10, pump: "p01", estTime: 40, stationArr: "08:00", stationDep: "08:10", siteArr: "08:50", siteDep: "09:30", siteName: "vally damam", projectName: "dammam 1", status: "COMPLETED" },
  { id: 2, plant: "PLANT-A", date: "2026-06-18", code: "m02", driver: "Driver-2", qty: 10, pump: "p01", estTime: 45, stationArr: "10:00", stationDep: "10:11", siteArr: "10:56", siteDep: "11:40", siteName: "00 (kk)", projectName: "00 (kk)", status: "COMPLETED" },
  { id: 3, plant: "PLANT-B", date: "2026-06-18", code: "m03", driver: "Saeed John", qty: 10, pump: "p02", estTime: 30, stationArr: "09:00", stationDep: "09:12", siteArr: "09:42", siteDep: "10:20", siteName: "Khobar Site", projectName: "Tower B", status: "COMPLETED" },
];

function ModuleButton({ m, onGo, className = "", showDesc = false }: { m: ModuleDef; onGo: () => void; className?: string; showDesc?: boolean }) {
  const media = m.bgImage || m.image;
  return (
    <button
      onClick={onGo}
      className={`group relative flex flex-row items-stretch overflow-hidden w-full min-h-[110px] lg:min-h-[130px] rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl text-left transition-all duration-300 hover:-translate-y-1 hover:border-sky-400/70 hover:bg-white/[0.05] hover:shadow-[0_0_30px_rgba(56,189,248,0.35)] cursor-pointer ${className}`}
    >
      {/* SIDE 1 — 40% illustrative media */}
      <div className="relative w-[40%] shrink-0 h-full overflow-hidden rounded-l-xl">
        {media ? (
          <>
            <img src={media} alt={m.en} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-[#080C14]/25" />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-sky-500/25 via-[#0B111E]/80 to-cyan-500/10 border-r border-white/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-sky-300/90 drop-shadow-[0_0_12px_rgba(56,189,248,0.5)]">
              {m.icon}
            </svg>
          </div>
        )}
      </div>

      {/* SIDE 2 — 60% text container (fully centered) */}
      <div className="relative flex-1 min-w-0 flex flex-col items-center justify-center text-center p-4 lg:p-5 gap-1.5">
        {showDesc && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute top-2.5 right-2.5 w-4 h-4 text-slate-500 shrink-0 transition-all duration-300 group-hover:text-sky-400 group-hover:translate-x-0.5">
            <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
          </svg>
        )}
        <h3 className="text-xl lg:text-2xl font-display font-black tracking-wide text-white leading-tight [text-shadow:0_2px_12px_rgba(0,0,0,0.85)] group-hover:text-sky-300 transition-colors duration-300">{m.en}</h3>
        <p className="text-sm font-bold text-sky-400/90 leading-snug [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]" dir="rtl">{m.ar}</p>
        {showDesc && (
          <p className="text-[11px] lg:text-xs font-medium text-slate-300/95 leading-relaxed tracking-wide [text-shadow:0_1px_6px_rgba(0,0,0,0.75)]">{m.desc}</p>
        )}
      </div>
    </button>
  );
}

function to12h(i: string): string {
  if (!i || i === "00:00" || i === "") return "--:--";
  const [e, t] = i.split(":").map(Number);
  if (isNaN(e) || isNaN(t)) return "--:--";
  const r = e >= 12 ? "PM" : "AM", l = e % 12 || 12;
  const d = t < 10 ? "0" + t : t;
  return `${l}:${d} ${r}`;
}

function diffMin(i: string, e: string): number {
  if (!i || !e || i === "00:00" || e === "00:00") return 0;
  const [h, m] = i.split(":").map(Number);
  const [h2, m2] = e.split(":").map(Number);
  if (isNaN(h) || isNaN(m) || isNaN(h2) || isNaN(m2)) return 0;
  let f = h * 60 + m, x = h2 * 60 + m2;
  if (x < f) x += 1440;
  return x - f;
}

function plantMins(i: string, e: string): number {
  const t = diffMin(i, e);
  if (t > 180) { const r = t - 720; return r < 0 ? Math.abs(r) : r; }
  return t;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { currentUser, login, register, verifyAndActivate, generatedCode, logout, loginAsGuest } = useAuth();
  const { canAccess, canManageAdmin } = useAdmin();
  const { t } = useLang();
  const [showLogin, setShowLogin] = useState(!currentUser);
  const [tab, setTab] = useState<'login' | 'register' | 'verify'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentState, setSentState] = useState<boolean | null>(null);
  const [trips, setTrips] = useState<Trip[]>(DEFAULT_TRIPS);

  const [overrides, setOverrides] = useState<Record<string, { image?: string; bgImage?: string }>>(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('fimto_module_config') || '{}');
      return cfg.overrides || {};
    } catch { return {}; }
  });
  const [customMods, setCustomMods] = useState<ModuleDef[]>(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('fimto_module_config') || '{}');
      return (cfg.custom || []).map((c: any) => ({
        access: 'custom', path: c.id, en: c.en || 'Section', ar: c.ar || '',
        desc: c.desc || '', icon: ICON.chart, image: c.image || undefined, bgImage: c.bgImage || undefined,
      }));
    } catch { return []; }
  });

  const [reg, setReg] = useState({ username: "", password: "", country: "Egypt", city: "", plantName: "", phonePrefix: "+20", phone: "", email: "" });
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [verifyCode, setVerifyCode] = useState("");

  useEffect(() => { setShowLogin(!currentUser); }, [currentUser]);

  useEffect(() => {
    let mounted = true;
    loadEffectiveConfig().then(cfg => {
      if (!mounted) return;
      if (Object.keys(cfg.overrides).length) setOverrides(cfg.overrides);
      if (cfg.custom.length) {
        setCustomMods(cfg.custom.map((c: any) => ({
          access: 'custom', path: c.id, en: c.en || 'Section', ar: c.ar || '',
          desc: c.desc || '', icon: ICON.chart, image: c.image || undefined, bgImage: c.bgImage || undefined,
        })));
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('trips_data') || localStorage.getItem('trips');
      if (saved) setTrips(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    loadTrips(currentUser.username).then(data => {
      if (data && Array.isArray(data) && data.length > 0) setTrips(data);
      else {
        const saved = localStorage.getItem('trips_data') || localStorage.getItem('trips');
        if (saved) setTrips(JSON.parse(saved));
      }
    }).catch(() => {
      const saved = localStorage.getItem('trips_data') || localStorage.getItem('trips');
      if (saved) setTrips(JSON.parse(saved));
    });
  }, [currentUser?.username]);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { username, password, country, city, plantName, phonePrefix, phone, email } = reg;
    if (!username || !password || !country || !city || !plantName || !phone || !email) {
      setError(t('fillAll'));
      setBusy(false);
      return;
    }
    const user: UserSession = {
      username, password, country, city,
      plantName, phone: phonePrefix + phone, email, status: "FREE_TRIAL",
    };
    const res = await register(user);
    if (res.success) {
      setSentState(res.emailSent);
      setTab('verify');
    } else {
      setError(t('usernameTaken'));
    }
    setBusy(false);
  };

  const handleVerify = async () => {
    if (!verifyCode) { setError(t('enterVerificationCode')); return; }
    const ok = await verifyAndActivate(verifyCode);
    if (ok) setShowLogin(false);
    else setError(t('incorrectVerificationCode'));
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const ok = await login(loginForm.username, loginForm.password);
    if (ok) setShowLogin(false);
    else setError(t('invalidCredentials'));
  };

  const go = (module: string) => navigate(`/${module}`);
  const eff = (idx: number) => {
    const base = MODULES[idx];
    const ov = base ? overrides[base.path] : undefined;
    return ov && (ov.image || ov.bgImage) ? { ...base, ...ov } : base;
  };

  const recent = trips.slice(-6).reverse();

  const inputCls = "w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-slate-100 text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] transition placeholder:text-slate-500";

  return (
    <div
      className="min-h-screen text-slate-200"
      style={{ background: "radial-gradient(ellipse 80% 40% at 50% -10%, rgba(56,189,248,0.13), transparent), #080C14" }}
    >
      {/* ===== LOGIN MODAL ===== */}
      {showLogin && (
        <div className="fixed inset-0 z-[100] bg-[#080C14]/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-xl p-5 sm:p-8 shadow-[0_0_60px_rgba(56,189,248,0.12)] max-h-[95vh] overflow-y-auto">
            <div className="text-center mb-6">
              <div className="flex justify-center mb-4">
                <BrandLogo width={200} fill rounded="rounded-2xl" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2">
                {tab === "login" ? t('welcomeBack') : tab === "register" ? t('createAccount') : t('verifyEmail')}
              </h2>
              <p className="text-sm text-slate-400">{t('techMgmtProgram')}</p>
              <p className="text-xs text-sky-400 mt-1 font-semibold">{t('designBy')}</p>
            </div>

            {tab === "register" && (
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="bg-sky-500/10 border border-dashed border-sky-500/40 rounded-lg p-3 text-sky-300 text-xs text-center mb-3">
                  🆓 {t('freeTrialRegistration')}<br />
                  💾 {t('privateStorage300mb')}<br />
                  <span className="text-sky-400/70">{t('biggerDbContact')}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-400 font-semibold mb-1">{t('username')} *</label>
                    <input value={reg.username} onChange={o => setReg({ ...reg, username: o.target.value })} className={inputCls} />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-400 font-semibold mb-1">{t('password')} *</label>
                    <input type="password" value={reg.password} onChange={o => setReg({ ...reg, password: o.target.value })} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-400 font-semibold mb-1">{t('country')} *</label>
                    <select value={reg.country} onChange={o => setReg({ ...reg, country: o.target.value, city: "" })} className={inputCls}>
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-400 font-semibold mb-1">{t('city')} *</label>
                    <select value={reg.city} onChange={o => setReg({ ...reg, city: o.target.value })} className={inputCls}>
                      <option value="">{t('selectCity')}</option>
                      {(CITIES[reg.country] || []).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">{t('plantCompanyName')} *</label>
                  <input value={reg.plantName} onChange={o => setReg({ ...reg, plantName: o.target.value })} placeholder={t('plantPlaceholder')} className={inputCls} />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">{t('phoneNumber')} *</label>
                  <div className="flex gap-2">
                    <select value={reg.phonePrefix} onChange={o => setReg({ ...reg, phonePrefix: o.target.value })} className={`${inputCls} w-[35%]`}>
                      <option value="+20">+20 (EG)</option>
                      <option value="+966">+966 (KSA)</option>
                      <option value="+971">+971 (UAE)</option>
                      <option value="+965">+965 (KW)</option>
                      <option value="+974">+974 (QA)</option>
                    </select>
                    <input value={reg.phone} onChange={o => setReg({ ...reg, phone: o.target.value })} placeholder="1001006627" className={`${inputCls} flex-1`} />
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">{t('email')} *</label>
                  <input type="email" value={reg.email} onChange={o => setReg({ ...reg, email: o.target.value })} placeholder="example@email.com" className={inputCls} />
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-wait text-white font-bold py-3 rounded-lg text-sm transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">
                  {busy ? `⏳ ${t('sendingVerificationCode')}...` : `📧 ${t('registerSendVerificationCode')}`}
                </button>
                <p className="text-center text-sm text-slate-400 mt-3">
                  {t('alreadyHaveAccount')} <span className="text-sky-400 cursor-pointer underline font-bold" onClick={() => { setTab('login'); setError(''); }}>{t('login')}</span>
                </p>
              </form>
            )}

            {tab === "verify" && (
              <div className="space-y-4">
                {sentState === true ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                    <p className="text-emerald-400 text-2xl mb-2">📧</p>
                    <p className="text-sm text-slate-200 font-semibold">{t('verificationCodeSent')}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {t('verificationCodeSentTo')}<br />
                      <strong className="text-sky-300 text-sm">{reg.email}</strong>
                    </p>
                    <p className="text-xs text-slate-500 mt-2">{t('checkInboxSpam')}</p>
                  </div>
                ) : sentState === false ? (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
                    <p className="text-yellow-400 text-2xl mb-2">⚠️</p>
                    <p className="text-sm text-slate-200 font-semibold">{t('emailServiceNotConfigured')}</p>
                    <p className="text-xs text-slate-400 mt-1">{t('emailjsKeysNotSet')}</p>
                    <p className="text-lg font-mono tracking-[0.3em] text-yellow-300 font-bold mt-2">{generatedCode}</p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="animate-spin w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {t('sendingVerificationCodeTo')}<br />
                      <strong className="text-sky-300">{reg.email}</strong>...
                    </p>
                  </div>
                )}
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">{t('verificationCode')}</label>
                  <input value={verifyCode} onChange={o => setVerifyCode(o.target.value)} placeholder={t('enterSixDigitCode')} className={`${inputCls} text-center text-lg tracking-widest`} />
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button onClick={handleVerify} className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-bold py-3 rounded-lg transition">✅ {t('activateAccount')}</button>
                <button
                  onClick={() => {
                    const u: UserSession = { ...reg, phone: reg.phonePrefix + reg.phone, status: "FREE_TRIAL" };
                    register(u).then(r => setSentState(r.emailSent));
                  }}
                  disabled={busy}
                  className="w-full bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-50 text-sky-300 font-bold py-2 rounded-lg text-sm transition border border-sky-500/30"
                >
                  {busy ? `⏳ ${t('resending')}...` : `📧 ${t('resendVerificationCode')}`}
                </button>
                <button onClick={() => { setTab('register'); setError(''); setSentState(null); }} className="w-full text-slate-400 text-sm underline mt-2">← {t('backToRegistration')}</button>
              </div>
            )}

            {tab === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">{t('username')}</label>
                  <input value={loginForm.username} onChange={o => setLoginForm({ ...loginForm, username: o.target.value })} className={inputCls} />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-slate-400 font-semibold mb-1">{t('password')}</label>
                  <input type="password" value={loginForm.password} onChange={o => setLoginForm({ ...loginForm, password: o.target.value })} className={inputCls} />
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button type="submit" className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-bold py-3 rounded-lg transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">🔓 {t('login')}</button>
                <button
                  type="button"
                  onClick={() => { loginAsGuest(); setShowLogin(false); }}
                  className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 font-bold py-3 rounded-lg transition text-sm mt-2"
                >
                  👤 {t('continueAsGuest')}
                </button>
                <p className="text-center text-sm text-slate-400 mt-3">
                  {t('dontHaveAccount')} <span className="text-sky-400 cursor-pointer underline font-bold" onClick={() => { setTab('register'); setError(''); }}>{t('registerFree')}</span>
                </p>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ===== HEADER ===== */}
      <header className="bg-[#0B111E]/80 backdrop-blur-xl px-4 sm:px-6 py-3 sticky top-0 z-10 flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <BrandLogo width={48} rounded="rounded-xl" />
          <div className="min-w-0">
            <h1 className="font-display text-base sm:text-lg font-black tracking-wide text-white truncate">
              CONCRETE <span className="text-sky-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.7)]">ERP</span>
            </h1>
            <p className="hidden sm:block mt-2 text-xs text-gray-400 font-medium tracking-wide">{t('fimtoTagline')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <QuickJump />
          <LangSelector />
          {currentUser ? (
            <div className="flex items-center gap-2">
              <span className="bg-sky-500/10 text-sky-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-sky-500/30">
                🟢 {currentUser.plantName} ({t('freeTrial')})
              </span>
              {canManageAdmin() && (
                <button
                  onClick={() => navigate('/admin')}
                  className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-sky-400/60 hover:text-sky-300 transition-colors"
                >
                  {t('adminPanel')}
                </button>
              )}
              <button
                onClick={() => { logout(); navigate('/'); }}
                className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors"
              >
                {t('logout')}
              </button>
            </div>
          ) : (
            <span className="bg-white/[0.04] text-slate-400 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10">
              {t('guestSessionRestricted')}
            </span>
          )}
        </div>
      </header>

      {/* ===== STORAGE QUOTA BANNER ===== */}
      <div className="px-6 pt-4 max-w-[1200px] mx-auto w-full">
        <QuotaBanner />
      </div>

      {/* ===== QUICK KPIs (logged-in users only) ===== */}
      {currentUser && (
        <div className="px-4 sm:px-6 pt-6 max-w-[1280px] mx-auto w-full">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'الطلبات النشطة', value: trips.filter(t => t.status !== 'COMPLETED').length, icon: '📦', color: 'text-sky-400' },
              { label: 'تم التسليم اليوم', value: trips.filter(t => t.status === 'COMPLETED').length, icon: '✅', color: 'text-emerald-400' },
              { label: 'إجمالي الشحنات', value: trips.length, icon: '🚛', color: 'text-white' },
              { label: 'المحطة', value: currentUser.plantName || '—', icon: '🏭', color: 'text-cyan-300', isText: true },
            ].map((kpi, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center hover:border-white/20 transition">
                <span className="text-xl">{kpi.icon}</span>
                <p className={`text-lg font-black mt-1 ${kpi.color}`}>{kpi.isText ? kpi.value : kpi.value}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{kpi.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== MAIN ===== */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-8 sm:pt-12 lg:pt-16 pb-6 lg:pb-10">

        {/* Hero — brand statement */}
        <div className="relative text-center mb-10 lg:mb-14">
          <h2 className="relative text-3xl sm:text-4xl lg:text-5xl font-display font-black tracking-tight text-white leading-tight">
            Fimto Soft <span className="text-sky-400">·</span> Technical Management Program
          </h2>
          <p className="relative mt-6 font-display font-black tracking-[0.45em] uppercase bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(56,189,248,0.35)] text-base sm:text-lg">
            CONCRETE
          </p>
          <p className="relative font-body text-base sm:text-lg mt-7 w-full px-2 text-center text-slate-400 leading-relaxed">
            برنامج إدارة محطات الخرسانة الجاهزة — لوحة تحكم ذكية تجمع كل الأقسام في مشهد واحد متكامل
          </p>
        </div>

        {/* ===== Layout Architecture ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_2fr_1.2fr] gap-6 items-stretch w-full max-w-[1280px] mx-auto">

          {/* LEFT column — Operations & Logistics: Orders · Operations · Production · Materials */}
          <div className="order-2 lg:order-1 flex flex-col gap-6 w-full">
            {[eff(0), eff(1), eff(2), eff(3)].filter(m => m && canAccess(m.access)).map(m => (
              <ModuleButton key={m!.path} m={m!} onGo={() => go(m!.path)} showDesc className="flex-1 min-h-[130px] lg:min-h-[150px]" />
            ))}
          </div>

          {/* CENTER column — Schedule · Preview · Evaluation · Finance */}
          <div className="order-1 lg:order-2 flex flex-col gap-6 w-full">
            {eff(7) && canAccess(eff(7)!.access) && (
              <ModuleButton m={eff(7)!} onGo={() => go(eff(7)!.path)} className="min-h-[110px] lg:h-[118px] lg:min-h-0" />
            )}
            <div className="relative w-full flex-1 flex items-center justify-center">
              <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl" style={{ background: "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(56,189,248,0.3), transparent 70%)" }} />
              <img
                src={mainPhoto}
                alt={t('erpImgAlt')}
                className="w-full h-auto object-contain rounded-2xl border border-white/10 shadow-[0_0_40px_rgba(56,189,248,0.25),0_0_120px_rgba(56,189,248,0.15)]"
              />
            </div>
            {eff(8) && canAccess(eff(8)!.access) && (
              <ModuleButton m={eff(8)!} onGo={() => go(eff(8)!.path)} className="min-h-[110px] lg:h-[118px] lg:min-h-0" />
            )}
            {eff(9) && canAccess(eff(9)!.access) && (
              <ModuleButton m={eff(9)!} onGo={() => go(eff(9)!.path)} className="min-h-[110px] lg:h-[118px] lg:min-h-0" />
            )}
          </div>

          {/* RIGHT column — Maintenance & Quality: Workshop · Mixing & Quality · Governance · R&D */}
          <div className="order-3 flex flex-col gap-6 w-full">
            {[eff(4), eff(5), eff(6), eff(10)].filter(m => m && canAccess(m.access)).map(m => (
              <ModuleButton key={m!.path} m={m!} onGo={() => go(m!.path)} showDesc className="flex-1 min-h-[130px] lg:min-h-[150px]" />
            ))}
          </div>
        </div>

        {/* ===== Multi Plant — Full Width (for multi-plant owners) ===== */}
        {eff(11) && canAccess(eff(11)!.access) && (
          <div className="mt-6 w-full max-w-[1280px] mx-auto">
            <ModuleButton m={eff(11)!} onGo={() => go(eff(11)!.path)} showDesc className="min-h-[110px] lg:min-h-[130px]" />
          </div>
        )}

        {/* ===== Custom sections (added from control panel) ===== */}
        {customMods.length > 0 && (
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-[1280px] mx-auto">
            {customMods.map(m => (
              <ModuleButton key={m.path} m={m} onGo={() => go(`s/${m.path}`)} showDesc className="min-h-[130px] lg:min-h-[150px]" />
            ))}
          </div>
        )}
      </div>

      {/* ===== RECENT TRIPS ===== */}
      <div className="max-w-[1200px] mx-auto px-6 pb-10">
        <div className="rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-white tracking-tight">🚛 {t('recentConcreteTrips')}</h2>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 border border-white/10 px-2 py-1 rounded">{t('liveOverview')}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recent.map(tr => {
              const p = plantMins(tr.stationArr, tr.stationDep);
              const je = diffMin(tr.stationDep, tr.siteArr);
              const Me = je > 120;
              return (
                <div key={tr.id} className={`rounded-xl border bg-white/[0.03] backdrop-blur-xl p-4 ${Me ? "border-red-500/50 animate-pulse" : "border-white/10"}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-300 px-2 py-0.5 rounded border border-sky-500/20">{tr.status}</span>
                    <span className="text-[11px] text-slate-500">{tr.date}</span>
                  </div>
                  <h3 className="text-lg font-black text-white">{tr.code}</h3>
                  <div className="text-xs text-slate-400 mt-2 space-y-1">
                    <p><span className="text-slate-500">{t('plant')}:</span> <strong className="text-slate-300">{tr.plant}</strong></p>
                    <p><span className="text-slate-500">{t('driver')}:</span> {tr.driver}</p>
                    <p><span className="text-slate-500">{t('load')}:</span> {tr.qty} m³ | {t('pump')}: {tr.pump}</p>
                    <p><span className="text-slate-500">{t('project')}:</span> {tr.siteName} ({tr.projectName})</p>
                    <p className={p > 12 ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                      🏭 {t('plant')}: {p > 12 ? `${t('delay')} ${p - 12}m` : `${t('onTime')} (${p}m)`}
                    </p>
                    <p className={Me ? "text-red-400 font-extrabold animate-pulse" : je > Number(tr.estTime) ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                      🚚 {t('transit')}: {Me ? `🚨 ${t('critical')} ${je}m ${t('over2hrs')}` : je > Number(tr.estTime) ? `${t('delay')} ${je - Number(tr.estTime)}m` : `${t('onTime')} (${je}m)`}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/10 text-[10px] text-slate-500">
                    <div>{t('arrPlant')}: <span className="text-slate-200">{to12h(tr.stationArr)}</span></div>
                    <div>{t('depPlant')}: <span className="text-slate-200">{to12h(tr.stationDep)}</span></div>
                    <div>{t('arrSite')}: <span className="text-slate-200">{to12h(tr.siteArr)}</span></div>
                    <div>{t('depSite')}: <span className="text-slate-200">{to12h(tr.siteDep)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
