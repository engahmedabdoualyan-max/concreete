import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { loadCustomers, saveCustomers } from '../firebase/firestore';

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  createdAt: string;
}

export default function CustomersManager({ onSelect }: { onSelect?: (c: Customer | null) => void }) {
  const { currentUser } = useAuth();
  const { t } = useLang();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });

  useEffect(() => {
    if (!currentUser) return;
    loadCustomers(currentUser.username).then(d => {
      if (Array.isArray(d) && d.length) setCustomers(d);
      else {
        const s = localStorage.getItem('concrete_plant_customers');
        if (s) setCustomers(JSON.parse(s));
      }
    }).catch(() => {});
  }, [currentUser?.username]);

  useEffect(() => {
    if (!currentUser || !customers.length) return;
    localStorage.setItem('concrete_plant_customers', JSON.stringify(customers));
    saveCustomers(currentUser.username, customers).catch(() => {});
  }, [customers, currentUser?.username]);

  const nextCode = () => {
    const n = customers.reduce((m, c) => Math.max(m, (parseInt((c.code || 'C-0000').replace('C-', ''), 10) || 0)), 0);
    return 'C-' + String(n + 1).padStart(4, '0');
  };

  const addCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) { alert(t('enterCustomerNamePhone')); return; }
    const c: Customer = {
      id: 'c-' + Date.now().toString(36),
      code: nextCode(),
      name: form.name,
      phone: form.phone,
      address: form.address,
      createdAt: new Date().toISOString(),
    };
    setCustomers(prev => [...prev, c]);
    setForm({ name: '', phone: '', address: '' });
    setShowAdd(false);
    if (onSelect) onSelect(c);
  };

  const del = (id: string) => {
    if (confirm(t('deleteCustomerConfirm'))) setCustomers(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div>
      {customers.length === 0 && !showAdd ? (
        <p className="text-xs text-slate-500">{t('noCustomersYet')}</p>
      ) : (
        <div className="max-h-52 overflow-y-auto space-y-1.5">
          {customers.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-2 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate"><span className="text-sky-400">{c.code}</span> · {c.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{c.phone}{c.address ? ' · ' + c.address : ''}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onSelect && <button type="button" onClick={() => onSelect(c)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] px-2 py-1 rounded font-bold">{t('select')}</button>}
                <button type="button" onClick={() => del(c.id)} className="bg-red-600 hover:bg-red-700 text-white text-[10px] px-2 py-1 rounded font-bold">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <form onSubmit={addCustomer} className="mt-3 space-y-2 bg-white/[0.04] border border-emerald-500/30 rounded-lg p-3">
          <p className="text-xs font-bold text-emerald-400">👤 {t('newCustomer')} ({t('auto')}: {nextCode()})</p>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={`${t('customerName')} *`} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" />
          <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder={`${t('phone')} *`} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" />
          <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder={`${t('address')} (${t('optional')})`} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 rounded-lg text-sm">💾 {t('saveCustomer')}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold py-1.5 rounded-lg text-sm">{t('cancel')}</button>
          </div>
        </form>
      )}
      {!showAdd && (
        <button type="button" onClick={() => setShowAdd(true)} className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold">➕ {t('addNewCustomer')}</button>
      )}
    </div>
  );
}
