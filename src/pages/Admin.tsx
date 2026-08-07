import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdmin, rolePermissions, ROLE_KEYS, MODULE_KEYS, type UserRole } from '../context/AdminContext';
import { useLang } from '../context/LangContext';
import type { Translations } from '../context/translations';
import { useNavigate } from 'react-router-dom';
import LangSelector from '../components/LangSelector';

type Tab = 'overview' | 'plant' | 'users';

const ROLE_EMOJIS: Record<UserRole, string> = {
  owner: '👑',
  manager: '🧑‍💼',
  operator: '🛠️',
  quality: '🔬',
  maintenance: '🔧',
  viewer: '👁️',
};

const ROLE_T_KEYS: Record<UserRole, keyof Translations> = {
  owner: 'ownerRole',
  manager: 'managerRole',
  operator: 'operatorRole',
  quality: 'qualityRole',
  maintenance: 'maintenanceRole',
  viewer: 'viewerRole',
};

const MODULE_EMOJIS: Record<string, string> = {
  operations: '🚚',
  production: '🏭',
  workshop: '🔧',
  mixing: '🎛️',
  schedule: '📅',
  orders: '📦',
  evaluation: '📊',
  rnd: '🔬',
};

const MODULE_T_KEYS: Record<string, keyof Translations> = {
  operations: 'modOperations',
  production: 'modProduction',
  workshop: 'modWorkshop',
  mixing: 'modMixing',
  schedule: 'modSchedule',
  orders: 'modOrders',
  evaluation: 'modEvaluation',
  rnd: 'modRnd',
};

function Field({ label, value, onChange, type = 'text', rows }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; rows?: number;
}) {
  const base = 'w-full px-3 py-2 bg-[#0f172a] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      {rows ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} className={base} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} className={base} />
      )}
    </div>
  );
}

export default function AdminPanel() {
  const { currentUser } = useAuth();
  const { plant, savePlant, users, addUser, updateUser, deleteUser, canManageAdmin } = useAdmin();
  const { t } = useLang();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('overview');
  const [toast, setToast] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState('');

  const [plantForm, setPlantForm] = useState(plant);
  const [newUser, setNewUser] = useState({ username: '', password: '', name: '', email: '', phone: '', plantName: '', role: 'operator' as UserRole });

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  if (!canManageAdmin()) {
    navigate('/');
    return null;
  }

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleSavePlant = (e: FormEvent) => {
    e.preventDefault();
    savePlant(plantForm);
    showToast(t('plantSaved'));
  };

  const handleAddUser = (e: FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password) {
      setAddError(t('username') + ' / ' + t('password'));
      return;
    }
    const ok = addUser({
      username: newUser.username,
      password: newUser.password,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      plantName: newUser.plantName,
      country: 'Other',
      city: 'Other',
      role: newUser.role,
      isActive: true,
      permissions: rolePermissions(newUser.role),
    });
    if (!ok) {
      setAddError(t('username'));
      return;
    }
    setAddError('');
    setNewUser({ username: '', password: '', name: '', email: '', phone: '', plantName: '', role: 'operator' });
    setShowAdd(false);
    showToast(t('userAdded'));
  };

  const activeCount = users.filter(u => u.isActive).length;
  const tabs: { key: Tab; label: string; emoji: string }[] = [
    { key: 'overview', label: t('tabOverview'), emoji: '📊' },
    { key: 'plant', label: t('tabPlantData'), emoji: '🏭' },
    { key: 'users', label: t('tabUsers'), emoji: '👥' },
  ];

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9] py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">⚙️ {t('adminPanelTitle')}</h1>
            <p className="text-slate-400">{t('adminPanelSubtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <LangSelector />
            <button
              onClick={() => navigate('/')}
              className="bg-[#334155] hover:bg-[#3f4863] text-white px-5 py-2.5 rounded-lg font-bold transition-all duration-300"
            >
              ← {t('backToDashboard')}
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map(tb => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all duration-300 border ${
                tab === tb.key
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                  : 'bg-[#1e293b] text-slate-300 border-[#334155] hover:bg-[#263449]'
              }`}
            >
              {tb.emoji} {tb.label}
            </button>
          ))}
        </div>

        {toast && (
          <div className="mb-6 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 px-4 py-3 rounded-lg font-bold text-sm">
            ✅ {toast}
          </div>
        )}

        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">🏭 {t('plantName')}</p>
                <p className="text-lg font-bold text-white truncate">{plant.name || '—'}</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">📍 {t('location')}</p>
                <p className="text-lg font-bold text-white truncate">{plant.city || '—'}{plant.city && plant.country ? ', ' : ''}{plant.country || ''}</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">📏 {t('capacityM3')}</p>
                <p className="text-lg font-bold text-white truncate">{plant.capacityM3 || '—'}</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">📅 {t('foundingYear')}</p>
                <p className="text-lg font-bold text-white truncate">{plant.foundingYear || '—'}</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">🎛️ {t('mixerCount')}</p>
                <p className="text-lg font-bold text-white truncate">{plant.mixerCount || '—'}</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">🚛 {t('truckCount')}</p>
                <p className="text-lg font-bold text-white truncate">{plant.truckCount || '—'}</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">👥 {t('tabUsers')}</p>
                <p className="text-lg font-bold text-white truncate">{users.length} ({activeCount} {t('isActive')})</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">🧩 {t('permissions')}</p>
                <p className="text-lg font-bold text-white truncate">{MODULE_KEYS.length} {t('module')}</p>
              </div>
            </div>

            <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
              <h2 className="text-lg font-bold text-white mb-3">👥 {t('tabUsers')}</h2>
              {users.length === 0 ? (
                <p className="text-slate-400">{t('noUsers')}</p>
              ) : (
                <div className="space-y-2">
                  {users.map(u => (
                    <div key={u.username} className="flex items-center justify-between bg-[#0f172a] rounded-lg px-4 py-3 border border-[#334155]">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{ROLE_EMOJIS[u.role]}</span>
                        <div>
                          <p className="font-bold text-white">{u.name || u.username}</p>
                          <p className="text-xs text-slate-400">@{u.username} · {u.role}</p>
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded font-bold ${
                        u.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {u.isActive ? '🟢 ' + t('isActive') : '🔴 ' + t('inactive')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'plant' && (
          <form onSubmit={handleSavePlant} className="bg-[#1e293b] rounded-2xl border border-[#334155] p-8">
            <h2 className="text-xl font-bold text-white mb-6">🏭 {t('tabPlantData')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label={t('plantName')} value={plantForm.name} onChange={v => setPlantForm({ ...plantForm, name: v })} />
              <Field label={t('managerName')} value={plantForm.manager} onChange={v => setPlantForm({ ...plantForm, manager: v })} />
              <Field label={t('address')} value={plantForm.address} onChange={v => setPlantForm({ ...plantForm, address: v })} />
              <Field label={t('city')} value={plantForm.city} onChange={v => setPlantForm({ ...plantForm, city: v })} />
              <Field label={t('country')} value={plantForm.country} onChange={v => setPlantForm({ ...plantForm, country: v })} />
              <Field label={t('phone')} value={plantForm.phone} onChange={v => setPlantForm({ ...plantForm, phone: v })} />
              <Field label={t('email')} type="email" value={plantForm.email} onChange={v => setPlantForm({ ...plantForm, email: v })} />
              <Field label={t('licenseNumber')} value={plantForm.licenseNumber} onChange={v => setPlantForm({ ...plantForm, licenseNumber: v })} />
              <Field label={t('capacityM3')} value={plantForm.capacityM3} onChange={v => setPlantForm({ ...plantForm, capacityM3: v })} />
              <div className="grid grid-cols-2 gap-5">
                <Field label={t('mixerCount')} value={plantForm.mixerCount} onChange={v => setPlantForm({ ...plantForm, mixerCount: v })} />
                <Field label={t('truckCount')} value={plantForm.truckCount} onChange={v => setPlantForm({ ...plantForm, truckCount: v })} />
              </div>
              <Field label={t('foundingYear')} value={plantForm.foundingYear} onChange={v => setPlantForm({ ...plantForm, foundingYear: v })} />
            </div>
            <div className="mt-5">
              <Field label={t('notes')} rows={3} value={plantForm.notes} onChange={v => setPlantForm({ ...plantForm, notes: v })} />
            </div>
            <div className="flex justify-end pt-6 border-t border-[#334155] mt-6">
              <button
                type="submit"
                className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-8 py-3 rounded-lg font-bold transition-all duration-300"
              >
                💾 {t('save')}
              </button>
            </div>
          </form>
        )}

        {tab === 'users' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">👥 {t('tabUsers')}</h2>
              <button
                onClick={() => { setShowAdd(!showAdd); setAddError(''); }}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-2.5 rounded-lg font-bold transition-all duration-300"
              >
                {showAdd ? '✖ ' + t('cancel') : '➕ ' + t('addUser')}
              </button>
            </div>

            {showAdd && (
              <form onSubmit={handleAddUser} className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <h3 className="font-bold text-white mb-4">➕ {t('addUser')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label={t('username') + ' *'} value={newUser.username} onChange={v => setNewUser({ ...newUser, username: v })} />
                  <Field label={t('password') + ' *'} value={newUser.password} onChange={v => setNewUser({ ...newUser, password: v })} />
                  <Field label={t('fullName')} value={newUser.name} onChange={v => setNewUser({ ...newUser, name: v })} />
                  <Field label={t('email')} type="email" value={newUser.email} onChange={v => setNewUser({ ...newUser, email: v })} />
                  <Field label={t('phone')} value={newUser.phone} onChange={v => setNewUser({ ...newUser, phone: v })} />
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">{t('role')}</label>
                    <select
                      value={newUser.role}
                      onChange={e => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                      className="w-full px-3 py-2 bg-[#0f172a] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {ROLE_KEYS.map(r => <option key={r} value={r}>{ROLE_EMOJIS[r]} {t(ROLE_T_KEYS[r])}</option>)}
                    </select>
                  </div>
                </div>
                {addError && <p className="text-red-400 text-sm mt-3">⚠️ {t('username')} {t('status')}</p>}
                <div className="flex justify-end pt-4">
                  <button type="submit" className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-8 py-2.5 rounded-lg font-bold transition-all duration-300">
                    ➕ {t('addUser')}
                  </button>
                </div>
              </form>
            )}

            {users.length === 0 ? (
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-10 text-center text-slate-400">{t('noUsers')}</div>
            ) : (
              users.map(u => (
                <div key={u.username} className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{ROLE_EMOJIS[u.role]}</span>
                      <div>
                        <p className="font-bold text-white text-lg">{u.name || u.username}</p>
                        <p className="text-xs text-slate-400">@{u.username}{u.plantName ? ' · ' + u.plantName : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2.5 py-1 rounded font-bold ${
                        u.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {u.isActive ? '🟢 ' + t('isActive') : '🔴 ' + t('inactive')}
                      </span>
                      <button
                        onClick={() => deleteUser(u.username)}
                        className="bg-red-500/15 text-red-400 text-xs px-3 py-1.5 rounded-lg font-bold border border-red-500/30 hover:bg-red-500/30 transition-colors"
                      >
                        🗑️ {t('deleteUser')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">👑 {t('role')}</label>
                      <select
                        value={u.role}
                        onChange={e => updateUser({ ...u, role: e.target.value as UserRole, permissions: rolePermissions(e.target.value as UserRole) })}
                        className="w-full px-3 py-2 bg-[#0f172a] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {ROLE_KEYS.map(r => <option key={r} value={r}>{ROLE_EMOJIS[r]} {t(ROLE_T_KEYS[r])}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer bg-[#0f172a] border border-[#334155] rounded-lg px-4 py-2 w-full">
                        <input
                          type="checkbox"
                          checked={u.isActive}
                          onChange={e => updateUser({ ...u, isActive: e.target.checked })}
                          className="w-4 h-4 accent-emerald-500"
                        />
                        <span className="text-sm font-medium text-slate-300">{t('isActive')}</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-2">🧩 {t('permissions')}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {MODULE_KEYS.map(mod => (
                        <label key={mod} className="flex items-center gap-2 cursor-pointer bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!u.permissions[mod]}
                            disabled={u.role === 'owner' || u.role === 'manager'}
                            onChange={e => updateUser({ ...u, permissions: { ...u.permissions, [mod]: e.target.checked } })}
                            className="w-4 h-4 accent-blue-500"
                          />
                          <span className="text-xs text-slate-300">{MODULE_EMOJIS[mod]} {t(MODULE_T_KEYS[mod])}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
