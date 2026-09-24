/**
 * Official User Guide — ENGLISH edition (mirrors the Arabic manual 1:1).
 * Generated client-side via html-to-image + jsPDF for pixel-perfect rendering.
 */
import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import html2canvas from 'html2canvas';
import logoUrl from '../assets/logos/logo.png';

const INK = '#0b111e';
const SKY = '#0284c7';
const CYAN = '#06b6d4';
const SLATE = '#334155';
const LIGHT = '#f1f5f9';
const BORDER = '#e2e8f0';

type Feature = { n: string; d: string };
type Section = { no: string; icon: string; title: string; features: Feature[] };

const S = (no: string, icon: string, title: string, features: [string, string][]): Section => ({
  no, icon, title,
  features: features.map(([n, d]) => ({ n, d })),
});

const SECTIONS: Section[] = [
  S('1', '🏗️', 'What is the Fimto Concrete System?', [
    ['One integrated platform', 'A single system running ready-mix and block plants end-to-end: orders, operations, production, quality, workshop and finance — on web, mobile app and customer portal with real-time sync.'],
    ['Runs in the browser', 'No installation, no local server. Open concrete.fimtosoft.com from any device and sign in.'],
    ['Granular role permissions', '16+ roles (owner, manager, accountant, operator, lab, workshop, driver, sales rep…) — each user only sees the modules you enable.'],
    ['Peripheral-device philosophy', 'Everything works without any hardware. Batch controllers, cameras, GPS trackers and accounting sync are optional plug-ins that activate instantly when connected.'],
    ['Your data stays protected', 'SHA-256 hashed passwords, server-issued OTP codes and locked database rules — only your own apps can read your data.'],
  ]),
  S('2', '🚀', 'Quick Start', [
    ['Create your company account', 'From the login screen choose “Register” and enter username, password, country/city, plant name, phone and email — then activate with the code emailed to you.'],
    ['Sign in', 'Log in with username and password; your session is stored securely (never the password) until you sign out on that device.'],
    ['Guest mode', 'Use “Guest login” to explore instantly with limited permissions — no account needed.'],
    ['Switch language', 'The language button on every page flips the interface between Arabic and English instantly.'],
    ['Quick Jump', 'The “Quick Jump” menu at the top of every page takes you to any module your role allows in one click.'],
    ['Post-login KPI strip', 'Right after login see live counters: active orders, completed today, total shipments and your plant name.'],
  ]),
  S('3', '📦', 'Orders', [
    ['Full order form', 'Customer (saved or new), project & location, order type (concrete/blocks), mix design, slump, quantity, sales rep and customer email for notifications.'],
    ['Customers manager', 'Complete customer registry with codes, price agreements and credit status; freeze a debtor and scheduling their orders is blocked until released.'],
    ['Status filter', 'All / Pending / Scheduled / Completed tabs filter the list instantly.'],
    ['Finance approval', 'Accountant approves or rejects; approver name and server timestamp are recorded tamper-proof.'],
    ['Safe scheduling', '“Schedule” appears after approval; automatically blocked for credit-frozen customers.'],
    ['Complete the order', '“Done” marks delivery and unlocks post-delivery tools.'],
    ['🧾 E-Invoice', 'Every completed order gets a professional invoice with number, date, items — print or save as PDF.'],
    ['⭐ Daily evaluation', 'Rate every pour: plant, truck, labor crew (1–5 stars each) plus notes; total out of 15 shows on the badge and feeds performance reports.'],
    ['Automatic notifications', 'On every status change the customer gets an email plus a pre-filled WhatsApp message the staff can send in one tap.'],
    ['Tamper-proof audit', 'Created/approved/updated times are stamped by Firestore servers — users cannot forge them.'],
  ]),
  S('4', '🚚', 'Operations & Trips', [
    ['Add a trip', 'Full form: date, mixer, driver, project, quantity, mix design and GPS site coordinates.'],
    ['Import scheduled orders', 'One click turns today’s scheduled orders into ready trips.'],
    ['Five stage timestamps', 'Plant departure, site arrival, pour start/end, return — cycle time computed automatically.'],
    ['GPS distances', 'Enter site coordinates and Haversine distance from the plant is calculated into trip data.'],
    ['Delay reasons log', 'Ready-made reasons (site readiness, breakdown, emergency…) plus free notes.'],
    ['Pump tracking', 'Pump departure/arrival/pour start times with consecutive-quantity totals per site/day.'],
    ['Digital delivery note 🧾', 'Per-trip digital delivery note (Digital Challan) with number and QR verification, printable in official layout.'],
    ['✍️ Recipient signature', 'Signature pad on the tablet inside the delivery note — the customer signs with a finger and it is stored with the record.'],
    ['💧 Water-addition log', 'Document any water added in transit: liters, time and reason — printed on the delivery note.'],
    ['📡 Driver live broadcast', 'With the Android app the driver streams position live into the operations map.'],
    ['Trip log & reports', 'Filter by date range, detailed view, Excel export and official printout.'],
  ]),
  S('5', '🏭', 'Production & Inventory', [
    ['Live silo visuals', 'Four tanks (cement, sand, gravel, admixture) with animated fill levels, percentages and low alerts under 25%.'],
    ['Record material deliveries', 'Add incoming quantities by type and invoice — stock updates instantly into the delivery log.'],
    ['Execute manual batch', 'Pick recipe and volume, optionally link an order; materials deduct automatically, delivered quantities update, and the order auto-completes.'],
    ['🧱 Block production', 'Choose block type and quantity; cement/sand deduct by recipe rates and finished stock increases.'],
    ['🧪 Chemical additives', 'Full CRUD: dosage per m³, current stock, minimum level (turns red), supplier and cost — saved to the cloud.'],
    ['📊 Stock vs Orders', 'Instant compare of available vs confirmed demand: shortages in red or “all sufficient” in green.'],
    ['Reconciliation logs', 'Recent deliveries, batches and block runs with date filters.'],
    ['Export & print', 'Excel CSV export of batches plus a print-ready report.'],
  ]),
  S('6', '🕒', 'Scheduling', [
    ['Manual or automatic mode', 'Switch between hand-ordering pours or letting the system propose distribution.'],
    ['Import from orders', 'Pull approved orders into the schedule by priority.'],
    ['Interactive map', 'Pour locations on a Leaflet map with address search and manual pinning.'],
    ['Route planning', 'Estimated distance/time from plant to each site to sequence trucks smartly.'],
  ]),
  S('7', '🔧', 'Workshop', [
    ['Home — driver reports', 'Maintenance work orders arriving from the driver app (photo + audio + CRITICAL/HIGH/MEDIUM/LOW severity).'],
    ['Downtime duration tracker', 'Each open breakdown ages live: yellow alert at 12h, pulsing red at 24h with block counter.'],
    ['Fuel log', 'Refuels per vehicle: liters, price, odometer, station, invoice — feeding costs and reports.'],
    ['Oils & fluids', 'Changes by type, brand, quantity and next-change odometer.'],
    ['Spare parts', 'Part usage with numbers, suppliers, warranty and cost per vehicle.'],
    ['Breakdowns', 'Full registry: reporter, symptom, severity, assigned mechanic, repair start/end, description, parts and cost — editable.'],
    ['Warehouse', 'Items with min & safety stock; anything below minimum glows as an alert.'],
    ['Purchase requests', 'Smart requests auto-rejected if warehouse covers safety stock, with approval flow and priorities.'],
    ['Vehicle report', 'Pick a plate and date range: every trip, service and cost in one report.'],
    ['Mixing stations', 'Station registry (concrete/blocks/mixed) with operator, design vs actual capacity and status.'],
    ['Periodic maintenance', 'Scheduled tasks (belts, greasing, drum cleaning…) with next-due dates and Done/Scheduled/Overdue states.'],
    ['📍 Fleet map', 'Inside the workshop itself: live positions of tracked vehicles — activates automatically once GPS trackers are connected.'],
    ['Settings & reports', 'Maintenance budget plus fuel/breakdown reports per period.'],
  ]),
  S('8', '🎛️', 'Lab & Quality', [
    ['Mix recipes', 'Create/edit C25–C40 recipes with per-m³ components — they feed the batch execution list in Production.'],
    ['Scale calibration', 'Log calibrations with accreditation body/date and attach the certificate PDF.'],
    ['Smart mix designer', 'Enter target strength, slump and weather (temperature/humidity); it computes proportions and corrected water — “save as recipe” in one tap.'],
    ['QC records', 'Per sample: slump, 7 & 28-day breaks, ticket number, auto-linked to the customer order with a unique sample ID.'],
    ['Result filters', 'Date range and truck filters to track any mixer’s performance.'],
    ['🤖 AI strength predictor', 'From 7-day results predict 28-day strength with confidence band — adjust mixes before it’s too late.'],
  ]),
  S('9', '🛡️', 'Governance', [
    ['Weighbridge hash chain', 'Every weight slip is stamped with a SHA-256 fingerprint chained to the previous one — any later edit breaks the chain visibly (blockchain-style).'],
    ['Reading source', 'Manual entry, or automatic from the device once the weighbridge peripheral is connected.'],
    ['Mismatch detection', 'Weight vs ordered compared: matched ✅ / flagged mismatch ⚠️ for review / pending.'],
    ['Returned concrete', 'Log returns and disposition: recycle / convert to blocks (blocks computed from volume) / dispose.'],
    ['Waste KPIs', 'Instant ratios of recycled, converted and wasted volumes.'],
  ]),
  S('10', '💼', 'Finance & ERP', [
    ['Record payments', 'Client payment by method (mada/visa/cash/cheque) with paid/partial/pending status and notes.'],
    ['🔗 Payment QR', 'Generate QR + payment link per invoice to send the client, with gateway confirmation.'],
    ['📦 Auto reorder', 'Computes tomorrow’s coverage from stock plus open POs, proposes purchase orders for shortfalls and marks them delivered on arrival.'],
    ['🤖 AI demand forecast', '90-day analysis (weighted average + weekday seasonality + trend) predicting 7 or 30 days, with required materials, peak day and confidence.'],
    ['ERP overview', 'Full financial summary restricted to accountant/owner roles.'],
    ['ERP ledger', 'Any client’s movement: invoices, collections and running balance.'],
    ['ERP commitments & expenses', 'Track due obligations and record operating expenses by category.'],
    ['ERP suppliers', 'Supplier registry with balances and open purchase orders.'],
    ['🔗 Accounting sync (optional)', 'QuickBooks & Sage platforms: choose data types (invoices/payments/POs/expenses), sync manually or on schedule, export CSV or QBO files.'],
  ]),
  S('11', '🧪', 'R&D & Multi-Plant', [
    ['Research projects', 'Projects categorized (concrete/sustainability/automation/materials) with budget, team, timeline and results — cloud-saved.'],
    ['Innovation tracker', 'Ideas through idea → development → implemented, with impact rating.'],
    ['Training management', 'Courses by category (technical/safety/quality/management) with audience, duration and status.'],
    ['🏢 Multi-plant command center', 'Owner-only: unified dashboard across plants with consolidated vs per-plant cost views.'],
  ]),
  S('12', '📊', 'Evaluation & Performance', [
    ['Overall OEE', 'Composite index (Availability × Performance × Quality) for plant effectiveness.'],
    ['Station KPIs', 'Per mixing station: design vs actual capacity and utilization rate.'],
    ['Trip analytics', 'Delivery performance, cycle times and delays drawn from real operations data.'],
    ['Daily evaluation feed', 'Customers’ ⭐ ratings from Orders flow here to track satisfaction.'],
  ]),
  S('13', '⚙️', 'Admin Panel', [
    ['Overview', 'Plant summary: user/plant counts and headline KPIs.'],
    ['Factory data', 'Complete plant profile with sub-tabs: profile, fleet, stock, settings, GPS trackers — including plant logo.'],
    ['Users & roles', 'Manage all users: assign one of 16 roles and toggle module access per user.'],
    ['Sections', 'Live aggregates across each company’s databases (trips/QC/orders/payments…).'],
    ['🗺️ Fleet map', 'Global map of all tracked vehicles.'],
    ['📹 Dashcam', 'Truck camera list and status: simulated live feed, 1080p/720p/480p quality, loop recording, AI event detection (harsh braking/lane drift) and clip save/download.'],
    ['🔌 Peripheral devices hub', 'The heart of “hardware optional”: five devices (batch controller, cameras, accounting, GPS, weighbridge) each with connect/disconnect; state reflects instantly inside screens as “device connected / works without device”.'],
  ]),
  S('14', '👥', 'Customer Portal', [
    ['Secure OTP login', 'Customer enters phone or invoice number; a server-issued code arrives (valid 5 minutes, max 5 attempts, resend protection).'],
    ['Order tracking', 'Each order shows a progress bar (pending → approval → scheduled → executing → delivered) with expandable details.'],
    ['📍 Live tracking', 'During execution: map with truck position and ETA refreshing every 15 seconds plus route line from the plant.'],
    ['Invoices', 'Each invoice status (paid / partial / unpaid) and total outstanding.'],
    ['🏷️ Your plant branding', 'White-label: the portal header shows the serving plant’s own name and logo automatically.'],
    ['Quick search', 'Search orders and invoices by number, project or concrete grade.'],
  ]),
  S('15', '📱', 'Android App', [
    ['Driver screen', 'My trips with documented steps (depart/arrive/pour/return), signed digital delivery note (Digital Challan), live location broadcast and photo/audio breakdown reporting.'],
    ['Sales rep screen', 'Own clients and orders with follow-up.'],
    ['Lab & operator screens', 'Record tests and watch batches from mobile.'],
    ['Field management screens', 'Operations manager, workshop manager and reps manager (route tracking & task assignment).'],
    ['Owner monitoring', 'Compact plant KPIs from anywhere.'],
    ['Offline mode', 'Operations queue locally and sync automatically when connectivity returns.'],
    ['Download & install', 'concrete.fimtosoft.com/downloads/fimto-android.apk — install and allow unknown sources.'],
  ]),
  S('16', '🔌', 'Peripheral Devices (Optional)', [
    ['🏭 Batch controller', 'When connected (Command Alkon/Liebherr/Sicom/Simmons via OPC-UA/Modbus/REST/MQTT): live batch feed with material weights, recipe/production/calibration import and code mapping.'],
    ['📹 Camera system', 'When connected: watch truck feeds and save clips — before that the UI clearly runs in preview mode.'],
    ['🔗 Accounting software', 'Once QuickBooks/Sage connect: instant sync replaces manual export — CSV/QBO always available regardless.'],
    ['📡 GPS trackers', 'After connecting and setting asset coordinates: workshop map, fleet map and customer live-tracking switch on automatically.'],
    ['⚖️ Weighbridge', 'When linked: automatic weight-slip reading instead of manual entry — manual remains available forever.'],
    ['Golden rule', 'Disconnecting any device at any time breaks nothing — every screen keeps working and gracefully returns to manual mode.'],
  ]),
  S('17', '🔐', 'Security & Privacy', [
    ['Locked database', 'Zero reads or writes without a token from your own app — direct public access is fully closed.'],
    ['Password hashing', 'SHA-256 with one unified spec across web/server/mobile; any legacy password upgrades automatically at first login.'],
    ['Server-side OTP', 'Portal and console codes are generated and verified on the server (stored hashed, 5-minute TTL, attempt caps).'],
    ['Secret-free console', 'Control-panel credentials never exist in the shipped website code — fully server-side verification with a second factor.'],
    ['Clean sessions', 'Passwords are never persisted in the user’s browser storage.'],
  ]),
];

function el(html: string): HTMLDivElement {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild as HTMLDivElement;
}

const PAGE_W = 794, PAGE_H = 1123;

/* ─────────── Charts & diagrams ─────────── */
function visualFor(no: string): string {
  const cap = (t: string) => `<div style="font-size:11px;color:#64748b;font-weight:800;margin-bottom:6px">${t}</div>`;
  if (no === '3') {
    const steps = [['📝','Order'],['💰','Approval'],['🕒','Schedule'],['🚚','Execute'],['✅','Delivered']];
    return `<div style="margin-top:18px">${cap('Order lifecycle')}
      <div style="display:flex;gap:4px">
      ${steps.map(([ic,t],i)=>`<div style="flex:1;text-align:center">
        <div style="background:${INK};border-radius:12px;color:#fff;padding:11px 4px"><div style="font-size:19px">${ic}</div><div style="font-size:11px;font-weight:800;margin-top:3px">${t}</div></div>
        ${i<steps.length-1?'<div style="color:#94a3b8;font-size:15px;line-height:1.1">→</div>':'<div style="height:17px"></div>'}
      </div>`).join('')}</div></div>`;
  }
  if (no === '5') {
    const rows = [['Cement',85,'#38bdf8'],['Sand',62,'#fbbf24'],['Gravel',74,'#94a3b8'],['Admixture',41,'#22d3ee']];
    return `<div style="margin-top:18px">${cap('Live example: silo levels (%)')}
      <div style="background:#fff;border:1px solid ${BORDER};border-radius:12px;padding:12px 14px">
      ${rows.map(([n,v,c])=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="width:70px;font-size:11px;font-weight:800;color:${INK}">${n}</span>
        <div style="flex:1;height:14px;background:${LIGHT};border-radius:999px;overflow:hidden"><div style="width:${v}%;height:100%;background:${c};border-radius:999px"></div></div>
        <span style="width:36px;font-size:11px;font-weight:900;color:${INK}">${v}%</span>
      </div>`).join('')}</div></div>`;
  }
  if (no === '7') {
    const pts = '10,86 60,72 110,80 160,52 210,60 260,34 330,44';
    const dots = pts.split(' ').map(pt=>{const[x,y]=pt.split(',');return `<circle cx="${x}" cy="${y}" r="3.5" fill="#fff" stroke="#0ea5e9" stroke-width="2"/>`}).join('');
    return `<div style="margin-top:18px">${cap('Example: monthly maintenance cost trending down after adoption')}
      <svg viewBox="0 0 340 100" preserveAspectRatio="none" style="width:100%;height:106px;background:#fff;border:1px solid ${BORDER};border-radius:12px">
        <defs><linearGradient id="ge7" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38bdf8" stop-opacity=".45"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></linearGradient></defs>
        <polygon points="${pts} 330,100 10,100" fill="url(#ge7)"/>
        <polyline points="${pts}" fill="none" stroke="#0ea5e9" stroke-width="3" stroke-linecap="round"/>
        ${dots}
      </svg></div>`;
  }
  if (no === '8') {
    return `<div style="margin-top:18px">${cap('Strength curve: actual breaks + AI 28-day prediction')}
      <svg viewBox="0 0 340 110" preserveAspectRatio="none" style="width:100%;height:112px;background:#fff;border:1px solid ${BORDER};border-radius:12px">
        <rect x="150" y="18" width="180" height="52" rx="8" fill="#22c55e" opacity=".12"/>
        <polyline points="20,92 85,74 150,58" fill="none" stroke="#0284c7" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="150" y1="58" x2="320" y2="30" stroke="#16a34a" stroke-width="3.5" stroke-dasharray="7 6" stroke-linecap="round"/>
        <circle cx="20" cy="92" r="4" fill="#fff" stroke="#0284c7" stroke-width="2.5"/>
        <circle cx="85" cy="74" r="4" fill="#fff" stroke="#0284c7" stroke-width="2.5"/>
        <circle cx="150" cy="58" r="5" fill="#0284c7"/>
        <circle cx="320" cy="30" r="5.5" fill="#16a34a"/>
        <text x="24" y="106" font-size="10" fill="#64748b" font-weight="700">Day 3</text>
        <text x="88" y="66" font-size="10" fill="#64748b" font-weight="700">Day 7</text>
        <text x="186" y="16" font-size="11" fill="#15803d" font-weight="800">28-day prediction ≈ 42 MPa</text>
      </svg></div>`;
  }
  if (no === '10') {
    const bars: Array<[number, string]> = [[62,'Sat'],[78,'Sun'],[55,'Mon'],[92,'Tue'],[70,'Wed'],[84,'Thu']];
    const bw = 34, gap = 14, base = 92, x0 = 18;
    return `<div style="margin-top:18px">${cap('Weekly demand forecast (m³/day) — peak day: Tuesday')}
      <svg viewBox="0 0 340 110" preserveAspectRatio="none" style="width:100%;height:112px;background:#fff;border:1px solid ${BORDER};border-radius:12px">
        ${bars.map(([v,l],i)=>`<rect x="${x0+i*(bw+gap)}" y="${base-v*0.82}" width="${bw}" height="${v*0.82}" rx="6" fill="${v===92?'#16a34a':'#0ea5e9'}" opacity="${v===92?1:.85}"/>
        <text x="${x0+i*(bw+gap)+bw/2}" y="${base-v*0.82-6}" font-size="10.5" font-weight="800" fill="${INK}" text-anchor="middle"><tspan>${Math.round(v*1.6)}</tspan></text>
        <text x="${x0+i*(bw+gap)+bw/2}" y="${base+16}" font-size="10" fill="#64748b" font-weight="700" text-anchor="middle">${l}</text>`).join('')}
        <line x1="10" y1="${base}" x2="330" y2="${base}" stroke="#cbd5e1" stroke-width="2"/>
      </svg></div>`;
  }
  if (no === '12') {
    const R = 70, CX = 170, CY = 96, CIRC = Math.PI * R;
    return `<div style="margin-top:18px">${cap('Example: overall OEE gauge')}
      <div style="display:flex;gap:14px;align-items:center;background:#fff;border:1px solid ${BORDER};border-radius:12px;padding:12px 16px">
        <svg viewBox="0 0 340 120" style="width:220px;height:78px">
          <path d="M ${CX-R} ${CY} A ${R} ${R} 0 0 1 ${CX+R} ${CY}" fill="none" stroke="${LIGHT}" stroke-width="16" stroke-linecap="round"/>
          <path d="M ${CX-R} ${CY} A ${R} ${R} 0 0 1 ${CX+R} ${CY}" fill="none" stroke="#22c55e" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(CIRC*0.78).toFixed(1)} ${CIRC.toFixed(1)}"/>
          <text x="${CX}" y="${CY-14}" font-size="26" font-weight="900" fill="${INK}" text-anchor="middle"><tspan>78%</tspan></text>
        </svg>
        <div style="font-size:11px;color:${SLATE};line-height:2;font-weight:600">
          Availability 92% × Performance 89% × Quality 95%<br/>
          <span style="color:#16a34a;font-weight:800">Excellent — above the 75% target</span>
        </div>
      </div></div>`;
  }
  if (no === '13') {
    const devs = [['🏭','Batch ctrl'],['📹','Cameras'],['🔗','Accounting'],['📡','GPS'],['⚖️','Weighbridge']];
    return `<div style="margin-top:18px;border:2px dashed #164e63;border-radius:14px;padding:13px;text-align:center">
      <div style="font-size:11.5px;color:#7dd3fc;font-weight:800;margin-bottom:9px">Peripheral devices hub — optional connections; the system runs without them</div>
      <div style="display:flex;gap:6px;justify-content:center">${devs.map(([ic,t])=>`
        <div style="background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;min-width:68px">
          <div style="font-size:18px">${ic}</div><div style="font-size:10px;font-weight:800;color:${INK}">${t}</div>
          <div style="font-size:9px;color:#16a34a;font-weight:700">Optional</div>
        </div>`).join('')}</div>
    </div>`;
  }
  if (no === '15') {
    const roles = [['🚚','Driver'],['💼','Sales rep'],['🧪','Lab'],['🎛️','Operator'],['🔧','Workshop'],['📊','Owner']];
    return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px">
      ${roles.map(([ic,t])=>`<div style="background:${INK};color:#fff;border-radius:10px;padding:10px;text-align:center"><div style="font-size:18px">${ic}</div><div style="font-size:11px;font-weight:800;margin-top:3px">${t}</div></div>`).join('')}
    </div>`;
  }
  return '';
}

function headerBar(sec: Section, cont: boolean) {
  const label = cont ? `Section ${sec.no} — continued` : `Section ${sec.no}`;
  return `
    <div style="display:flex;align-items:center;gap:14px;background:linear-gradient(90deg,#0b111e,#0e3a5c);color:#fff;padding:20px 28px;border-radius:16px;">
      <div style="font-size:32px">${sec.icon}</div>
      <div>
        <div style="font-size:12px;color:#7dd3fc;font-weight:800;letter-spacing:.5px">${label}</div>
        <div style="font-size:24px;font-weight:900;line-height:1.4">${sec.title}</div>
      </div>
      <div style="margin-left:auto;font-size:11px;color:#94a3b8;font-weight:700">FIMTO CONCRETE ERP</div>
    </div>`;
}

function featureEl(f: Feature, idx: number): HTMLElement {
  return el(`
    <li style="list-style:none;background:#fff;border:1px solid ${BORDER};border-radius:12px;padding:13px 16px;margin-bottom:10px;box-shadow:0 1px 2px rgba(2,8,23,.04)">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <span style="flex-shrink:0;width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,${SKY},${CYAN});color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:12px">${idx}</span>
        <strong style="color:${INK};font-size:15px;line-height:1.55">${f.n}</strong>
      </div>
      <p style="margin:7px 4px 0 36px;color:${SLATE};font-size:13.5px;line-height:1.9">${f.d}</p>
    </li>`);
}

function newContentPage(sec: Section, cont: boolean) {
  const page = el(`
    <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(180deg,#f8fafc 0%,#fff 30%);box-sizing:border-box;padding:48px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:ltr;overflow:hidden;">
      ${headerBar(sec, cont)}
    </div>`);
  const cnt = el(`<div style="margin-top:20px"></div>`);
  page.appendChild(cnt);
  return { page, cnt };
}

function buildCover(): HTMLElement {
  return el(`
    <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(200deg,#080c14 0%,#0b111e 55%,#0d2136 100%);color:#fff;box-sizing:border-box;padding:70px 60px;display:flex;flex-direction:column;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:ltr;">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px;color:#38bdf8;font-weight:800;border:1px solid #155e75;border-radius:999px;padding:6px 14px">FIMTO SOFT</div>
        <div style="font-size:12px;color:#64748b">v3.0 · ${new Date().toLocaleDateString('en-GB')}</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center">
        <img src="${logoUrl}" alt="Fimto" style="width:150px;height:148px;object-fit:contain;margin:0 auto 22px;display:block;border-radius:24px;background:#fff;padding:8px"/>
        <h1 style="font-size:48px;margin:0;font-weight:900;line-height:1.35">The Complete<br/><span style="color:#38bdf8;text-shadow:0 0 26px rgba(56,189,248,.45)">User Guide</span></h1>
        <p style="color:#94a3b8;font-size:17px;margin-top:18px;line-height:1.9">Every feature explained in detail<br/>Web · Android App · Customer Portal · Peripheral Devices · Security</p>
        <div style="margin-top:28px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          ${['📦 Orders','🚚 Operations','🏭 Production','🔧 Workshop','🎛️ Quality','💼 Finance','👥 Clients','📱 Mobile'].map(x =>
            `<span style="background:rgba(56,189,248,.08);border:1px solid #164e63;color:#7dd3fc;font-size:13px;font-weight:700;padding:8px 14px;border-radius:10px">${x}</span>`).join('')}
        </div>
      </div>
      <div style="text-align:center;color:#475569;font-size:12px">concrete.fimtosoft.com — Designed by Dr. Ahmad Abdo Alyan</div>
    </div>`);
}

/* ── Owner pitch pages ── */
function buildLetter1(): HTMLElement {
  const pains = [
    ['🧱', 'Vanishing raw materials', 'No precise accounting: material goes in, output comes out lower… where did the difference go?'],
    ['🚚', 'Uncounted cycles', 'Did that mixer run 8 loads today — or 6? The gap is pure daily loss.'],
    ['⛽', 'Off-the-books fuel', 'Logged liters never match kilometers — and nobody asks.'],
    ['⏰', 'Late pours', 'Waiting clients and angry contractors = penalties and a fading reputation.'],
  ];
  return el(`
    <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(165deg,#080c14,#0b111e 60%,#132a44);color:#fff;box-sizing:border-box;padding:56px 58px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:ltr;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:13px;color:#38bdf8;font-weight:800;border:1px solid #155e75;border-radius:999px;padding:5px 13px">Why Fimto</div>
        <div style="font-size:11px;color:#64748b;margin-left:auto">FIMTO CONCRETE ERP</div>
      </div>
      <h1 style="font-size:34px;font-weight:900;margin:26px 0 0;line-height:1.35">📩 You don’t need another<br/><span style="color:#38bdf8">“monitoring software”</span></h1>
      <p style="color:#cbd5e1;font-size:16px;line-height:1.95;margin-top:14px">
        You need <strong style="color:#fff">eyes that see</strong> and <strong style="color:#fff">numbers that decide</strong>.
        Traditional systems tell you what happened yesterday. <strong style="color:#38bdf8">Fimto reveals the leak as it happens, explains why, and hands you the fix.</strong>
      </p>
      <div style="font-size:13px;font-weight:900;color:#fca5a5;margin:22px 0 10px">🔥 Four silent leaks eating your profit monthly:</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${pains.map(([ic,t,d])=>`
        <div style="background:#fff;border-radius:14px;padding:14px 16px;border-left:4px solid #ef4444">
          <div style="display:flex;align-items:center;gap:8px"><span style="font-size:19px">${ic}</span><strong style="color:${INK};font-size:14.5px">${t}</strong></div>
          <p style="margin:7px 0 0;color:${SLATE};font-size:12.5px;line-height:1.8">${d}</p>
        </div>`).join('')}
      </div>
      <div style="margin-top:auto;background:linear-gradient(90deg,rgba(56,189,248,.12),rgba(34,211,238,.05));border:1px solid #164e63;border-radius:16px;padding:18px 22px">
        <div style="font-size:15px;font-weight:900;color:#7dd3fc">👁️ Imagine seeing all of this from your phone right now:</div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          ${['📦 Silos in real time','🚚 Every truck & task','💰 Every riyal in/out','⭐ Client rating per pour','🔧 Breakdowns before downtime'].map(x=>`<span style="background:rgba(56,189,248,.08);border:1px solid #164e63;color:#bae6fd;font-size:12px;font-weight:700;padding:7px 12px;border-radius:9px">${x}</span>`).join('')}
        </div>
        <div style="color:#94a3b8;font-size:12px;margin-top:11px">Not just monitoring — <strong style="color:#fff">a live X-ray of your plant, with the solution ready beside every problem.</strong></div>
      </div>
    </div>`);
}

function buildLetter2(): HTMLElement {
  const rows = [
    ['Traditional logging systems', 'Archive what happened… after the loss is gone', 'Detects deviation the moment it starts — and seals its cause'],
    ['Accounting packages', 'Tidy papers at month-end', 'Instant decisions on live numbers: silo, cycle, collection'],
    ['Global GPS trackers', 'Costly “where is it” only', 'GPS + quality + maintenance + finance + clients… one dashboard'],
  ];
  const save = [['🧱','Raw-material waste','-5↔10%'],['⛽','Untracked fuel','-15%'],['🕒','Failed pours','≈ zero'],['🔧','Emergency repairs','scheduled instead']];
  return el(`
    <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(200deg,#0d2136,#080c14);color:#fff;box-sizing:border-box;padding:56px 58px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:ltr;display:flex;flex-direction:column;">
      <h2 style="font-size:30px;font-weight:900;margin:0">⚖️ How we compare to any other software</h2>
      <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px">
        ${rows.map(([a,b,c])=>`
        <div style="display:grid;grid-template-columns:170px 1fr 1.15fr;border-radius:14px;overflow:hidden;border:1px solid #1e3a5f">
          <div style="background:#132a44;padding:13px 14px;font-weight:800;font-size:12.5px;color:#93c5fd">${a}</div>
          <div style="background:rgba(255,255,255,.04);padding:13px 14px;font-size:12.5px;color:#f1a8a8;line-height:1.75">${b}</div>
          <div style="background:rgba(34,197,94,.09);padding:13px 14px;font-size:12.5px;color:#bbf7d0;line-height:1.75"><strong style="color:#4ade80">Fimto:</strong> ${c}</div>
        </div>`).join('')}
      </div>
      <h2 style="font-size:26px;font-weight:900;margin:26px 0 4px">💰 Where you’ll save — field-realistic estimates</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px">
        ${save.map(([ic,t,v])=>`
        <div style="background:#fff;border-radius:14px;padding:13px 10px;text-align:center">
          <div style="font-size:21px">${ic}</div>
          <div style="color:${INK};font-weight:800;font-size:11.5px;margin-top:5px">${t}</div>
          <div style="color:#16a34a;font-weight:900;font-size:17px;margin-top:3px">${v}</div>
        </div>`).join('')}
      </div>
      <p style="color:#94a3b8;font-size:12.5px;line-height:1.8;margin-top:10px">* Typical recovery ranges within the first 3 months of consistent use — the biggest saving: <strong style="color:#e2e8f0">right decisions at the right time</strong>.</p>
      <div style="margin-top:auto;text-align:center;background:linear-gradient(135deg,#0369a1,#0e7490);border-radius:18px;padding:20px 24px">
        <div style="font-size:17px;font-weight:900">🎯 Simple choice: keep managing paperwork… or let the numbers speak</div>
        <div style="font-size:13px;color:#cffafe;margin-top:8px">Open the system now — your very first order will prove the difference</div>
        <div style="font-size:13px;color:#fff;font-weight:800;margin-top:9px">concrete.fimtosoft.com</div>
      </div>
    </div>`);
}

function buildBack(): HTMLElement {
  return el(`
    <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(200deg,#080c14,#0d2136);color:#fff;box-sizing:border-box;padding:80px 60px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:ltr;">
      <div style="font-size:54px;margin-bottom:20px">💪</div>
      <h2 style="font-size:34px;font-weight:900;margin:0">Time to decide</h2>
      <p style="color:#94a3b8;font-size:16px;line-height:1.9;margin-top:14px">Open the system now and keep this guide handy.<br/>Every button explains itself — this guide is here for the details.</p>
      <div style="margin-top:34px;background:rgba(56,189,248,.08);border:1px solid #164e63;border-radius:14px;padding:20px 30px;font-size:14px;color:#7dd3fc;line-height:2.2">
        concrete.fimtosoft.com<br/>downloads/fimto-android.apk<br/>concrete.fimtosoft.com/#/portal
      </div>
      <div style="margin-top:40px;color:#475569;font-size:12px">© Fimto Soft — All rights reserved</div>
    </div>`);
}

/** Generate the English guide PDF. */
export async function generateManualPdfEn(onProgress?: (done: number, total: number) => void): Promise<number> {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
  document.body.appendChild(holder);

  try {
    const contentPages: HTMLElement[] = [];
    const startPage: Record<string, number> = {};
    let pageNo = 5; // 1 cover, 2-3 letters, 4 TOC

    for (const sec of SECTIONS) {
      startPage[sec.no] = pageNo;
      let idx = 0;
      let { page, cnt } = newContentPage(sec, false);
      const vis = visualFor(sec.no);
      if (vis) cnt.appendChild(el(vis));

      for (const f of sec.features) {
        idx++;
        const li = featureEl(f, idx);
        cnt.appendChild(li);
        const headerH = (page.firstElementChild as HTMLElement).offsetHeight;
        if (cnt.scrollHeight > PAGE_H - 48 * 2 - headerH - 20) {
          cnt.removeChild(li);
          contentPages.push(page);
          pageNo++;
          ({ page, cnt } = newContentPage(sec, true));
          cnt.appendChild(li);
        }
      }
      contentPages.push(page);
      pageNo++;
    }

    const tocRows = SECTIONS.map(s => `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid ${BORDER};width:52px"><span style="display:inline-flex;width:28px;height:28px;border-radius:8px;background:${INK};color:#fff;align-items:center;justify-content:center;font-weight:800;font-size:12px">${s.no}</span></td>
        <td style="padding:8px 6px;border-bottom:1px solid ${BORDER};font-weight:800;color:${INK};font-size:14px">${s.icon} ${s.title}</td>
        <td style="padding:8px 6px;border-bottom:1px solid ${BORDER};color:${SKY};font-size:12.5px;font-weight:700;white-space:nowrap">p. ${startPage[s.no]}</td>
      </tr>`).join('');
    const toc = el(`
      <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:#fff;box-sizing:border-box;padding:55px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:ltr;">
        <div style="border-radius:16px;background:${LIGHT};border:1px solid ${BORDER};padding:24px 28px;margin-bottom:22px">
          <div style="font-size:13px;color:${SKY};font-weight:800">CONTENTS</div>
          <div style="font-size:30px;font-weight:900;color:${INK}">📖 Table of Contents</div>
        </div>
        <table style="width:100%;border-collapse:collapse">${tocRows}</table>
        <div style="margin-top:24px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:14px 18px;color:#0369a1;font-size:12.5px;line-height:1.8">
          💡 ${SECTIONS.length} sections covering ${SECTIONS.reduce((a, s) => a + s.features.length, 0)}+ features — each explained with its name and how to use it, with charts inside key sections.
        </div>
      </div>`);

    holder.appendChild(buildCover());
    holder.appendChild(buildLetter1());
    holder.appendChild(buildLetter2());
    holder.appendChild(toc);
    contentPages.forEach(pg => holder.appendChild(pg));
    holder.appendChild(buildBack());

    const pages = Array.from(holder.children) as HTMLElement[];
    const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait', compress: true });
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      let canvas: HTMLCanvasElement;
      try {
        canvas = await toCanvas(pages[i], { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
      } catch {
        canvas = await html2canvas(pages[i], { scale: 1.6, backgroundColor: '#ffffff', logging: false, useCORS: true });
      }
      const img = canvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage([PAGE_W, PAGE_H], 'portrait');
      pdf.addImage(img, 'JPEG', 0, 0, PAGE_W, PAGE_H);
    }
    onProgress?.(pages.length, pages.length);
    pdf.save(`Fimto-ERP-Manual-EN-${new Date().toISOString().slice(0, 10)}.pdf`);
    return pages.length;
  } finally {
    holder.remove();
  }
}
