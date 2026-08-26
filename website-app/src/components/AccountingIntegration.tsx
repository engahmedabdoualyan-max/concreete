/**
 * ============================================================
 *  FIMTO SOFT — Accounting Integration (ربط برامج المحاسبة)
 * ============================================================
 *  QuickBooks Online + Sage integration panel with sync,
 *  export (CSV / QBO), and Firebase-persisted settings.
 * ============================================================
 */

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadAccountingSettings, saveAccountingSettings, loadDevicesRegistry, saveDevicesRegistry } from '../firebase/firestore';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AccountingIntegrationProps {
  onClose: () => void;
}

type Platform = 'quickbooks' | 'sage';
type ConnectionStatus = 'disconnected' | 'connected' | 'syncing';
type DataType = 'invoices' | 'payments' | 'purchaseOrders' | 'expenses';
type SyncFrequency = 'daily' | 'weekly' | 'monthly';
type ExportFormat = 'csv' | 'qbo';

interface PlatformConfig {
  name: string;
  nameAr: string;
  icon: string;
  color: string;
  colorBorder: string;
}

interface SyncSettings {
  quickbooks: { connected: boolean; lastSync: string | null };
  sage: { connected: boolean; lastSync: string | null };
  dataTypes: DataType[];
  autoSync: SyncFrequency;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PLATFORMS: Record<Platform, PlatformConfig> = {
  quickbooks: {
    name: 'QuickBooks Online',
    nameAr: 'QuickBooks أونلاين',
    icon: '📗',
    color: 'bg-emerald-500/20 text-emerald-300',
    colorBorder: 'border-emerald-500/40',
  },
  sage: {
    name: 'Sage',
    nameAr: 'Sage ساج',
    icon: '📘',
    color: 'bg-blue-500/20 text-blue-300',
    colorBorder: 'border-blue-500/40',
  },
};

const DATA_TYPES: { key: DataType; label: string; labelAr: string }[] = [
  { key: 'invoices', label: 'Invoices', labelAr: 'الفواتير' },
  { key: 'payments', label: 'Payments', labelAr: 'المدفوعات' },
  { key: 'purchaseOrders', label: 'Purchase Orders', labelAr: 'طلبات الشراء' },
  { key: 'expenses', label: 'Expenses', labelAr: 'المصاريف' },
];

const FREQUENCIES: { key: SyncFrequency; label: string; labelAr: string }[] = [
  { key: 'daily', label: 'Daily', labelAr: 'يومي' },
  { key: 'weekly', label: 'Weekly', labelAr: 'أسبوعي' },
  { key: 'monthly', label: 'Monthly', labelAr: 'شهري' },
];

/* ------------------------------------------------------------------ */
/*  Helper: export data to CSV                                          */
/* ------------------------------------------------------------------ */

function toCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',');
  const lines = rows.map(r =>
    columns.map(c => {
      const v = String(r[c] ?? '');
      return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Simulated sync data generators                                     */
/* ------------------------------------------------------------------ */

function generateSampleInvoices() {
  const now = new Date();
  return Array.from({ length: 5 }, (_, i) => ({
    id: `INV-${1001 + i}`,
    customer: ['المقاولون العرب', 'بن لادن', 'الحرفي', 'الإنماء', 'الأزهر'][i],
    amount: [45000, 120000, 32000, 87500, 28000][i],
    currency: 'SAR',
    date: new Date(now.getTime() - i * 86400000 * 3).toISOString().slice(0, 10),
    status: ['paid', 'pending', 'paid', 'overdue', 'paid'][i],
  }));
}

function generateSamplePayments() {
  const now = new Date();
  return Array.from({ length: 4 }, (_, i) => ({
    id: `PAY-${2001 + i}`,
    invoiceRef: `INV-${1001 + i}`,
    amount: [45000, 80000, 32000, 50000][i],
    method: ['bank_transfer', 'cheque', 'bank_transfer', 'cash'][i],
    date: new Date(now.getTime() - i * 86400000 * 2).toISOString().slice(0, 10),
  }));
}

function generateSamplePO() {
  const now = new Date();
  return Array.from({ length: 3 }, (_, i) => ({
    id: `PO-${3001 + i}`,
    supplier: ['أسمنت العربية', 'شركة رمل', 'مصنع أنابيب'][i],
    amount: [95000, 18000, 42000][i],
    date: new Date(now.getTime() - i * 86400000 * 5).toISOString().slice(0, 10),
    status: ['approved', 'pending', 'approved'][i],
  }));
}

function generateSampleExpenses() {
  const now = new Date();
  return Array.from({ length: 4 }, (_, i) => ({
    id: `EXP-${4001 + i}`,
    category: ['وقود', 'صيانة', 'رواتب', 'مرافق'][i],
    amount: [12000, 8500, 120000, 3200][i],
    date: new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10),
  }));
}

/* ------------------------------------------------------------------ */
/*  Simulated QBO XML generator                                        */
/* ------------------------------------------------------------------ */

function toQBO(invoices: ReturnType<typeof generateSampleInvoices>): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE QBXML PUBLIC "-//INTUIT//DTD QBXML QBO 2.0//EN" "http://developer.intuit.com/dtd/qbxml20.dtd">',
    '<QBXML>',
    '  <QBXMLMsgsRq onError="stopOnError">',
  ];
  for (const inv of invoices) {
    lines.push(
      '    <InvoiceAddRq>',
      '      <InvoiceAdd>',
      `        <CustomerRef><FullName>${inv.customer}</FullName></CustomerRef>`,
      `        <TxnDate>${inv.date}</TxnDate>`,
      '        <InvoiceLineAdd>',
      '          <ItemRef><FullName>Concrete Delivery</FullName></ItemRef>',
      `          <Amount>${inv.amount.toFixed(2)}</Amount>`,
      '        </InvoiceLineAdd>',
      '      </InvoiceAdd>',
      '    </InvoiceAddRq>'
    );
  }
  lines.push('  </QBXMLMsgsRq>', '</QBXML>');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

async function reportAccountingDevice(connected: boolean, platformName?: string) {
  try {
    const raw = localStorage.getItem('currentUserSession');
    const username = raw ? (JSON.parse(raw)?.username || '') : '';
    if (!username) return;
    const list = (await loadDevicesRegistry(username)) || [];
    const next = list.map((d: any) => d.id === 'accounting'
      ? { ...d, connected, model: platformName || d.model, lastCheckedAt: new Date().toISOString() }
      : d);
    if (!next.find((d: any) => d.id === 'accounting')) next.push({ id: 'accounting', name: 'البرنامج المحاسبي', connected });
    await saveDevicesRegistry(username, next);
  } catch { /* best-effort */ }
}

export default function AccountingIntegration({ onClose }: AccountingIntegrationProps) {
  const { currentUser } = useAuth();

  /* ---- settings state ---- */
  const [settings, setSettings] = useState<SyncSettings>({
    quickbooks: { connected: false, lastSync: null },
    sage: { connected: false, lastSync: null },
    dataTypes: ['invoices', 'payments'],
    autoSync: 'daily',
  });

  /* ---- UI state ---- */
  const [syncStatus, setSyncStatus] = useState<Record<Platform, ConnectionStatus>>({
    quickbooks: 'disconnected',
    sage: 'disconnected',
  });
  const [syncProgress, setSyncProgress] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState<{ platform: Platform; count: number; time: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'platforms' | 'settings' | 'export'>('platforms');
  const [loading, setLoading] = useState(true);

  /* ---- load persisted settings ---- */
  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    loadAccountingSettings(currentUser.username)
      .then((data: any) => {
        if (data) {
          setSettings(prev => ({
            ...prev,
            ...(data as Partial<SyncSettings>),
            dataTypes: Array.isArray(data.dataTypes) ? data.dataTypes : prev.dataTypes,
          }));
          if (data.quickbooks?.connected) setSyncStatus(p => ({ ...p, quickbooks: 'connected' }));
          if (data.sage?.connected) setSyncStatus(p => ({ ...p, sage: 'connected' }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentUser?.username]);

  /* ---- persist settings on change ---- */
  useEffect(() => {
    if (!currentUser || loading) return;
    saveAccountingSettings(currentUser.username, settings).catch(() => {});
  }, [settings, currentUser?.username, loading]);

  /* ---- toggle data type ---- */
  const toggleDataType = useCallback((key: DataType) => {
    setSettings(prev => ({
      ...prev,
      dataTypes: prev.dataTypes.includes(key)
        ? prev.dataTypes.filter(k => k !== key)
        : [...prev.dataTypes, key],
    }));
  }, []);

  /* ---- simulate OAuth connect ---- */
  const connectPlatform = useCallback((platform: Platform) => {
    setSyncStatus(p => ({ ...p, [platform]: 'syncing' }));
    setTimeout(() => {
      setSyncStatus(p => ({ ...p, [platform]: 'connected' }));
      setSettings(prev => ({
        ...prev,
        [platform]: { connected: true, lastSync: null },
      }));
      const name = PLATFORMS.find(x => x.id === platform)?.nameAr || platform;
      reportAccountingDevice(true, name);
    }, 1500);
  }, []);

  /* ---- disconnect ---- */
  const disconnectPlatform = useCallback((platform: Platform) => {
    reportAccountingDevice(false);
    setSyncStatus(p => ({ ...p, [platform]: 'disconnected' }));
    setSettings(prev => ({
      ...prev,
      [platform]: { connected: false, lastSync: null },
    }));
  }, []);

  /* ---- manual sync ---- */
  const runSync = useCallback(async (platform: Platform) => {
    if (syncStatus[platform] !== 'connected') return;
    setSyncStatus(p => ({ ...p, [platform]: 'syncing' }));
    setSyncProgress(0);

    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      await new Promise(r => setTimeout(r, 80));
      setSyncProgress(Math.round((i / steps) * 100));
    }

    const count = settings.dataTypes.length * (platform === 'quickbooks' ? 16 : 11);
    const time = new Date().toLocaleString('en-GB');
    setSyncStatus(p => ({ ...p, [platform]: 'connected' }));
    setLastSyncResult({ platform, count, time });
    setSettings(prev => ({
      ...prev,
      [platform]: { ...prev[platform], lastSync: time },
    }));
    setSyncProgress(0);
  }, [syncStatus, settings.dataTypes]);

  /* ---- export ---- */
  const handleExport = useCallback((format: ExportFormat) => {
    const ts = new Date().toISOString().slice(0, 10);
    const includedTypes = settings.dataTypes;

    if (format === 'csv') {
      const parts: string[] = [];
      if (includedTypes.includes('invoices')) {
        parts.push('--- Invoices ---');
        parts.push(toCSV(generateSampleInvoices(), ['id', 'customer', 'amount', 'currency', 'date', 'status']));
      }
      if (includedTypes.includes('payments')) {
        parts.push('', '--- Payments ---');
        parts.push(toCSV(generateSamplePayments(), ['id', 'invoiceRef', 'amount', 'method', 'date']));
      }
      if (includedTypes.includes('purchaseOrders')) {
        parts.push('', '--- Purchase Orders ---');
        parts.push(toCSV(generateSamplePO(), ['id', 'supplier', 'amount', 'date', 'status']));
      }
      if (includedTypes.includes('expenses')) {
        parts.push('', '--- Expenses ---');
        parts.push(toCSV(generateSampleExpenses(), ['id', 'category', 'amount', 'date']));
      }
      downloadBlob(parts.join('\n'), `fimto-accounting-export-${ts}.csv`, 'text/csv;charset=utf-8');
    } else {
      const qbo = toQBO(generateSampleInvoices());
      downloadBlob(qbo, `fimto-accounting-export-${ts}.qbo`, 'application/xml');
    }
  }, [settings.dataTypes]);

  /* ---- status helpers ---- */
  const statusDot = (s: ConnectionStatus) => {
    if (s === 'connected') return <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block animate-pulse" />;
    if (s === 'syncing') return <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block animate-spin" />;
    return <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />;
  };

  const statusLabel = (s: ConnectionStatus) => {
    if (s === 'connected') return { en: 'Connected', ar: 'متصل' };
    if (s === 'syncing') return { en: 'Syncing…', ar: 'جاري المزامنة…' };
    return { en: 'Disconnected', ar: 'غير متصل' };
  };

  /* ================================================================== */
  /*  RENDER                                                             */
  /* ================================================================== */

  return (
    <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div
        className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl backdrop-blur-xl relative"
        onClick={e => e.stopPropagation()}
      >
        {/* ---- Close button ---- */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/10 text-slate-400 hover:text-white hover:border-sky-400/60 transition-colors z-10"
          aria-label="close"
        >
          ✕
        </button>

        {/* ---- Header ---- */}
        <div className="p-6 pb-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🔗</span>
            <div>
              <h2 className="text-lg font-bold text-white">Accounting Integration</h2>
              <p className="text-xs text-slate-400">ربط برامج المحاسبة — QuickBooks &amp; Sage</p>
              <span className="mt-1 inline-block bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 text-[10px] font-bold px-2 py-0.5 rounded">⚠️ وضع تجريبي — التصدير CSV/QBO جاهز، المزامنة المباشرة تحتاج OAuth خادم</span>
            </div>
          </div>
        </div>

        {/* ---- Tabs ---- */}
        <div className="flex gap-1 px-6 pt-4">
          {([
            { key: 'platforms' as const, en: 'Platforms', ar: 'المنصات' },
            { key: 'settings' as const, en: 'Settings', ar: 'الإعدادات' },
            { key: 'export' as const, en: 'Export', ar: 'تصدير' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`text-xs font-bold px-4 py-2 rounded-t-lg border transition-colors ${
                activeTab === tab.key
                  ? 'bg-white/[0.06] border-white/10 border-b-transparent text-white'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.en} <span className="text-[10px] opacity-60">/ {tab.ar}</span>
            </button>
          ))}
        </div>

        <div className="px-6 pb-6 pt-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
              <span className="animate-spin mr-2">⏳</span> Loading settings…
            </div>
          )}

          {/* ============================================================ */}
          {/*  TAB: PLATFORMS                                              */}
          {/* ============================================================ */}
          {!loading && activeTab === 'platforms' && (
            <div className="space-y-4">
              {(Object.keys(PLATFORMS) as Platform[]).map(platform => {
                const cfg = PLATFORMS[platform];
                const st = syncStatus[platform];
                const info = statusLabel(st);
                const settingsForPlatform = settings[platform];

                return (
                  <div
                    key={platform}
                    className={`rounded-xl border p-4 transition-colors ${
                      st === 'connected' ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/10 bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{cfg.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-white">{cfg.name}</p>
                          <p className="text-[10px] text-slate-400">{cfg.nameAr}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusDot(st)}
                        <span className="text-[10px] text-slate-400">{info.en}</span>
                      </div>
                    </div>

                    {/* Connection details */}
                    {st === 'connected' && settingsForPlatform.lastSync && (
                      <p className="text-[10px] text-slate-500 mb-3">
                        Last sync / آخر مزامنة: <span className="text-slate-300">{settingsForPlatform.lastSync}</span>
                      </p>
                    )}

                    {/* Sync progress bar */}
                    {st === 'syncing' && (
                      <div className="mb-3">
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-yellow-400 rounded-full transition-all duration-100"
                            style={{ width: `${syncProgress}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-yellow-400 mt-1">{syncProgress}%</p>
                      </div>
                    )}

                    {/* Sync result */}
                    {lastSyncResult?.platform === platform && st === 'connected' && (
                      <p className="text-[10px] text-emerald-400 mb-3">
                        ✓ Synced {lastSyncResult.count} records at {lastSyncResult.time}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      {st === 'disconnected' && (
                        <button
                          onClick={() => connectPlatform(platform)}
                          className={`text-[11px] font-bold px-4 py-1.5 rounded-lg border transition-colors ${cfg.color} ${cfg.colorBorder} hover:brightness-125`}
                        >
                          Connect / ربط
                        </button>
                      )}
                      {st === 'connected' && (
                        <>
                          <button
                            onClick={() => runSync(platform)}
                            className="text-[11px] font-bold px-4 py-1.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30 transition-colors"
                          >
                            Sync Now / مزامنة الآن
                          </button>
                          <button
                            onClick={() => disconnectPlatform(platform)}
                            className="text-[11px] font-bold px-4 py-1.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-colors"
                          >
                            Disconnect / قطع الربط
                          </button>
                        </>
                      )}
                      {st === 'syncing' && (
                        <span className="text-[11px] text-yellow-400 animate-pulse">Syncing… جاري المزامنة</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* OAuth / API-key note */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  <span className="text-slate-300 font-bold">Note:</span> This is a simulation interface.
                  In production, QuickBooks uses OAuth 2.0 flow and Sage uses API key authentication.
                  <br />
                  <span className="text-slate-500">ملاحظة: واجهة محاكاة — QuickBooks يستخدم OAuth 2.0 و Sage يستخدم مفتاح API</span>
                </p>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/*  TAB: SETTINGS                                               */}
          {/* ============================================================ */}
          {!loading && activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Data types */}
              <div>
                <p className="text-xs font-bold text-white mb-2">Data Types to Sync</p>
                <p className="text-[10px] text-slate-500 mb-3">أنواع البيانات للمزامنة</p>
                <div className="space-y-2">
                  {DATA_TYPES.map(dt => {
                    const checked = settings.dataTypes.includes(dt.key);
                    return (
                      <button
                        key={dt.key}
                        onClick={() => toggleDataType(dt.key)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border text-left transition-colors ${
                          checked
                            ? 'bg-sky-500/10 border-sky-500/30 text-white'
                            : 'bg-white/[0.02] border-white/10 text-slate-400 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-colors ${
                            checked ? 'bg-sky-500 border-sky-500 text-white' : 'border-slate-500'
                          }`}>
                            {checked && '✓'}
                          </span>
                          <span className="text-xs font-bold">{dt.label}</span>
                          <span className="text-[10px] text-slate-500">{dt.labelAr}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Auto-sync frequency */}
              <div>
                <p className="text-xs font-bold text-white mb-2">Auto-Sync Frequency</p>
                <p className="text-[10px] text-slate-500 mb-3">تكرار المزامنة التلقائية</p>
                <div className="flex gap-2">
                  {FREQUENCIES.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setSettings(p => ({ ...p, autoSync: f.key }))}
                      className={`flex-1 text-xs font-bold py-2.5 rounded-lg border transition-colors ${
                        settings.autoSync === f.key
                          ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                          : 'bg-white/[0.02] border-white/10 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      {f.label}
                      <br />
                      <span className="text-[10px] opacity-60">{f.labelAr}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Firebase persistence note */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  <span className="text-slate-300 font-bold">⚙ Firebase:</span> Settings are saved automatically to your account.
                  <br />
                  <span className="text-slate-500">يتم حفظ الإعدادات تلقائياً في حسابك عبر Firebase</span>
                </p>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/*  TAB: EXPORT                                                  */}
          {/* ============================================================ */}
          {!loading && activeTab === 'export' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-white mb-1">Export Accounting Data</p>
                <p className="text-[10px] text-slate-500 mb-4">تصدير البيانات المحاسبية بصيغة CSV أو QBO</p>
              </div>

              {/* Selected data types summary */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 mb-2">
                <p className="text-[10px] text-slate-400 mb-1">Included data / البيانات المشمولة:</p>
                <div className="flex flex-wrap gap-1.5">
                  {settings.dataTypes.map(dk => {
                    const dt = DATA_TYPES.find(d => d.key === dk);
                    return dt ? (
                      <span key={dk} className="text-[10px] bg-sky-500/10 text-sky-300 border border-sky-500/30 rounded px-2 py-0.5">
                        {dt.label}
                      </span>
                    ) : null;
                  })}
                  {settings.dataTypes.length === 0 && (
                    <span className="text-[10px] text-red-400">No data types selected — اختر أنواع البيانات من الإعدادات</span>
                  )}
                </div>
              </div>

              {/* Export buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={settings.dataTypes.length === 0}
                  onClick={() => handleExport('csv')}
                  className="flex flex-col items-center gap-2 p-5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-30 transition-colors"
                >
                  <span className="text-3xl">📄</span>
                  <span className="text-xs font-bold text-white">CSV Export</span>
                  <span className="text-[10px] text-slate-400">ملف CSV</span>
                </button>
                <button
                  disabled={settings.dataTypes.length === 0}
                  onClick={() => handleExport('qbo')}
                  className="flex flex-col items-center gap-2 p-5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-30 transition-colors"
                >
                  <span className="text-3xl">📗</span>
                  <span className="text-xs font-bold text-white">QBO Export</span>
                  <span className="text-[10px] text-slate-400">ملف QuickBooks</span>
                </button>
              </div>

              {/* Format info */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  <span className="text-slate-300 font-bold">CSV:</span> Universal format compatible with Excel, Google Sheets, and most accounting tools.
                  <br />
                  <span className="text-slate-300 font-bold">QBO:</span> QuickBooks Online format — import directly into QuickBooks Desktop or Online.
                  <br />
                  <span className="text-slate-500">CSV: متوافق مع Excel و Google Sheets — QBO:可以直接导入 QuickBooks</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
