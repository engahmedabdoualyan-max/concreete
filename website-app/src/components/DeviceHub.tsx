import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDeviceHubDict, type DeviceHubDictKey } from '../i18n/deviceHubDict';
import { loadDevicesRegistry, saveDevicesRegistry, type DeviceEntry } from '../firebase/firestore';

/**
 * Peripheral Devices Hub — الأجهزة الطرفية اختيارية.
 * البرنامج يعمل بالكامل بدون أي جهاز؛ كل جهاز يتصل من هنا ويظهر حالته
 * لباقي المكونات (Batch Controller / Dashcam / Accounting / GPS / Weighbridge).
 */

export const DEVICE_DEFS = [
  { id: 'batchController', name: 'متحكم المحطة', en: 'Batch Controller', icon: '🏭', nameKey: 'devBatch' as const, descKey: 'descBatch' as const, desc: 'Command Alkon / Liebherr / Sicom — بث مباشر للدفعات', optional: true },
  { id: 'dashcam', name: 'داش كام الأسطول', en: 'Fleet Dashcam', icon: '📹', nameKey: 'devDashcam' as const, descKey: 'descDashcam' as const, desc: 'كاميرات الشاحنات + كشف الأحداث', optional: true },
  { id: 'accounting', name: 'البرنامج المحاسبي', en: 'Accounting Sync', icon: '🔗', nameKey: 'devAccounting' as const, descKey: 'descAccounting' as const, desc: 'QuickBooks / Sage مزامنة الفواتير والمدفوعات', optional: true },
  { id: 'gpsTrackers', name: 'متتبعات GPS', en: 'GPS Trackers', icon: '📡', nameKey: 'devGps' as const, descKey: 'descGps' as const, desc: 'أجهزة التتبع في الشاحنات والمعدات', optional: true },
  { id: 'weighbridge', name: 'قبّان الوزن (بسكول)', en: 'Weighbridge', icon: '⚖️', nameKey: 'devWeighbridge' as const, descKey: 'descWeighbridge' as const, desc: 'ربط ميزان السيارات (اختياري — اليدوي شغال)', optional: true },
];

export function useDevices() {
  const { currentUser } = useAuth();
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    loadDevicesRegistry(currentUser.username).then(d => {
      // Seed defaults for any missing device
      const base: DeviceEntry[] = DEVICE_DEFS.map(def => {
        const found = (Array.isArray(d) ? d : []).find((x: any) => x.id === def.id);
        return found || { id: def.id, name: def.name, connected: false };
      });
      setDevices(base);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [currentUser?.username]);

  const update = (id: string, patch: Partial<DeviceEntry>) => {
    setDevices(prev => {
      const next = prev.map(d => d.id === id ? { ...d, ...patch, lastCheckedAt: new Date().toISOString() } : d);
      if (currentUser) saveDevicesRegistry(currentUser.username, next).catch(() => {});
      return next;
    });
  };

  const isConnected = (id: string) => !!devices.find(d => d.id === id)?.connected;
  return { devices, update, isConnected, loaded };
}

/** Small badge shown inside feature screens reflecting hub state. */
export function DeviceStatusBadge({ id }: { id: string }) {
  const { devices, loaded } = useDevices();
  const t = useDeviceHubDict();
  const dev = devices.find(d => d.id === id);
  if (!loaded) return null;
  return dev?.connected ? (
    <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded">{t('badgeConnected')}</span>
  ) : (
    <span className="inline-flex items-center gap-1 bg-sky-500/10 text-sky-300 border border-white/10 text-[10px] font-bold px-2 py-0.5 rounded">{t('badgeNoDevice')}</span>
  );
}

interface Props { onToast?: (m: string) => void; }

export default function DeviceHub({ onToast }: Props) {
  const { currentUser } = useAuth();
  const { devices, update, loaded } = useDevices();
  const t = useDeviceHubDict();

  const toggle = (id: string, nameKey: DeviceHubDictKey) => {
    const cur = devices.find(d => d.id === id);
    const next = !cur?.connected;
    update(id, { connected: next });
    onToast?.(next
      ? t('toastConnected').replace('{name}', t(nameKey))
      : t('toastDisconnected').replace('{name}', t(nameKey)));
  };

  if (!currentUser) return null;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/30 rounded-2xl p-5">
        <h3 className="text-lg font-black tracking-tight text-white">{t('dhTitle')}</h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          {t('intro1')}<strong className="text-emerald-400">{t('optionalWord')}</strong>{t('intro2')}
        </p>
      </div>

      {!loaded ? (
        <div className="text-center py-8 text-slate-500 text-sm">{t('loadingDevices')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DEVICE_DEFS.map(def => {
            const dev = devices.find(d => d.id === def.id);
            const on = !!dev?.connected;
            return (
              <div key={def.id} className={`bg-white/[0.03] border rounded-xl p-4 transition ${on ? 'border-emerald-500/40' : 'border-white/10'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-2xl">{def.icon}</span>
                    <div className="min-w-0">
                      <p className="font-black text-white text-sm">{t(def.nameKey)} <span className="text-[10px] text-slate-500 font-normal">{def.en}</span></p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{t(def.descKey)}</p>
                      {dev?.lastCheckedAt && (
                        <p className="text-[9px] text-slate-600 mt-1" dir="ltr">{t('lastCheck').replace('{time}', new Date(dev.lastCheckedAt).toLocaleString('en-GB'))}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => toggle(def.id, def.nameKey)}
                    className={`shrink-0 text-xs font-bold px-3 py-2 rounded-lg border transition ${on
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                      : 'bg-white/[0.05] text-slate-300 border-white/10 hover:bg-white/[0.1]'}`}
                  >
                    {on ? t('connectedOn') : t('connectBtn')}
                  </button>
                </div>
                {on && dev?.meta?.model && (
                  <p className="text-[10px] text-emerald-400/80 mt-2" dir="ltr">Model: {dev.meta.model}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
