/**
 * ============================================================
 *  FIMTO SOFT — Download App button + platform picker modal
 * ============================================================
 *  Prominent download CTA. Opens a modal with Android (APK) and
 *  iOS options. Android links straight to the APK served by the
 *  ERP backend; iOS shows a placeholder until TestFlight / App
 *  Store links are available.
 * ============================================================
 */

import { useState } from 'react';
import { API_BASE } from '../api/client';

const ANDROID_APK_URL = `${API_BASE}/downloads/fimto-android.apk`;
const IOS_TESTFLIGHT_URL = ''; // ضع رابط TestFlight هنا عند جاهزية حساب Apple

export default function DownloadApp() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(ANDROID_APK_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <>
      {/* Trigger buttons — used inside the footer */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-[0_0_20px_rgba(56,189,248,0.25)] transition-all"
      >
        <span className="text-base">📲</span> تحميل التطبيق
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] bg-[#080C14]/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-lg p-6 shadow-[0_0_60px_rgba(56,189,248,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xl font-black text-white">📲 تطبيق Fimto Concrete</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white text-xl leading-none px-2"
                aria-label="إغلاق"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              طلبك على الموبايل: شاشة السائق (7 بوابات + GPS) وشاشة مندوب المبيعات.
              حتى اكتمال الرفع على جوجل بلاي، حمّل النسخة مباشرة:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Android */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col">
                <div className="text-3xl mb-2">🤖</div>
                <h4 className="text-white font-bold">Android</h4>
                <p className="text-[11px] text-slate-400 mb-3">
                  ملف APK مباشر (حوالي 88 م.ب) — فعّل "السماح بالتثبيت من مصادر غير معروفة"
                </p>
                <div className="mt-auto space-y-2">
                  <a
                    href={ANDROID_APK_URL}
                    download
                    className="block text-center bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-white text-sm font-bold rounded-lg px-4 py-2.5 transition-all"
                  >
                    ⬇ تحميل APK
                  </a>
                  <button
                    onClick={copyLink}
                    className="block w-full text-center border border-white/10 hover:border-sky-500/40 text-slate-300 hover:text-sky-300 text-xs rounded-lg px-3 py-2 transition-colors"
                  >
                    {copied ? '✓ تم نسخ الرابط' : 'نسخ رابط التحميل'}
                  </button>
                </div>
              </div>

              {/* iOS */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col">
                <div className="text-3xl mb-2">🍎</div>
                <h4 className="text-white font-bold">iOS (iPhone)</h4>
                <p className="text-[11px] text-slate-400 mb-3">
                  قريباً على App Store / TestFlight — يتطلب حساب مطور Apple
                </p>
                <div className="mt-auto">
                  {IOS_TESTFLIGHT_URL ? (
                    <a
                      href={IOS_TESTFLIGHT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white text-sm font-bold rounded-lg px-4 py-2.5 transition-all"
                    >
                      🚀 الانضمام على TestFlight
                    </a>
                  ) : (
                    <div className="text-center border border-white/10 bg-white/[0.02] text-slate-500 text-xs rounded-lg px-3 py-2.5">
                      ⏳ قريباً — البريد: info@fimtosoft.com
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 text-center mt-4">
              لا تنسَ: نسخة الموقع والتطبيق تتشارك نفس قاعدة البيانات الموحدة.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
