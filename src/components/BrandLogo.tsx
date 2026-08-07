import siteLogo from '../assets/logos/logo.png';

const LOGO_ASPECT = 240 / 175;

export default function BrandLogo({ size = 40, width, height, rounded = 'rounded-lg', fill = false }: {
  size?: number;
  width?: number;
  height?: number;
  rounded?: string;
  fill?: boolean;
}) {
  const w = width ?? size;
  const h = height ?? (fill ? w / LOGO_ASPECT : size);
  return (
    <div
      className={`${rounded} flex items-center justify-center overflow-hidden shadow-lg border border-slate-500/40 bg-white shrink-0`}
      style={{ width: w, height: h }}
    >
      <img src={siteLogo} alt="Site logo" className="w-full h-full object-contain" />
    </div>
  );
}
