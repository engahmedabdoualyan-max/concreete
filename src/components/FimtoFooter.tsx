import fimtoLogo from '../assets/logos/fimtosoftlogo.png';
import { useLang } from '../context/LangContext';
import type { Translations } from '../context/translations';

const QUICK_LINKS: { key: keyof Translations; href?: string }[] = [
  { key: 'home', href: 'https://concrete.fimtosoft.com/' },
  { key: 'about' },
  { key: 'services' },
  { key: 'contact' },
];

export default function FimtoFooter() {
  const { t } = useLang();
  return (
    <footer className="w-full bg-[#0B111E]/80 border-t border-white/10 py-12">
      <div className="max-w-[1100px] mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-3">
            <img
              src={fimtoLogo}
              alt={t('fimtoLogoAlt')}
              className="h-12 w-12 rounded-xl object-contain bg-white p-1 shadow-lg"
            />
            <div>
              <h3 className="text-white font-extrabold text-xl tracking-tight">Fimto Soft</h3>
              <p className="text-emerald-500 text-sm font-semibold mt-0.5">{t('integratedTechSolutions')}</p>
            </div>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed mt-4">
            {t('footerDescription')}
          </p>
        </div>

        <div>
          <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">{t('quickLinks')}</h4>
          <ul className="space-y-2 text-sm">
            {QUICK_LINKS.map(l => (
              <li key={l.key}>
                {l.href ? (
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-sky-400 cursor-pointer transition-colors"
                  >
                    ▸ {t(l.key)}
                  </a>
                ) : (
                  <span className="text-slate-400 hover:text-sky-400 cursor-pointer transition-colors">▸ {t(l.key)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">{t('contact')}</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>
              ✉️{' '}
              <a href="mailto:info@fimtosoft.com" className="hover:text-sky-400 transition-colors">
                info@fimtosoft.com
              </a>
            </li>
            <li>
              📞 <b className="text-slate-300">EG:</b>{' '}
              <a href="tel:01001006627" className="hover:text-sky-400 transition-colors">
                01001006627
              </a>
            </li>
            <li>
              📞 <b className="text-slate-300">KSA:</b>{' '}
              <a href="tel:0500439617" className="hover:text-sky-400 transition-colors">
                0500439617
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">{t('ourLocations')}</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>
              <span className="inline-block w-6 text-center" title={t('egypt')}>🇪🇬</span> {t('cairo')}, {t('egypt')}
            </li>
            <li>
              <span className="inline-block w-6 text-center" title={t('saudiArabia')}>🇸🇦</span> {t('riyadh')}, {t('saudiArabia')}
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 mt-10 pt-6 border-t border-white/10 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Fimto Soft — {t('integratedTechSolutions')}. {t('allRightsReserved')}
      </div>
    </footer>
  );
}
