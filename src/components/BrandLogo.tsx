import siteLogo from '../assets/logos/logo.png';

export default function BrandLogo({ size = 40, rounded = 'rounded-lg' }: { size?: number; rounded?: string }) {
  return (
    <div
      className={`${rounded} flex items-center justify-center overflow-hidden shadow-lg border border-slate-500/40 bg-white shrink-0`}
      style={{ width: size, height: size }}
    >
      <img src={siteLogo} alt="Site logo" className="w-full h-full object-contain" />
    </div>
  );
}
