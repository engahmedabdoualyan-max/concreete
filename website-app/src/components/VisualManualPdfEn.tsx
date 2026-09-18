/**
 * Visual manual — ENGLISH edition (mirrors the Arabic visual manual 1:1).
 * Real app screenshots in phone/browser frames + mind maps, flow charts and
 * algorithms, rendered into a PDF that matches the site's selected language.
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
const PAGE_W = 794;
const PAGE_H = 1123;

type FrameKind = 'phone' | 'browser';
type Shot = { src: string; cap: string; frame?: FrameKind };
type VSec = {
  no: string;
  icon: string;
  title: string;
  intro: string;
  diagram?: string;
  extraAlgo?: string;
  extraChain?: string;
  shots: Shot[];
  bullets: string[];
};

const IM = (n: string) => '/manual-images/' + n;

/* ═══ Diagram builders (language-neutral markup) ═══ */

function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstChild as HTMLElement;
}

function mindMap(cen: string, parts: { t: string; c: string }[], w = 698, h = 360): string {
  const cx = w / 2;
  const cy = h / 2 + 6;
  const R = 50;
  const LEN = 102;
  const N = parts.length;
  let inner =
    `<defs><radialGradient id="mmg" cx="38%" cy="38%" r="80%">` +
    `<stop offset="0%" stop-color="#1e3a5f"/><stop offset="100%" stop-color="#0b111e"/></radialGradient></defs>`;
  inner += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#mmg)"/>`;
  const lines = cen.split('\n');
  lines.forEach((ln, li) => {
    inner += `<text x="${cx}" y="${cy - (lines.length - 1) * 9 + li * 18}" fill="#7dd3fc" font-size="${lines.length > 1 ? 13 : 16}" font-weight="900" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif">${ln}</text>`;
  });
  parts.forEach((p, i) => {
    const a = (-90 + (360 / N) * i) * (Math.PI / 180);
    const x1 = cx + R * Math.cos(a), y1 = cy + R * Math.sin(a);
    const x2 = cx + (R + LEN - 10) * Math.cos(a), y2 = cy + (R + LEN - 10) * Math.sin(a);
    const tx = cx + (R + LEN + 20) * Math.cos(a), ty = cy + (R + LEN + 16) * Math.sin(a);
    inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${p.c}" stroke-width="3.5" stroke-linecap="round" opacity=".85"/>` +
      `<circle cx="${x2}" cy="${y2}" r="7" fill="${p.c}"/>` +
      `<text x="${tx}" y="${ty}" fill="${INK}" font-size="13.5" font-weight="800" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif">${p.t}</text>`;
  });
  return `<div style="border:1px solid ${BORDER};border-radius:16px;background:linear-gradient(180deg,#f8fafc,#fff);padding:12px;box-shadow:0 2px 6px rgba(2,8,23,.05)">` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;direction:ltr">${inner}</svg></div>`;
}

function flow(steps: { i: string; t: string }[], note?: string): string {
  return `<div style="border:1px solid ${BORDER};border-radius:14px;background:#fff;padding:16px 14px;box-shadow:0 1px 2px rgba(2,8,23,.05)">` +
    `<div style="display:flex;align-items:stretch;gap:6px">` +
    steps.map((s, ix) => (
      (ix > 0 ? `<div style="display:flex;align-items:center;font-size:18px;color:#94a3b8;font-weight:900">→</div>` : '') +
      `<div style="flex:1;min-width:86px;background:linear-gradient(180deg,#0b111e,#0e3a5c);color:#fff;border-radius:12px;padding:11px 8px;text-align:center">` +
      `<div style="font-size:20px">${s.i}</div>` +
      `<div style="font-size:11.5px;font-weight:800;margin-top:6px;line-height:1.85">${s.t}</div></div>`
    )).join('') +
    `</div>` +
    (note ? `<div style="margin-top:12px;background:#f0f9ff;border:1px solid #bae6fd;color:#075985;font-size:12px;line-height:2;padding:9px 14px;border-radius:10px;font-weight:700">📌 ${note}</div>` : '') +
    `</div>`;
}

function algo(title: string, steps: string[], out: string): string {
  return `<div style="border:1px solid ${BORDER};border-radius:14px;background:#fff;padding:15px 16px 13px;box-shadow:0 1px 2px rgba(2,8,23,.05)">` +
    `<div style="font-size:13px;font-weight:900;color:#0e3a5c;margin-bottom:11px">⚙️ ${title}</div>` +
    `<div style="display:flex;flex-direction:column;gap:7px">` +
    steps.map((s, ix) =>
      `<div style="display:flex;align-items:center;gap:10px;background:${ix % 2 ? '#f8fafc' : '#f0f9ff'};border:1px solid ${BORDER};border-radius:10px;padding:8px 12px">` +
      `<span style="flex:0 0 26px;height:26px;border-radius:8px;background:linear-gradient(135deg,${SKY},${CYAN});color:#fff;font-weight:900;font-size:12px;display:inline-flex;align-items:center;justify-content:center"><bdi>${ix + 1}</bdi></span>` +
      `<span style="font-size:12.5px;color:${SLATE};line-height:1.8;font-weight:700">${s}</span></div>`
    ).join('') +
    `<div style="display:flex;align-items:center;gap:10px;background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:8px 12px">` +
    `<span style="flex:0 0 26px;height:26px;border-radius:8px;background:#16a34a;color:#fff;font-weight:900;font-size:12px;display:inline-flex;align-items:center;justify-content:center">✓</span>` +
    `<span style="font-size:12.5px;color:#166534;line-height:1.8;font-weight:800">${out}</span></div>` +
    `</div></div>`;
}

function chain(boxes: { n: string; h: string }[], last: boolean): string {
  return `<div style="border:1px solid ${BORDER};border-radius:14px;background:#fff;padding:15px 16px;box-shadow:0 1px 2px rgba(2,8,23,.05)">` +
    `<div style="font-size:13px;font-weight:900;color:#0e3a5c;margin-bottom:11px">🔗 Fingerprint chain: any edit breaks the chain and reveals itself</div>` +
    `<div style="display:flex;gap:6px;align-items:center">` +
    boxes.map((b, i) =>
      (i > 0 ? `<div style="font-size:15px;color:#64748b;font-weight:900">🔗</div>` : '') +
      `<div style="flex:1;background:#fff;border:1.5px solid ${i === boxes.length - 1 ? '#22c55e' : BORDER};border-radius:11px;padding:8px;text-align:center">` +
      `<div style="font-size:14px;font-weight:900;color:${INK}" dir="ltr"><bdi>${b.n}</bdi></div>` +
      `<div dir="ltr" style="font-size:9px;color:#64748b;margin-top:2px"><bdi>${b.h}</bdi></div></div>`
    ).join('') +
    (last ? `<div style="font-size:15px;color:#16a34a;font-weight:900">✓</div>` : '') +
    `</div></div>`;
}

/* ═══ Section data — ENGLISH ═══ */

const MODULE_COLORS = ['#0284c7', '#06b6d4', '#0891b2', '#0d9488', '#16a34a', '#65a30d', '#ca8a04', '#ea580c', '#dc2626', '#9333ea'];

const VSECTIONS: VSec[] = [
  {
    no: '1', icon: '🏗️', title: 'What is Fimto? One gateway for your factory',
    intro: 'A single system running ready-mix concrete and blocks on the browser, the mobile app and the customer portal — with the same live data instantly. These screens are your gateway to every module; your scope is defined by your role in the tree.',
    diagram: mindMap('Fimto\nConcrete', [
      { t: 'Orders', c: MODULE_COLORS[0] }, { t: 'Schedule', c: MODULE_COLORS[1] },
      { t: 'Operations', c: MODULE_COLORS[2] }, { t: 'Stations', c: MODULE_COLORS[3] },
      { t: 'Lab', c: MODULE_COLORS[4] }, { t: 'Workshop', c: MODULE_COLORS[5] },
      { t: 'Finance', c: MODULE_COLORS[6] }, { t: 'Governance', c: MODULE_COLORS[7] },
      { t: 'Evaluation', c: MODULE_COLORS[8] }, { t: 'Customers', c: MODULE_COLORS[9] },
    ]),
    shots: [
      { src: IM('m01-welcome.jpeg'), cap: 'Start screen: sign in, create a new account, or join as guest' },
      { src: IM('m02-home.jpeg'), cap: 'Home screen: all your modules in one dashboard' },
      { src: IM('m03-languages.jpeg'), cap: 'Switch language instantly from the bar at the top of the screen' },
      { src: IM('m04-desktop.jpeg'), cap: 'The same app runs on desktop as a full browser experience', frame: 'browser' },
      { src: IM('m05-website.png'), cap: 'Factory portal: an informational page and sign-in gateway', frame: 'browser' },
    ],
    bullets: [
      'From any device: open concrete.fimtosoft.com and sign in — no installation, no internal server.',
      'Your role defines your modules only: you see nothing beyond your position, every screen in full Arabic.',
      'The same live data on mobile and desktop — what happens in the field shows up in the office instantly.',
    ],
  },
  {
    no: '2', icon: '🌳', title: 'Company tree and roles',
    intro: 'The company is built as a tree: companies ← stations ← branches ← departments, and every employee is granted their role and permission scope inside the tree — promoting an employee changes their modules and dashboard automatically.',
    diagram: mindMap('Tree\n& Roles', [
      { t: 'Owner', c: '#b45309' }, { t: 'Sys Admin', c: '#0369a1' },
      { t: 'Ops Manager', c: '#0e7490' }, { t: 'Scheduler', c: '#15803d' },
      { t: 'Accountant', c: '#4d7c0f' }, { t: 'Lab', c: '#a16207' },
      { t: 'Workshop', c: '#c2410c' }, { t: 'Rep', c: '#be185d' },
      { t: 'Driver', c: '#7c3aed' }, { t: 'Employee', c: '#334155' },
    ]),
    shots: [
      { src: IM('m06-tree.png'), cap: 'A tree example: it shows the levels and the code linked to each user' },
      { src: IM('m07-roles.png'), cap: 'The labour types that can be added to the system' },
      { src: IM('m08-accounts.jpeg'), cap: 'App account management: activating and blocking accounts' },
    ],
    bullets: [
      'A user identifier = their place in the tree: changing the position changes the scope and available modules.',
      'The labour type defines module permissions in advance, so adding staff is faster and more accurate.',
      'From the accounts panel the founder or sys admin can freeze or un-freeze any account instantly.',
    ],
  },
  {
    no: '3', icon: '📦', title: 'Customers and orders — from request to evaluation',
    intro: 'The full order journey: customer registry, orders with specifications, accountant approval, customer notification, completion with a digital delivery note, then evaluation — every step stamped with a server timestamp against tampering.',
    diagram: flow(
      [
        { i: '🛒', t: 'Order with spec' },
        { i: '✅', t: 'Finance approval' },
        { i: '🗓️', t: 'Safe scheduling' },
        { i: '🚚', t: 'Pour & delivery' },
        { i: '🖊️', t: 'Digital Challan' },
        { i: '⭐', t: 'Collection & rating' },
      ],
      'A debtor customer is frozen automatically and their orders are blocked from scheduling; the accountant approval is recorded under their name from the server.',
    ),
    shots: [],
    bullets: [
      'Customer manager: full registry with code, price agreement and credit status for every customer.',
      'For every order: type (concrete/blocks), mix design, slump, quantity, project location, and rep.',
      'On every status change the customer gets an email notification plus a one-tap WhatsApp message.',
      'After completion: a printable e-invoice + a star rating of the pour.',
    ],
  },
  {
    no: '4', icon: '🚚', title: 'Operations and trips',
    intro: 'From a scheduled order to a truck that departs and passes through five stages stamped with time and location, up to a digital delivery note (Digital Challan) signed by the recipient — every moment is counted for.',
    diagram: flow(
      [
        { i: '🚀', t: 'Departure' },
        { i: '📍', t: 'Site arrival' },
        { i: '🏗️', t: 'Pour start/end' },
        { i: '💧', t: 'Water addition logged' },
        { i: '🔙', t: 'Return to plant' },
        { i: '🧾', t: 'Digital Challan' },
      ],
      'Cycle time is computed automatically from the five stages, while distance is measured from the coordinates (Haversine).',
    ),
    shots: [
      { src: IM('m11-addtrip.jpeg'), cap: 'Adding a trip: mixer, driver, project, quantity, mix design and site coordinates' },
      { src: IM('m09-operations.jpeg'), cap: 'Operations board: trips, their stage times and delay causes' },
      { src: IM('m10-opsmanage.jpeg'), cap: 'Operations & schedule management: import today\'s orders in bulk' },
      { src: IM('m12-trip-rating.jpeg'), cap: 'Trip rating: cycle time and time adherence shown next to each trip' },
    ],
    bullets: [
      'Distance appears as soon as coordinates are entered, and the ETA refreshes as the truck advances.',
      'Digital Challan: number + verification QR + recipient signature + a log of every water addition.',
      'With the Android app the driver broadcasts their live location on the operations map.',
    ],
    extraAlgo: algo(
      'Delivered-quantity lock — preventing overloading',
      [
        'The trip delivery is proposed = remaining order quantity + an automatically calculated safety margin.',
        'No new trip can depart above the maximum limit allowed for the order.',
        'A rep refusing the proposal opens an automatic investigation and logs the reason.',
        'A quantity rising above the upper bound is rejected automatically and alerts management.',
      ],
      'Accurate delivery, and every deviation is recorded and asked about.',
    ),
  },
  {
    no: '5', icon: '🗓️', title: 'Schedule and account follow-up',
    intro: 'Distribution of production lines and trips automatically or manually, with a routes map and driver notifications, plus the accountant\'s view of every financial and credit movement.',
    diagram: flow(
      [
        { i: '✅', t: 'Approved order' },
        { i: '🔄', t: 'Manual/auto schedule' },
        { i: '🗺️', t: 'Routes map' },
        { i: '🔔', t: 'Driver notified' },
        { i: '🚚', t: 'Trips executed' },
      ],
      'Auto-balancing distributes the work across production lines and available slots with one click, confirming times.',
    ),
    shots: [
      { src: IM('m13-schedule.jpeg'), cap: 'Schedule: distributing trip cycles by priority, mixer and location' },
      { src: IM('m34-scheduler.jpeg'), cap: 'Scheduler screen: today\'s priorities and task distribution' },
      { src: IM('m33-scheduler-page.jpeg'), cap: 'Scheduler page: details of each trip and its editing' },
      { src: IM('m14-accountant-sched.jpeg'), cap: 'Accountant schedule view: financial obligations beside each trip' },
      { src: IM('m15-accountant-page.jpeg'), cap: 'Accountant page: digging deeper into every item' },
      { src: IM('m16-accountant-follow.jpeg'), cap: 'Accountant follow-up: collections, debts and daily dues' },
    ],
    bullets: [
      'Every scheduled trip shows for the executor instantly, and moving it to another slot documents the edit and whoever made it.',
      'The schedule map joins operating stations and pour sites and suggests the best rotations.',
      'The accountant sees the whole story: agreed, paid and outstanding — before approving anything.',
    ],
  },
  {
    no: '6', icon: '🎛️', title: 'Lab, quality and calibration',
    intro: 'The whole lab world in one screen: mix designs, strength, calibration and admixture ratios — every calibration figure stamped into a chain that cannot be broken without revealing it.',
    diagram: algo(
      'Strength predictor — from 7 days to 28',
      [
        'The strength reading is recorded 7 days after the pour.',
        'The built-in statistical model estimates the day-28 strength.',
        'It is compared with the target estimate to decide an early release.',
        'Every reading and forecast is sealed in the fingerprint chain.',
      ],
      'A quality decision ahead of the deadline, backed by a number you can defend to the client.',
    ),
    shots: [
      { src: IM('m17-lab.jpeg'), cap: 'Lab & quality: mix designs, strength and calibration in one screen' },
    ],
    bullets: [
      'Mix designs for every strength with adjustments and admixture ratios are saved in the cloud and calculated automatically.',
      'Weighbridge and mixer calibration are linked to the governance board, and their dates cannot be tampered with.',
    ],
    extraChain: chain([{ n: 'Calibration', h: 'a91f…c4' }, { n: 'Reading', h: '7be2…09f' }, { n: 'Forecast', h: 'd04a…77e' }, { n: 'Release', h: 'e9c3…b12' }], true),
  },
  {
    no: '7', icon: '🔧', title: 'Workshop and maintenance management',
    intro: 'Breakdowns, technicians and spare parts: everything in the workshop flows in a clear path from logging the fault to closing the work order and documenting the cost.',
    diagram: flow(
      [
        { i: '🛠️', t: 'Log a fault' },
        { i: '🏷️', t: 'Classify: normal/urgent' },
        { i: '👨‍🔧', t: 'Assign technician' },
        { i: '🧰', t: 'Spare parts' },
        { i: '✔️', t: 'Execute & close' },
        { i: '📄', t: 'Document & cost' },
      ],
      'A purchase request is not auto-created when the part is available in the store — refusals and reasons are documented.',
    ),
    shots: [
      { src: IM('m18-workshop.jpeg'), cap: 'Workshop home: equipment and its overall health' },
      { src: IM('m19-workshop1.jpeg'), cap: 'Equipment list and the faults linked to each machine' },
      { src: IM('m20-workshop-maint.jpeg'), cap: 'Maintenance management: work order and how it runs' },
      { src: IM('m21-workshop-maint2.jpeg'), cap: 'Maintenance management: execution and approval steps' },
      { src: IM('m22-workshop-open.jpeg'), cap: 'Open maintenance: tracking ongoing faults' },
      { src: IM('m23-workshop-home.jpeg'), cap: 'Main maintenance lists with dates and status' },
    ],
    bullets: [
      'Downtime is measured from the moment of logging until closure — revealing the slowest points in the field.',
      'Every work order documents the technician, parts and cost, and is closed with the manager\'s approval.',
    ],
  },
  {
    no: '8', icon: '🏭', title: 'Station maintenance',
    intro: 'Every station has its periodic maintenance: logging, available parts, field execution and a monthly plan built from the last-maintenance dates — shown on the equipment map.',
    diagram: flow(
      [
        { i: '📝', t: 'Log station maintenance' },
        { i: '🧰', t: 'Parts from stock' },
        { i: '👷', t: 'Field execution' },
        { i: '✔️', t: 'Close & document' },
        { i: '🗺️', t: 'Update map & status' },
      ],
      'A station stop indicator appears directly on the live equipment map for the overall evaluation.',
    ),
    shots: [
      { src: IM('m24-station.jpeg'), cap: 'Station maintenance: maintenance log and periodic plan' },
      { src: IM('m25-station2.jpeg'), cap: 'Maintenance details for every station and its matching spare parts' },
      { src: IM('m26-station3.jpeg'), cap: 'Tracking station maintenance execution through the stages' },
    ],
    bullets: [
      'Every station\'s plan is proposed automatically based on its last-maintenance time and type.',
      'Any stopped station appears instantly in a distinct colour on the overall-evaluation equipment map.',
    ],
  },
  {
    no: '9', icon: '📊', title: 'Overall evaluation and indicators',
    intro: 'All performance in one screen: a star rating for every pour, trip-cycle analysis, and a live equipment map covering station and trip positions moment by moment.',
    diagram: mindMap('Indicators', [
      { t: 'Trips', c: '#0369a1' }, { t: 'Cycles', c: '#0e7490' },
      { t: 'Timing', c: '#15803d' }, { t: 'Customer Sat.', c: '#a16207' },
      { t: 'Fuel', c: '#c2410c' }, { t: 'Waste', c: '#be185d' },
      { t: 'Faults', c: '#dc2626' }, { t: 'Productivity', c: '#7c3aed' },
    ]),
    shots: [
      { src: IM('m27-evaluation.jpeg'), cap: 'Overall evaluation: daily performance indicators for every unit' },
      { src: IM('m28-evaluation-map.jpeg'), cap: 'Live equipment map: station and trip positions' },
    ],
    bullets: [
      'The 15-star rating (station, truck, labour) feeds performance reports and identifies the best performers.',
      'Trip-cycle analysis reveals the slowest and shortest routes to guide field decisions.',
      'The productivity and operations indicator refreshes in real time for every workshop, machine and area.',
    ],
  },
  {
    no: '10', icon: '👥', title: 'Interfaces by role',
    intro: 'The same system, different views: every role sees its own dashboard and modules only — these are the key screens as the team actually uses them.',
    shots: [
      { src: IM('m29-owner.jpeg'), cap: 'Owner interface: the decision at the top of the tree' },
      { src: IM('m30-owner-home.jpeg'), cap: 'Owner screen: the factory\'s overall indicators' },
      { src: IM('m31-sysadmin.jpeg'), cap: 'Sys admin page: management and control tools' },
      { src: IM('m32-opsmgr.jpeg'), cap: 'Ops manager dashboard: live field follow-up' },
      { src: IM('m35-sales.jpeg'), cap: 'Rep page: their daily work in the field' },
    ],
    bullets: [
      'The owner sees everything with decision power, and the rep sees only their own work — precise permissions for every role.',
      'Changing any employee\'s position changes their interface and modules automatically without reinstalling.',
    ],
  },
];

/* ═══ Pages ═══ */

function headerBar(sec: VSec, cont: boolean): string {
  const label = cont ? `Section <bdi>${sec.no}</bdi> — continued` : `Section <bdi>${sec.no}</bdi>`;
  return `<div style="display:flex;align-items:center;gap:14px;background:linear-gradient(90deg,#0b111e,#0e3a5c);color:#fff;padding:18px 26px;border-radius:16px">
    <div style="font-size:30px">${sec.icon}</div>
    <div>
      <div style="font-size:12px;color:#7dd3fc;font-weight:800">${label}</div>
      <div style="font-size:22px;font-weight:900;line-height:1.5">${sec.title}</div>
    </div>
    <div style="margin-inline-start:auto;font-size:11px;color:#94a3b8;font-weight:700" dir="ltr"><bdi>FIMTO CONCRETE ERP</bdi></div>
  </div>`;
}

function newPage(sec: VSec, cont: boolean) {
  const page = el(`<div lang="en" style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(180deg,#f8fafc 0%,#fff 30%);box-sizing:border-box;padding:48px;font-family:'Segoe UI',Arial,sans-serif;direction:ltr;overflow:hidden">
    ${headerBar(sec, cont)}
  </div>`);
  const cnt = el(`<div style="margin-top:18px"></div>`);
  page.appendChild(cnt);
  page.setAttribute('data-sec', sec.no);
  return { page, cnt };
}

function introEl(txt: string): HTMLElement {
  return el(`<p style="margin:0 0 14px;color:#475569;font-size:13.5px;line-height:2">${txt}</p>`);
}

function phoneFrame(shot: Shot): HTMLElement {
  return el(`<div style="width:286px;display:inline-block;vertical-align:top">
    <div style="position:relative;width:286px;background:linear-gradient(165deg,#334155,#0b0f19);border:2px solid #0f172a;border-radius:34px;padding:12px 14px;box-shadow:0 12px 26px rgba(2,8,23,.3)">
      <div style="position:absolute;right:-3px;top:102px;width:3px;height:32px;background:#334155;border-radius:2px"></div>
      <div style="position:absolute;left:-3px;top:94px;width:3px;height:22px;background:#334155;border-radius:2px"></div>
      <div style="position:relative;width:258px;height:516px;border-radius:24px;overflow:hidden;background:#0b0f19">
        <img src="${shot.src}" style="width:258px;height:516px;object-fit:contain;display:block;background:linear-gradient(180deg,#0d2136,#0b111e)"/>
        <div style="position:absolute;top:8px;left:50%;transform:translateX(-50%);width:82px;height:18px;background:#05070c;border-radius:12px;z-index:3">
          <div style="width:26px;height:5px;border-radius:99px;background:#1e293b;margin:5px auto 0"></div>
        </div>
        <div style="position:absolute;bottom:7px;left:50%;transform:translateX(-50%);width:92px;height:4px;border-radius:99px;background:rgba(226,232,240,.85);z-index:3"></div>
      </div>
    </div>
    <div style="text-align:center;font-size:11px;font-weight:800;color:#0e3a5c;line-height:1.7;margin-top:8px;padding-inline:4px">📱 ${shot.cap}</div>
  </div>`);
}

function browserFrame(shot: Shot): HTMLElement {
  return el(`<div style="width:560px;margin-top:14px" dir="ltr">
    <div style="background:#1e293b;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:8px;padding:9px 14px">
      <span style="width:11px;height:11px;border-radius:99px;background:#f87171;display:inline-block"></span>
      <span style="width:11px;height:11px;border-radius:99px;background:#fbbf24;display:inline-block"></span>
      <span style="width:11px;height:11px;border-radius:99px;background:#34d399;display:inline-block"></span>
      <span style="flex:1;background:#0f172a;color:#94a3b8;font-size:11px;font-weight:700;padding:5px 12px;border-radius:99px;text-align:center"><bdi>concrete.fimtosoft.com</bdi></span>
    </div>
    <div style="width:560px;height:378px;background:#0b0f19;border-radius:0 0 12px 12px;overflow:hidden;border:1px solid #0f172a;border-top:none">
      <img src="${shot.src}" style="width:560px;height:378px;object-fit:contain;display:block"/>
    </div>
    <div style="text-align:center;font-size:11px;font-weight:800;color:#0e3a5c;line-height:1.7;margin-top:8px">💻 ${shot.cap}</div>
  </div>`);
}

function shotEl(shot: Shot): HTMLElement {
  return (shot.frame === 'browser' ? browserFrame(shot) : phoneFrame(shot));
}

function bulletEl(t: string): HTMLElement {
  return el(`<div style="display:flex;gap:9px;align-items:flex-start;margin-top:9px;background:#fff;border:1px solid ${BORDER};border-radius:10px;padding:9px 13px">
    <span style="flex:0 0 7px;height:7px;border-radius:99px;background:${SKY};margin-top:7px"></span>
    <span style="font-size:12.5px;color:${SLATE};line-height:1.85;font-weight:700">${t}</span>
  </div>`);
}

function buildCoverVisual(): HTMLElement {
  return el(`<div lang="en" style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(160deg,#080c14 0%,#0b111e 55%,#0d2136 100%);color:#fff;box-sizing:border-box;padding:70px 60px;display:flex;flex-direction:column;font-family:'Segoe UI',Arial,sans-serif;direction:ltr;">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:13px;color:#38bdf8;font-weight:800;border:1px solid #155e75;border-radius:999px;padding:6px 14px">FIMTO SOFT</div>
      <div style="font-size:12px;color:#64748b"><bdi>Visual Manual v1.0</bdi></div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center">
      <img src="${logoUrl}" alt="Fimto" style="width:140px;height:138px;object-fit:contain;margin:0 auto 20px;display:block;border-radius:24px;background:#fff;padding:8px;align-self:center"/>
      <h1 style="font-size:42px;margin:0;font-weight:900;line-height:1.5">Visual Manual<br/><span style="color:#38bdf8">Fimto Concrete System</span></h1>
      <p style="color:#94a3b8;font-size:15.5px;margin-top:16px;line-height:1.9">35 real screens from the app in mobile frames, with mind maps, flow charts and algorithms<br/>Web · Android · Customer Portal</p>
      <div style="margin-top:26px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        ${['🖼️ Screens in phone frames', '🧠 3 mind maps', '🔀 6 flow charts', '⚙️ Algorithms', '🔗 Fingerprint chain'].map(x =>
          `<span style="background:rgba(56,189,248,.08);border:1px solid #164e63;color:#7dd3fc;font-size:13px;font-weight:700;padding:8px 14px;border-radius:10px">${x}</span>`).join('')}
      </div>
    </div>
    <div style="text-align:center;color:#475569;font-size:12px"><bdi>concrete.fimtosoft.com</bdi> — Designed by Dr. Ahmad Abdo Alyan</div>
  </div>`);
}

function buildBackVisual(): HTMLElement {
  return el(`<div lang="en" style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(200deg,#080c14,#0d2136);color:#fff;box-sizing:border-box;padding:80px 60px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-family:'Segoe UI',Arial,sans-serif;direction:ltr;">
    <div style="font-size:52px;margin-bottom:18px">📖</div>
    <h2 style="font-size:32px;font-weight:900;margin:0">Time to start using it</h2>
    <p style="color:#94a3b8;font-size:15px;line-height:2;margin-top:14px">Every screen in this manual is in front of you in the system right now.<br/>If you don't find one in your interface, your role is different — that is normal and intended.</p>
    <div style="margin-top:32px;background:rgba(56,189,248,.08);border:1px solid #164e63;border-radius:14px;padding:20px 30px;font-size:14px;color:#7dd3fc;line-height:2.2" dir="ltr">
      concrete.fimtosoft.com<br/>downloads/fimto-android.apk<br/>concrete.fimtosoft.com/#/portal
    </div>
    <div style="margin-top:38px;color:#475569;font-size:12px">© Fimto Soft — All rights reserved</div>
  </div>`);
}

/* ═══ Generation ═══ */

function groupShots(shots: Shot[]): Shot[][] {
  const groups: Shot[][] = [];
  let cur: Shot[] = [];
  const flush = () => { if (cur.length) { groups.push(cur); cur = []; } };
  for (const s of shots) {
    if (s.frame === 'browser') { flush(); groups.push([s]); continue; }
    cur.push(s);
    if (cur.length === 2) flush();
  }
  flush();
  return groups;
}

function rowElOf(shots: Shot[]): HTMLElement {
  const row = el(`<div style="display:flex;justify-content:center;align-items:center;gap:26px;margin:0"></div>`);
  shots.forEach(s => row.appendChild(shotEl(s)));
  return row;
}

export async function generateVisualManualPdfEn(onProgress?: (done: number, total: number) => void): Promise<number> {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
  document.body.appendChild(holder);

  try {
    const allShots = VSECTIONS.flatMap(s => s.shots);
    await Promise.all(allShots.map(s =>
      new Promise<void>(res => {
        const i = new Image();
        i.onload = () => res();
        i.onerror = () => res();
        i.src = s.src;
      })
    ));

    const contentPages: HTMLElement[] = [];

    holder.appendChild(buildCoverVisual());

    for (const sec of VSECTIONS) {
      let { page, cnt } = newPage(sec, false);
      holder.appendChild(page);
      const headerH = () => (page.firstElementChild as HTMLElement).offsetHeight;
      const avail = () => PAGE_H - 48 * 2 - headerH() - 18;

      const textItems: HTMLElement[] = [];
      textItems.push(introEl(sec.intro));
      if (sec.diagram) textItems.push(el(sec.diagram));
      if (sec.extraAlgo) textItems.push(el(sec.extraAlgo));
      if (sec.extraChain) textItems.push(el(sec.extraChain));
      sec.bullets.forEach(b => textItems.push(bulletEl(b)));

      for (const it of textItems) {
        cnt.appendChild(it);
        if (cnt.scrollHeight > avail()) {
          cnt.removeChild(it);
          contentPages.push(page);
          ({ page, cnt } = newPage(sec, true));
          holder.appendChild(page);
          cnt.appendChild(it);
        }
      }
      contentPages.push(page);

      for (const row of groupShots(sec.shots)) {
        const { page: sp, cnt: sc } = newPage(sec, sec.shots.length > 0);
        holder.appendChild(sp);
        const hh = (sp.firstElementChild as HTMLElement).offsetHeight;
        sc.style.cssText += ';display:flex;align-items:center;justify-content:center;margin-top:0;height:' + (PAGE_H - 96 - hh - 14) + 'px;';
        sc.appendChild(rowElOf(row));
        contentPages.push(sp);
      }
    }

    const tocHtml = `
      <div lang="en" style="width:${PAGE_W}px;height:${PAGE_H}px;background:#fff;box-sizing:border-box;padding:55px;font-family:'Segoe UI',Arial,sans-serif;direction:ltr;">
        <div style="border-radius:16px;background:${LIGHT};border:1px solid ${BORDER};padding:22px 26px;margin-bottom:20px">
          <div style="font-size:13px;color:${SKY};font-weight:800"><bdi>VISUAL CONTENTS</bdi></div>
          <div style="font-size:30px;font-weight:900;color:${INK}">📖 Visual Manual Index</div>
        </div>
        <table style="width:100%;border-collapse:collapse"><tbody></tbody></table>
        <div style="margin-top:22px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:13px 17px;color:#0369a1;font-size:12.5px;line-height:1.9">
          💡 ${VSECTIONS.length} sections covering 35 real screens + mind maps, flow charts and algorithms — every section starts with a diagram then shows the screens with their captions.
        </div>
      </div>`;
    const toc = el(tocHtml);
    holder.appendChild(toc);
    holder.appendChild(buildBackVisual());
    // The index is always the second page: page 1 = cover, page 2 = index
    holder.insertBefore(toc, holder.children[1]);

    const pages = Array.from(holder.children) as HTMLElement[];
    const tocRows = VSECTIONS.map(s => `
      <tr>
        <td style="padding:7px 6px;border-bottom:1px solid ${BORDER};width:46px"><span style="display:inline-flex;width:26px;height:26px;border-radius:8px;background:${INK};color:#fff;align-items:center;justify-content:center;font-weight:800;font-size:12px"><bdi>${s.no}</bdi></span></td>
        <td style="padding:7px 6px;border-bottom:1px solid ${BORDER};font-weight:800;color:${INK};font-size:13.5px">${s.icon} ${s.title}</td>
        <td style="padding:7px 6px;border-bottom:1px solid ${BORDER};color:${SKY};font-size:12px;font-weight:700;white-space:nowrap">P<bdi>${pages.findIndex(p => p.getAttribute('data-sec') === s.no) + 1}</bdi></td>
      </tr>`).join('');
    const tocTbody = toc.querySelector('table tbody');
    if (tocTbody) tocTbody.innerHTML = tocRows;

    const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait', compress: true });
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      let canvas: HTMLCanvasElement;
      try {
        canvas = await toCanvas(pages[i], { pixelRatio: 1.5, backgroundColor: '#ffffff', cacheBust: true });
      } catch {
        canvas = await html2canvas(pages[i], { scale: 1.3, backgroundColor: '#ffffff', logging: false, useCORS: true });
      }
      const img = canvas.toDataURL('image/jpeg', 0.86);
      if (i > 0) pdf.addPage([PAGE_W, PAGE_H], 'portrait');
      pdf.addImage(img, 'JPEG', 0, 0, PAGE_W, PAGE_H);
    }
    onProgress?.(pages.length, pages.length);
    pdf.save(`Fimto-Visual-Manual-EN-${new Date().toISOString().slice(0, 10)}.pdf`);
    return pages.length;
  } finally {
    holder.remove();
  }
}