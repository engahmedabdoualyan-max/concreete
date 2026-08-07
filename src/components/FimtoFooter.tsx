import fimtoLogo from '../assets/logos/fimtosoftlogo.png';

const QUICK_LINKS = ['Home', 'About', 'Services', 'Contact'];

export default function FimtoFooter() {
  return (
    <footer className="w-full bg-[#0b1220] border-t border-[#334155] py-12">
      <div className="max-w-[1100px] mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-3">
            <img
              src={fimtoLogo}
              alt="Fimto Soft logo"
              className="h-12 w-12 rounded-xl object-contain bg-white p-1 shadow-lg"
            />
            <div>
              <h3 className="text-white font-extrabold text-xl tracking-tight">Fimto Soft</h3>
              <p className="text-emerald-500 text-sm font-semibold mt-0.5">Integrated Tech Solutions</p>
            </div>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed mt-4">
            We provide comprehensive software solutions including advanced interactive ERP systems, maintenance and
            development of ready-mix concrete plants, web design and development, distinguished digital marketing,
            creation and development of security and surveillance systems, establishment and development of
            infrastructure networks, creation and development of AI applications, and establishment and development
            of smart home systems.
          </p>
        </div>

        <div>
          <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">Quick Links</h4>
          <ul className="space-y-2 text-sm">
            {QUICK_LINKS.map(l => (
              <li key={l}>
                <span className="text-slate-400 hover:text-emerald-500 cursor-pointer transition-colors">▸ {l}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">Contact</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>
              ✉️{' '}
              <a href="mailto:info@fimtosoft.com" className="hover:text-emerald-500 transition-colors">
                info@fimtosoft.com
              </a>
            </li>
            <li>
              📞 <b className="text-slate-300">EG:</b>{' '}
              <a href="tel:01001006627" className="hover:text-emerald-500 transition-colors">
                01001006627
              </a>
            </li>
            <li>
              📞 <b className="text-slate-300">KSA:</b>{' '}
              <a href="tel:0500439617" className="hover:text-emerald-500 transition-colors">
                0500439617
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">Our Locations</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>
              <span className="inline-block w-6 text-center" title="Egypt">🇪🇬</span> Cairo, Egypt
            </li>
            <li>
              <span className="inline-block w-6 text-center" title="Saudi Arabia">🇸🇦</span> Riyadh, Saudi Arabia
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 mt-10 pt-6 border-t border-white/10 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Fimto Soft — Integrated Tech Solutions. All rights reserved.
      </div>
    </footer>
  );
}
