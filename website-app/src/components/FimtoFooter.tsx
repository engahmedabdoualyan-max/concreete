import fimtoLogo from '../assets/logos/fimtosoftlogo.png';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../context/LangContext';

export default function FimtoFooter() {
  const { t } = useLang();
  const navigate = useNavigate();
  const taps = useRef({ count: 0, last: 0 });

  const handleFlagTap = () => {
    const now = Date.now();
    const s = taps.current;
    if (now - s.last > 5000) s.count = 0;
    s.last = now;
    s.count += 1;
    if (s.count >= 10) {
      s.count = 0;
      navigate('/console');
    }
  };

  return (
    <footer className="w-full bg-[#0B111E] border-t border-white/10 py-6">
      <div className="max-w-[1100px] mx-auto px-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1fr] gap-x-12 gap-y-8">
        {/* Column 1 (Left): Company logo and description */}
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <img
              src={fimtoLogo}
              alt={t('fimtoLogoAlt')}
              className="h-10 w-10 rounded-xl object-contain bg-white p-1 shadow-lg"
            />
            <div>
              <h3 className="text-white font-extrabold text-lg tracking-tight">Fimto Soft</h3>
              <p className="text-emerald-500 text-xs font-semibold mt-0.5">{t('integratedTechSolutions')}</p>
            </div>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed mt-3 max-w-xs">
            {t('footerDescription')}
          </p>
        </div>

        {/* Column 2 (Center): CONTACT info */}
        <div className="min-w-0">
          <h4 className="text-white font-bold text-lg uppercase tracking-wider mb-4">{t('contact')}</h4>
          <ul className="space-y-3 text-sm sm:text-base text-white break-words">
            <li className="flex items-center gap-2">
              ✉️{' '}
              <a href="mailto:info@fimtosoft.com" className="hover:text-sky-400 transition-colors text-white">
                info@fimtosoft.com
              </a>
            </li>
            <li className="flex items-center gap-2">
              📞 <b className="text-slate-200">{t('egPrefix')}</b>{' '}
              <a href="tel:01001006627" className="hover:text-sky-400 transition-colors text-white">
                01001006627
              </a>
            </li>
            <li className="flex items-center gap-2">
              📞 <b className="text-slate-200">{t('ksaPrefix')}</b>{' '}
              <a href="tel:0500439617" className="hover:text-sky-400 transition-colors text-white">
                0500439617
              </a>
            </li>
          </ul>
        </div>

        {/* Column 3 (Right): Locations + Download App horizontal */}
        <div className="justify-self-center sm:justify-self-auto min-w-0">
          <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-3">{t('ourLocations')}</h4>
          <ul className="space-y-1.5 text-xs text-slate-400">
            <li>
              <button
                type="button"
                onClick={handleFlagTap}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 cursor-default select-none"
              >
                <span className="inline-block w-5 text-center" title={t('egypt')}>🇪🇬</span> {t('cairo')}, {t('egypt')}
              </button>
            </li>
            <li>
              <span className="inline-block w-5 text-center" title={t('saudiArabia')}>🇸🇦</span> {t('riyadh')}, {t('saudiArabia')}
            </li>
          </ul>

          {/* Download App - horizontal icon buttons at bottom of Column 3 */}
          <div className="mt-6 pt-4 border-t border-white/10 w-full">
            <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-3">{t('downloadApp')}</h4>
            <div className="flex flex-row items-center justify-center gap-2">
              <a
                href="https://concrete.fimtosoft.com/downloads/fimto-android.apk"
                download
                aria-label={t('downloadAndroid')}
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="white" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.523 15.3414C17.523 15.8643 17.1001 16.2872 16.5772 16.2872H7.42284C6.9 16.2872 6.47705 15.8643 6.47705 15.3414V11.2385H17.523V15.3414ZM16.5772 6.18342H14.9392L16.0354 4.19539C16.1492 3.98902 16.0744 3.73024 15.8681 3.61639C15.6617 3.50254 15.4029 3.57732 15.2891 3.78369L14.0768 5.98188C13.4338 5.70014 12.7304 5.54581 12 5.54581C11.2696 5.54581 10.5662 5.70014 9.92323 5.98188L8.71092 3.78369C8.59708 3.57732 8.3383 3.50254 8.13192 3.61639C7.92555 3.73024 7.85077 3.98902 7.96462 4.19539L9.0608 6.18342H7.42284C5.7275 6.18342 4.33145 7.49852 4.17514 9.15545H19.8249C19.6686 7.49852 18.2725 6.18342 17.523 6.18342ZM9.5042 8.16335C9.17411 8.16335 8.9065 7.89574 8.9065 7.56565C8.9065 7.23555 9.17411 6.96794 9.5042 6.96794C9.8343 6.96794 10.1019 7.23555 10.1019 7.56565C10.1019 7.89574 9.8343 8.16335 9.5042 8.16335ZM14.4958 8.16335C14.1657 8.16335 13.8981 7.89574 13.8981 7.56565C13.8981 7.23555 14.1657 6.96794 14.4958 6.96794C14.8259 6.96794 15.0935 7.23555 15.0935 7.56565C15.0935 7.89574 14.8259 8.16335 14.4958 8.16335ZM4.11304 10.2185V10.2285H19.887V10.2185H4.11304ZM17.523 16.9216C17.523 17.8427 16.7762 18.5894 15.8552 18.5894H8.14481C7.22384 18.5894 6.47705 17.8427 6.47705 16.9216V16.9016H17.523V16.9216Z"/>
                </svg>
              </a>
              <a
                href="https://apps.apple.com/app/fimto-concrete-erp"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('downloadIOS')}
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="white" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.48C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.14 6.9 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.1 16.67C20.08 16.74 19.67 18.11 18.71 19.5ZM15.97 4.17C16.63 3.37 17.07 2.28 16.95 1C16 1.04 14.9 1.6 14.24 2.38C13.68 3.04 13.19 4.14 13.34 5.39C14.39 5.47 15.4 4.88 15.97 4.17Z"/>
                </svg>
              </a>
              <a
                href="https://concrete.fimtosoft.com/downloads/fimto-concrete-setup.exe"
                download
                aria-label="Download Windows desktop app"
                title="نسخة الكمبيوتر — Windows"
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white text-xl"
              >
                🪟
              </a>
              <a
                href="https://concrete.fimtosoft.com/downloads/fimto-concrete.AppImage"
                download
                aria-label="Download Linux desktop app"
                title="نسخة الكمبيوتر — Linux"
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white text-xl"
              >
                🐧
              </a>
            </div>
            <p className="text-center text-[10px] text-slate-500 mt-2">
              v1.3.0 • R&D 🧠 • HR 💬 • Portal 🔗 • ZATCA 🧾
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 mt-4 pt-3 border-t border-white/10 text-center text-[10px] text-slate-500">
        © {new Date().getFullYear()} Fimto Soft — {t('integratedTechSolutions')}. {t('allRightsReserved')}
      </div>
    </footer>
  );
}