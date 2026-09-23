import siteLogo from '../assets/logos/logo.png';
import { useLang } from '../context/LangContext';

const LOGO_ASPECT = 1040 / 1024;
const HOME_URL = 'https://concrete.fimtosoft.com/';

export default function BrandLogo({ size = 40, width, height, rounded = 'rounded-lg', fill = true }: {
  size?: number;
  width?: number;
  height?: number;
  rounded?: string;
  fill?: boolean;
}) {
  const { t } = useLang();
  const w = width ?? size;
  const h = height ?? (fill ? w / LOGO_ASPECT : size);
  return (
    <a
      href={HOME_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="concrete.fimtosoft.com"
      className={`${rounded} flex items-center justify-center overflow-hidden shadow-lg border border-white/20 bg-white shrink-0 hover:scale-105 transition-transform cursor-pointer`}
      style={{ width: w, height: h }}
    >
      <img src={(siteLogo as unknown as { src?: string }).src || String(siteLogo as unknown as string)} alt={t('siteLogoAlt')} className="w-full h-full object-contain" />
    </a>
  );
}
