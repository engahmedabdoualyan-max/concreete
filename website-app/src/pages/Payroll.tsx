import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, resolveApiBase, getToken } from '../api/client';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/BrandLogo';
import LangSelector from '../components/LangSelector';
import QuickJump from '../components/QuickJump';

/**
 * ============================================================
 *  GCC Payroll GOSI + Mudad (Epic 9) — /payroll
 * ============================================================
 *  Employees + monthly runs (DRAFT → APPROVED → PAID) +
 *  GOSI-accurate math + Mudad CSV + payslips.
 * ============================================================
 */

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  nationality: string;
  gosiSystem: string;
  jobTitle: string | null;
  baseSalarySar: string;
  housingAllowanceSar: string;
  isActive: boolean;
}

interface PayLine {
  id: string;
  employeeId: string;
  employeeName: string;
  daysWorked: string;
  grossSar: string;
  gosiWageSar: string;
  gosiSystem: string;
  employeeGosiSar: string;
  employerGosiSar: string;
  deductionsSar: string;
  netSar: string;
}

interface PayRun {
  id: string;
  period: string;
  status: string;
  totalGrossSar: string;
  totalEmployeeGosiSar: string;
  totalEmployerGosiSar: string;
  totalNetSar: string;
  lines?: PayLine[];
}

export default function Payroll() {
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<'employees' | 'runs' | 'attendance'>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns] = useState<PayRun[]>([]);
  const [selected, setSelected] = useState<PayRun | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [eCode, setECode] = useState('');
  const [eName, setEName] = useState('');
  const [eNat, setENat] = useState('NON_SAUDI');
  const [eGosi, setEGosi] = useState('LEGACY');
  const [eBase, setEBase] = useState('');
  const [eHousing, setEHousing] = useState('');
  const [eIban, setEIban] = useState('');

  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  const load = async () => {
    try {
      const [e, r] = await Promise.all([
        api.get<{ data: { employees: Employee[] } }>('/api/hr/employees'),
        api.get<{ data: { runs: PayRun[] } }>('/api/hr/payroll/runs'),
      ]);
      setEmployees(e.data.employees);
      setRuns(r.data.runs);
    } catch { setMsg('⚠️ Could not load payroll data.'); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addEmployee = async () => {
    if (!eCode.trim() || !eName.trim()) { setMsg('⚠️ Code + name required.'); return; }
    setBusy(true);
    try {
      await api.post('/api/hr/employees', {
        employeeCode: eCode.trim(), fullName: eName.trim(),
        nationality: eNat, gosiSystem: eGosi,
        baseSalarySar: parseFloat(eBase) || 0,
        housingAllowanceSar: parseFloat(eHousing) || 0,
        bankIban: eIban.trim() || undefined,
      });
      setMsg('✅ Employee added.');
      setECode(''); setEName(''); setEBase(''); setEHousing(''); setEIban('');
      await load();
    } catch { setMsg('⚠️ Add failed.'); }
    setBusy(false);
  };

  const createRun = async () => {
    setBusy(true);
    try {
      await api.post('/api/hr/payroll/runs', { period });
      setMsg(`✅ Payroll ${period} drafted with GOSI math.`);
      await load();
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Create failed.'}`); }
    setBusy(false);
  };

  const openRun = async (id: string) => {
    try {
      const res = await api.get<{ data: PayRun }>(`/api/hr/payroll/runs/${id}`);
      setSelected(res.data);
    } catch { setMsg('⚠️ Could not open run.'); }
  };

  const transition = async (action: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/api/hr/payroll/runs/${selected.id}/status`, { action });
      setMsg(`✅ Run ${action === 'PAY' ? 'PAID' : action === 'APPROVE' ? 'APPROVED' : 'CANCELLED'}.`);
      await openRun(selected.id);
      await load();
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Transition failed.'}`); }
    setBusy(false);
  };

  const downloadMudad = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`${resolveApiBase()}/api/hr/payroll/export?runId=${selected.id}`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mudad-wps-${selected.period}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg('✅ Mudad file downloaded.');
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Export failed.'}`); }
    setBusy(false);
  };

  if (!currentUser) return <div className="min-h-screen bg-[#0B111E] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">Back to Login</Link></div></div>;

  const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm';

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">💵 GCC Payroll (GOSI + Mudad)</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('employees')} className={`px-4 py-2 rounded-lg font-bold text-sm ${tab === 'employees' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>👥 Employees</button>
          <button onClick={() => setTab('runs')} className={`px-4 py-2 rounded-lg font-bold text-sm ${tab === 'runs' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>🧾 Runs</button>
          <button onClick={() => setTab('attendance')} className={`px-4 py-2 rounded-lg font-bold text-sm ${tab === 'attendance' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>🕐 Attendance</button>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {msg && <div className="bg-white/[0.04] border border-white/10 px-4 py-3 rounded-lg text-sm font-bold">{msg}</div>}

        {tab === 'employees' && (
          <>
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">➕ Add Employee</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input value={eCode} onChange={e => setECode(e.target.value)} placeholder="Code (EMP-001)" className={inputCls} />
                <input value={eName} onChange={e => setEName(e.target.value)} placeholder="Full name" className={inputCls} />
                <select value={eNat} onChange={e => setENat(e.target.value)} className={inputCls}>
                  <option value="NON_SAUDI">Non-Saudi (2% employer)</option>
                  <option value="SAUDI">Saudi</option>
                </select>
                <select value={eGosi} onChange={e => setEGosi(e.target.value)} className={inputCls} disabled={eNat !== 'SAUDI'}>
                  <option value="LEGACY">GOSI Legacy (pre-Jul-2024)</option>
                  <option value="NEW">GOSI New system</option>
                </select>
                <input value={eBase} onChange={e => setEBase(e.target.value)} placeholder="Base SAR" type="number" className={inputCls} />
                <input value={eHousing} onChange={e => setEHousing(e.target.value)} placeholder="Housing SAR" type="number" className={inputCls} />
                <input value={eIban} onChange={e => setEIban(e.target.value)} placeholder="IBAN (Mudad)" className={inputCls} />
                <button onClick={addEmployee} disabled={busy} className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg">➕ Add</button>
              </div>
              <p className="text-[11px] text-slate-500 mt-3">GOSI track follows contribution history (LEGACY vs NEW) — never auto-derived from hire date. Base: basic + housing, capped 45,000.</p>
            </div>

            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">👥 Employees ({employees.length})</h3>
              <div className="space-y-2">
                {employees.map(e => (
                  <div key={e.id} className="bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[180px]">
                      <p className="font-bold text-white text-sm">{e.fullName} <span className="text-slate-500 font-normal">· {e.employeeCode}</span></p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{e.jobTitle || '—'} · {e.nationality === 'SAUDI' ? `🇸🇦 Saudi (${e.gosiSystem})` : 'Expat'} · Base {e.baseSalarySar} + H {e.housingAllowanceSar}</p>
                    </div>
                  </div>
                ))}
                {employees.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No employees yet.</p>}
              </div>
            </div>
          </>
        )}

        {tab === 'runs' && (
          <>
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">🧾 New Monthly Run</h3>
              <div className="flex gap-4">
                <input value={period} onChange={e => setPeriod(e.target.value)} type="month" className={`${inputCls} [color-scheme:dark] max-w-[220px]`} />
                <button onClick={createRun} disabled={busy} className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-lg">⚙️ Draft {period || ''}</button>
              </div>
            </div>

            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">🧾 Runs ({runs.length})</h3>
              <div className="space-y-2">
                {runs.map(r => (
                  <button key={r.id} onClick={() => openRun(r.id)} className="w-full text-left bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 hover:border-sky-500/40">
                    <span className="font-bold text-white text-sm">📅 {r.period}</span>
                    <span className="text-xs text-slate-400">Net {Number(r.totalNetSar).toLocaleString()} SAR</span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold ml-auto bg-white/[0.05] text-slate-300">{r.status}</span>
                  </button>
                ))}
                {runs.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No runs yet.</p>}
              </div>
            </div>

            {selected && (
              <div className="bg-white/[0.04] border border-sky-500/30 rounded-2xl p-6 backdrop-blur-xl">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-white">📅 {selected.period} <span className="text-xs text-slate-400">· {selected.status}</span></h3>
                  <div className="flex gap-2 ml-auto flex-wrap">
                    {selected.status === 'DRAFT' && <button onClick={() => transition('APPROVE')} disabled={busy} className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-bold">✅ Approve</button>}
                    {selected.status === 'APPROVED' && <button onClick={() => transition('PAY')} disabled={busy} className="text-xs bg-sky-500/20 text-sky-300 border border-sky-500/30 px-3 py-1.5 rounded-lg font-bold">💸 Mark Paid</button>}
                    <button onClick={downloadMudad} disabled={busy} className="text-xs bg-white/[0.05] border border-white/10 px-3 py-1.5 rounded-lg font-bold hover:text-sky-300">📥 Mudad CSV</button>
                    <button onClick={() => setSelected(null)} className="text-xs bg-white/[0.05] px-3 py-1.5 rounded-lg">✖</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4 text-center">
                  <div className="bg-white/[0.03] rounded-xl p-3"><p className="text-[11px] text-slate-400">Gross</p><p className="text-white font-bold">{Number(selected.totalGrossSar).toLocaleString()}</p></div>
                  <div className="bg-white/[0.03] rounded-xl p-3"><p className="text-[11px] text-slate-400">Employee GOSI</p><p className="text-amber-300 font-bold">{Number(selected.totalEmployeeGosiSar).toLocaleString()}</p></div>
                  <div className="bg-white/[0.03] rounded-xl p-3"><p className="text-[11px] text-slate-400">Employer GOSI</p><p className="text-sky-300 font-bold">{Number(selected.totalEmployerGosiSar).toLocaleString()}</p></div>
                  <div className="bg-white/[0.03] rounded-xl p-3"><p className="text-[11px] text-slate-400">Net</p><p className="text-emerald-400 font-bold text-xl">{Number(selected.totalNetSar).toLocaleString()}</p></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-slate-400 text-left">
                      <th className="p-2">Employee</th><th className="p-2">Days</th><th className="p-2">Gross</th><th className="p-2">GOSI wage</th><th className="p-2">Emp. GOSI</th><th className="p-2">Empr. GOSI</th><th className="p-2">Ded.</th><th className="p-2">Net</th>
                    </tr></thead>
                    <tbody>
                      {(selected.lines || []).map(l => (
                        <tr key={l.id} className="border-t border-white/5 text-slate-300">
                          <td className="p-2 font-bold text-white">{l.employeeName} <span className="text-slate-500 font-normal">({l.gosiSystem})</span></td>
                          <td className="p-2">{l.daysWorked}</td>
                          <td className="p-2">{l.grossSar}</td>
                          <td className="p-2">{l.gosiWageSar}</td>
                          <td className="p-2 text-amber-300">{l.employeeGosiSar}</td>
                          <td className="p-2 text-sky-300">{l.employerGosiSar}</td>
                          <td className="p-2">{l.deductionsSar}</td>
                          <td className="p-2 font-bold text-emerald-400">{l.netSar}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'attendance' && (
          <AttendanceTab />
        )}
      </main>
    </div>
  );
}

interface AttRow {
  userId: string;
  fullName: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  minutesWorked: number | null;
}

interface OtRow {
  driverId: string;
  driverName: string;
  tripsCount: number;
  deliveredM3: number;
  attendanceMinutes: number | null;
  overtimeMinutes: number;
}

interface HrZone {
  id: string;
  name: string;
  latitude: string;
  longitude: string;
  radiusM: number;
}

function AttendanceTab() {
  const [from, setFrom] = useState(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<AttRow[]>([]);
  const [ot, setOt] = useState<OtRow[]>([]);
  const [zones, setZones] = useState<HrZone[]>([]);
  const [zName, setZName] = useState('');
  const [zLat, setZLat] = useState('');
  const [zLng, setZLng] = useState('');
  const [zRadius, setZRadius] = useState('200');
  const [msg, setMsg] = useState('');

  const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm';

  const load = async () => {
    try {
      const [a, o, z] = await Promise.all([
        api.get<{ data: { attendance: AttRow[] } }>(`/api/hr/attendance?from=${from}&to=${to}`),
        api.get<{ data: { drivers: OtRow[] } }>(`/api/hr/attendance/driver-trips?from=${from}&to=${to}`),
        api.get<{ data: { zones: HrZone[] } }>('/api/hr/zones'),
      ]);
      setRows(a.data.attendance);
      setOt(o.data.drivers);
      setZones(z.data.zones);
    } catch { setMsg('⚠️ Could not load attendance.'); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addZone = async () => {
    if (!zName.trim() || !zLat || !zLng) { setMsg('⚠️ Name + coordinates required.'); return; }
    try {
      await api.post('/api/hr/zones', {
        name: zName.trim(), latitude: parseFloat(zLat), longitude: parseFloat(zLng),
        radiusM: parseInt(zRadius) || 200,
      });
      setMsg('✅ Zone defined — first entry = check-in, last exit = check-out.');
      setZName(''); setZLat(''); setZLng(''); setZRadius('200');
      await load();
    } catch { setMsg('⚠️ Zone failed.'); }
  };

  const fmtT = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtD = (m: number | null) => m === null ? '—' : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;

  return (
    <div className="space-y-6">
      {msg && <div className="bg-white/[0.04] border border-white/10 px-4 py-3 rounded-lg text-sm font-bold">{msg}</div>}

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <h3 className="text-lg font-bold text-white mb-4">📍 Work Zones (geofences)</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {zones.map(z => (
            <span key={z.id} className="text-xs bg-white/[0.03] border border-white/10 px-3 py-1.5 rounded-lg text-slate-300">
              📍 {z.name} <span className="text-slate-500">({z.radiusM}m)</span>
            </span>
          ))}
          {zones.length === 0 && <p className="text-slate-500 text-sm">No zones yet — define the factory gate below to start auto attendance.</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input value={zName} onChange={e => setZName(e.target.value)} placeholder="بوابة المصنع" className={inputCls} />
          <input value={zLat} onChange={e => setZLat(e.target.value)} placeholder="Latitude" type="number" step="any" className={inputCls} />
          <input value={zLng} onChange={e => setZLng(e.target.value)} placeholder="Longitude" type="number" step="any" className={inputCls} />
          <input value={zRadius} onChange={e => setZRadius(e.target.value)} placeholder="Radius m" type="number" className={inputCls} />
          <button onClick={addZone} className="bg-sky-500 hover:bg-sky-400 text-white font-bold py-2.5 rounded-lg text-sm">➕ Zone</button>
        </div>
      </div>

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="text-lg font-bold text-white">🕐 Attendance ({rows.length})</h3>
          <div className="flex gap-2 ml-auto">
            <input value={from} onChange={e => setFrom(e.target.value)} type="date" className={`${inputCls} [color-scheme:dark] !w-auto`} />
            <input value={to} onChange={e => setTo(e.target.value)} type="date" className={`${inputCls} [color-scheme:dark] !w-auto`} />
            <button onClick={load} className="bg-white/[0.05] border border-white/10 px-4 rounded-lg text-sm font-bold hover:text-sky-300">🔄</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-slate-400 text-left">
              <th className="p-2">Employee</th><th className="p-2">Date</th><th className="p-2">In</th><th className="p-2">Out</th><th className="p-2">Worked</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.userId}-${r.workDate}-${i}`} className="border-t border-white/5 text-slate-300">
                  <td className="p-2 font-bold text-white">{r.fullName}</td>
                  <td className="p-2">{r.workDate}</td>
                  <td className="p-2 text-emerald-400">{fmtT(r.checkInAt)}</td>
                  <td className="p-2 text-amber-300">{fmtT(r.checkOutAt)}</td>
                  <td className="p-2 font-bold text-white">{fmtD(r.minutesWorked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No records in range.</p>}
        </div>
      </div>

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <h3 className="text-lg font-bold text-white mb-4">🚚 Driver Overtime — رحلات الإضافي ({ot.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-slate-400 text-left">
              <th className="p-2">Driver</th><th className="p-2">Trips</th><th className="p-2">Delivered m³</th><th className="p-2">Attendance</th><th className="p-2">Overtime</th>
            </tr></thead>
            <tbody>
              {ot.map(d => (
                <tr key={d.driverId} className="border-t border-white/5 text-slate-300">
                  <td className="p-2 font-bold text-white">{d.driverName}</td>
                  <td className="p-2">{d.tripsCount}</td>
                  <td className="p-2">{d.deliveredM3}</td>
                  <td className="p-2">{fmtD(d.attendanceMinutes)}</td>
                  <td className={`p-2 font-bold ${d.overtimeMinutes > 0 ? 'text-amber-300' : 'text-slate-500'}`}>+{fmtD(d.overtimeMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ot.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No driver activity in range.</p>}
        </div>
      </div>
    </div>
  );
}
