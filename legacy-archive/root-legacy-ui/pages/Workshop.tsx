import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { loadAssets, saveAssets, loadWorkshopConfig, saveWorkshopConfig } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import DatePicker from '../components/DatePicker';

// ======================= TYPES =======================
interface Asset { id: string; plate: string; chassis: string; type: string; status: string; driver: string; initOdo: number; engHours: number; regExpiry: string; insExpiry: string; opcardExpiry: string; authExpiry: string; gpsId: string; tare: string; gross: string; gpsLat?: number; gpsLng?: number; productionRate?: number; capacity?: number; model?: string; year?: string; manufacturer?: string; }
interface FuelLog { id: number; date: string; assetId: string; odoReading: number; liters: number; costPerLiter: number; totalCost: number; fuelType: string; station: string; invoice: string; notes: string; }
interface OilLog { id: number; date: string; assetId: string; oilType: string; brand: string; quantity: number; unit: string; cost: number; odoReading: number; nextChangeOdo: number; notes: string; }
interface SparePartLog { id: number; date: string; assetId: string; partName: string; partNumber: string; quantity: number; unitCost: number; totalCost: number; supplier: string; invoice: string; warranty: string; notes: string; }
interface BreakdownReport { id: number; date: string; assetId: string; reportedBy: string; symptom: string; severity: 'Critical'|'Major'|'Minor'; status: 'Open'|'In Repair'|'Resolved'; mechanicAssigned: string; repairStart: string; repairEnd: string; repairDesc: string; partsUsed: string; repairCost: number; notes: string; }
interface WarehouseItem { id: number; code: string; name: string; category: string; currentStock: number; minStock: number; safetyStock: number; unit: string; unitCost: number; supplier: string; location: string; lastUpdated: string; notes: string; }
interface PurchaseRequest { id: number; date: string; warehouseItemId: number; itemCode: string; itemName: string; qty: number; reason: string; requestedBy: string; approvedBy: string; status: 'Pending'|'Approved'|'Rejected'|'Received'; priority: 'High'|'Medium'|'Low'; notes: string; autoRejected: boolean; }
interface MixingStation { 
  id: number; 
  plantId: string; // ربط المحطة بالمصنع
  name: string; 
  productType: 'concrete' | 'blocks' | 'both'; // نوع المنتج
  operator: string; // اسم المشغل
  designCap: number; 
  actualCap: number; 
  unit: string; 
  location: string; 
  installDate: string; 
  status: 'Running'|'Maintenance'|'Stopped'; 
  notes: string; 
}
interface PeriodicMaint { id: number; stationId: number; date: string; taskType: 'Belts'|'Greasing'|'Oiling'|'Drum Cleaning'|'General Hygiene'|'Electrical Check'|'Control Room'|'Software Update'|'Pipe Change'|'Pipe Welding'|'Pump Special Maintenance'|'Other'; description: string; technician: string; nextDue: string; status: 'Done'|'Scheduled'|'Overdue'; cost: number; notes: string; }

type Tab = 'home'|'fuel'|'oil'|'spareparts'|'breakdown'|'purchaserequests'|'warehouse'|'vehiclereport'|'mixingstations'|'config'|'reports';

const DEF_ASSETS: Asset[] = [
  { id: 'm01', plate: '1234 XAD', chassis: 'WDB123456', type: 'Mixer', status: 'Ready', driver: 'Ahmed Ali', initOdo: 50000, engHours: 2400, regExpiry: '2026-12-30', insExpiry: '2026-11-15', opcardExpiry: '2026-10-01', authExpiry: '2026-09-20', gpsId: 'IMEI-869234', tare: '15', gross: '40' },
  { id: 'm04', plate: '5678 BCD', chassis: 'WDB789012', type: 'Mixer', status: 'Workshop', driver: 'Mohamed Sami', initOdo: 62000, engHours: 2900, regExpiry: '2026-08-22', insExpiry: '2026-07-10', opcardExpiry: '2026-06-30', authExpiry: '2026-05-15', gpsId: 'IMEI-869235', tare: '15', gross: '40' },
];
const DEF_CONFIG = { stationName: 'Model Plant', globalBudget: '50000', maintBudget: '15000', tyreBudget: '8000', lightFuelBudget: '4000', heavyFuelBudget: '23000', targetProd: '12000', fuelEffTarget: '2.5' };

function loadLocal<T>(key: string, def: T): T { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; } }

export default function Workshop() {
  const { currentUser } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>('home');
  const [assets, setAssets] = useState<Asset[]>(DEF_ASSETS);
  const [config, setConfig] = useState(DEF_CONFIG);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>(() => loadLocal('ws_fuel', []));
  const [oilLogs, setOilLogs] = useState<OilLog[]>(() => loadLocal('ws_oil', []));
  const [sparePartLogs, setSparePartLogs] = useState<SparePartLog[]>(() => loadLocal('ws_parts', []));
  const [breakdowns, setBreakdowns] = useState<BreakdownReport[]>(() => loadLocal('ws_breakdowns', []));
  const [warehouse, setWarehouse] = useState<WarehouseItem[]>(() => loadLocal('ws_warehouse', []));
  const [purchaseReqs, setPurchaseReqs] = useState<PurchaseRequest[]>(() => loadLocal('ws_purchreq', []));
  const [stations, setStations] = useState<MixingStation[]>(() => loadLocal('ws_stations', [
    { id: 1, plantId: 'plant-1', name: 'محطة الخلط المركزية', productType: 'concrete', operator: 'أحمد محمد', designCap: 120, actualCap: 70, unit: 'm³/h', location: 'المنطقة الصناعية', installDate: '2025-03-15', status: 'Running', notes: '' },
    { id: 2, plantId: 'plant-1', name: 'مصنع البلوك الآلي', productType: 'blocks', operator: 'محمد علي', designCap: 5000, actualCap: 3200, unit: 'Blocks/day', location: 'المنطقة الصناعية', installDate: '2025-06-01', status: 'Running', notes: '' },
  ]));
  const [periodicMaints, setPeriodicMaints] = useState<PeriodicMaint[]>(() => loadLocal('ws_maints', [
    { id: 1, stationId: 1, date: '2026-07-01', taskType: 'Belts', description: 'فحص وشد سيور النقل', technician: 'فني صيانة 1', nextDue: '2026-08-01', status: 'Done', cost: 200, notes: '' },
    { id: 2, stationId: 1, date: '2026-07-05', taskType: 'Greasing', description: 'تشحيم المحاور والبكرات', technician: 'فني تشحيم', nextDue: '2026-07-12', status: 'Scheduled', cost: 150, notes: '' },
    { id: 3, stationId: 1, date: '2026-07-10', taskType: 'Drum Cleaning', description: 'تنظيف حلة الخلط', technician: 'عامل نظافة', nextDue: '2026-07-11', status: 'Overdue', cost: 80, notes: '' },
  ]));
  const [loaded, setLoaded] = useState(false);

  // Forms
  const [assetForm, setAssetForm] = useState({ id: '', plate: '', chassis: '', type: 'Mixer', status: 'Ready', driver: '', initOdo: '', engHours: '', regExpiry: '', insExpiry: '', opcardExpiry: '', authExpiry: '', gpsId: '', tare: '', gross: '' });
  const [fuelForm, setFuelForm] = useState({ date: new Date().toISOString().split('T')[0], assetId: '', odoReading: '', liters: '', costPerLiter: '', fuelType: 'Diesel', station: '', invoice: '', notes: '' });
  const [oilForm, setOilForm] = useState({ date: new Date().toISOString().split('T')[0], assetId: '', oilType: 'Engine Oil', brand: '', quantity: '', unit: 'Liters', cost: '', odoReading: '', nextChangeOdo: '', notes: '' });
  const [spForm, setSpForm] = useState({ date: new Date().toISOString().split('T')[0], assetId: '', partName: '', partNumber: '', quantity: '1', unitCost: '', supplier: '', invoice: '', warranty: '', notes: '' });
  const [bdForm, setBdForm] = useState({ date: new Date().toISOString().split('T')[0], assetId: '', reportedBy: '', symptom: '', severity: 'Major' as 'Critical'|'Major'|'Minor', mechanicAssigned: '', repairStart: '', repairEnd: '', repairDesc: '', partsUsed: '', repairCost: '', notes: '' });
  const [editingBdId, setEditingBdId] = useState<number|null>(null);
  const [whForm, setWhForm] = useState({ code: '', name: '', category: 'Mechanical', currentStock: '', minStock: '', safetyStock: '', unit: 'Piece', unitCost: '', supplier: '', location: '', notes: '' });
  const [editingWhId, setEditingWhId] = useState<number|null>(null);
  const [prForm, setPrForm] = useState({ warehouseItemId: 0, itemCode: '', itemName: '', qty: '', reason: '', requestedBy: '', priority: 'Medium' as 'High'|'Medium'|'Low', notes: '' });
  const [reportVehicle, setReportVehicle] = useState('');
  const [reportFrom, setReportFrom] = useState(''); const [reportTo, setReportTo] = useState('');
  // Station forms
  const [stForm, setStForm] = useState({ 
    plantId: '', 
    name: '', 
    productType: 'concrete' as MixingStation['productType'], 
    operator: '',
    designCap: '', 
    actualCap: '', 
    unit: 'm³/h', 
    location: '', 
    installDate: '', 
    status: 'Running' as MixingStation['status'], 
    notes: '' 
  });
  const [editingStId, setEditingStId] = useState<number|null>(null);
  // Periodic maint form
  const [pmForm, setPmForm] = useState({ stationId: 0, date: new Date().toISOString().split('T')[0], taskType: 'Greasing' as PeriodicMaint['taskType'], description: '', technician: '', nextDue: '', status: 'Scheduled' as PeriodicMaint['status'], cost: '', notes: '' });
  const [editingPmId, setEditingPmId] = useState<number|null>(null);

  // Load Firebase
  useEffect(() => { if (!currentUser) return; Promise.all([loadAssets(currentUser.username), loadWorkshopConfig(currentUser.username)]).then(([a,c]) => { if (a?.length) setAssets(a); if (c) setConfig(c); setLoaded(true); }).catch(() => setLoaded(true)); }, [currentUser?.username]);
  useEffect(() => { if (!loaded||!currentUser) return; localStorage.setItem('fms_assets_'+currentUser.plantName,JSON.stringify(assets)); saveAssets(currentUser.username, assets).catch(()=>{}); }, [assets,loaded]);
  useEffect(() => { if (!loaded||!currentUser) return; localStorage.setItem('fms_cfg_'+currentUser.plantName,JSON.stringify(config)); saveWorkshopConfig(currentUser.username, config).catch(()=>{}); }, [config,loaded]);
  useEffect(() => { localStorage.setItem('ws_fuel', JSON.stringify(fuelLogs)); }, [fuelLogs]);
  useEffect(() => { localStorage.setItem('ws_oil', JSON.stringify(oilLogs)); }, [oilLogs]);
  useEffect(() => { localStorage.setItem('ws_parts', JSON.stringify(sparePartLogs)); }, [sparePartLogs]);
  useEffect(() => { localStorage.setItem('ws_breakdowns', JSON.stringify(breakdowns)); }, [breakdowns]);
  useEffect(() => { localStorage.setItem('ws_warehouse', JSON.stringify(warehouse)); }, [warehouse]);
  useEffect(() => { localStorage.setItem('ws_purchreq', JSON.stringify(purchaseReqs)); }, [purchaseReqs]);
  useEffect(() => { localStorage.setItem('ws_stations', JSON.stringify(stations)); }, [stations]);
  useEffect(() => { localStorage.setItem('ws_maints', JSON.stringify(periodicMaints)); }, [periodicMaints]);

  // Sync breakdowns
  useEffect(() => { if (!loaded) return; const openIds = new Set(breakdowns.filter(b => b.status==='Open'||b.status==='In Repair').map(b => b.assetId)); let changed = false; const updated = assets.map(a => { if (openIds.has(a.id) && a.status!=='Workshop') { changed=true; return {...a, status:'Workshop'}; } if (!openIds.has(a.id) && a.status==='Workshop') { changed=true; return {...a, status:'Ready'}; } return a; }); if (changed) setAssets(updated); }, [breakdowns, loaded]);

  const fetchVehicleData = (assetId: string) => { const a = assets.find(x => x.id===assetId); if (!a) { alert('Vehicle not found!'); return; } setFuelForm(prev => ({...prev, odoReading: String(a.initOdo)})); setOilForm(prev => ({...prev, odoReading: String(a.initOdo)})); };

  const openBDs = breakdowns.filter(b => b.status==='Open'||b.status==='In Repair');
  const activeAssets = assets.filter(a => a.status==='Ready').length;
  const workshopAssets = assets.filter(a => a.status==='Workshop').length;

  // Workshop Duration
  const calcWorkshopDuration = (bd: BreakdownReport) => { const entryDate = new Date(bd.date); const now = new Date(); const diffMs = now.getTime() - entryDate.getTime(); const totalHours = diffMs / (1000 * 60 * 60); const days = Math.floor(totalHours / 24); const hours = Math.floor(totalHours % 24); const blocks12h = Math.floor(totalHours / 12); return { totalHours, days, hours, blocks12h, entryDate, isOverdue: totalHours > 12 && bd.status !== 'Resolved' }; };
  const overdueBreakdowns = openBDs.filter(b => calcWorkshopDuration(b).isOverdue);
  const criticalOverdue = overdueBreakdowns.filter(b => calcWorkshopDuration(b).totalHours > 24);

  // Handlers
  const addFuelLog = (e: React.FormEvent) => { e.preventDefault(); if(!fuelForm.assetId||!fuelForm.liters) return; const L=parseFloat(fuelForm.liters), cpl=parseFloat(fuelForm.costPerLiter)||0; setFuelLogs(p=>[...p,{id:Date.now(),...fuelForm,odoReading:parseInt(fuelForm.odoReading)||0,liters:L,costPerLiter:cpl,totalCost:L*cpl}]); setFuelForm({date:new Date().toISOString().split('T')[0],assetId:'',odoReading:'',liters:'',costPerLiter:'',fuelType:'Diesel',station:'',invoice:'',notes:''}); };
  const addOilLog = (e: React.FormEvent) => { e.preventDefault(); if(!oilForm.assetId||!oilForm.quantity) return; setOilLogs(p=>[...p,{id:Date.now(),...oilForm,quantity:parseFloat(oilForm.quantity),cost:parseFloat(oilForm.cost)||0,odoReading:parseInt(oilForm.odoReading)||0,nextChangeOdo:parseInt(oilForm.nextChangeOdo)||0}]); setOilForm({date:new Date().toISOString().split('T')[0],assetId:'',oilType:'Engine Oil',brand:'',quantity:'',unit:'Liters',cost:'',odoReading:'',nextChangeOdo:'',notes:''}); };
  const addSparePart = (e: React.FormEvent) => { e.preventDefault(); if(!spForm.assetId||!spForm.partName) return; const q=parseInt(spForm.quantity)||1, uc=parseFloat(spForm.unitCost)||0; setSparePartLogs(p=>[...p,{id:Date.now(),...spForm,quantity:q,unitCost:uc,totalCost:q*uc}]); setSpForm({date:new Date().toISOString().split('T')[0],assetId:'',partName:'',partNumber:'',quantity:'1',unitCost:'',supplier:'',invoice:'',warranty:'',notes:''}); };
  const submitBD = (e: React.FormEvent) => { e.preventDefault(); if(!bdForm.assetId||!bdForm.symptom) return; if(editingBdId){ setBreakdowns(p=>p.map(b=>b.id===editingBdId?{...b,...bdForm,repairCost:parseFloat(bdForm.repairCost)||0,status:bdForm.repairDesc?'Resolved':b.status}:b)); setEditingBdId(null); } else { setBreakdowns(p=>[...p,{id:Date.now(),...bdForm,repairCost:parseFloat(bdForm.repairCost)||0,status:'Open'}]); setAssets(p=>p.map(a=>a.id===bdForm.assetId?{...a,status:'Workshop'}:a)); } setBdForm({date:new Date().toISOString().split('T')[0],assetId:'',reportedBy:'',symptom:'',severity:'Major',mechanicAssigned:'',repairStart:'',repairEnd:'',repairDesc:'',partsUsed:'',repairCost:'',notes:''}); };
  const resolveBD = (id:number) => { setBreakdowns(p=>p.map(b=>b.id===id?{...b,status:'Resolved'}:b)); const bd=breakdowns.find(b=>b.id===id); if(bd){ const still=breakdowns.filter(b=>b.assetId===bd.assetId&&b.id!==id&&(b.status==='Open'||b.status==='In Repair')); if(still.length===0) setAssets(p=>p.map(a=>a.id===bd.assetId?{...a,status:'Ready'}:a)); } };
  const editBD = (bd: BreakdownReport) => { setEditingBdId(bd.id); setBdForm({date:bd.date,assetId:bd.assetId,reportedBy:bd.reportedBy,symptom:bd.symptom,severity:bd.severity,mechanicAssigned:bd.mechanicAssigned,repairStart:bd.repairStart,repairEnd:bd.repairEnd,repairDesc:bd.repairDesc,partsUsed:bd.partsUsed,repairCost:String(bd.repairCost),notes:bd.notes}); setTab('breakdown'); };
  const deleteBD = (id:number) => { if(!confirm('Delete?')) return; const bd=breakdowns.find(b=>b.id===id); setBreakdowns(p=>p.filter(b=>b.id!==id)); if(bd){ const still=breakdowns.filter(b=>b.assetId===bd.assetId&&b.id!==id&&(b.status==='Open'||b.status==='In Repair')); if(still.length===0) setAssets(p=>p.map(a=>a.id===bd.assetId?{...a,status:'Ready'}:a)); } };
  const addWhItem = () => { if(!whForm.code||!whForm.name) return; if(editingWhId){ setWarehouse(p=>p.map(w=>w.id===editingWhId?{...w,...whForm,currentStock:parseInt(whForm.currentStock)||0,minStock:parseInt(whForm.minStock)||0,safetyStock:parseInt(whForm.safetyStock)||0,unitCost:parseFloat(whForm.unitCost)||0,lastUpdated:new Date().toISOString().split('T')[0]}:w)); setEditingWhId(null); } else setWarehouse(p=>[...p,{id:Date.now(),...whForm,currentStock:parseInt(whForm.currentStock)||0,minStock:parseInt(whForm.minStock)||0,safetyStock:parseInt(whForm.safetyStock)||0,unitCost:parseFloat(whForm.unitCost)||0,lastUpdated:new Date().toISOString().split('T')[0]}]); setWhForm({code:'',name:'',category:'Mechanical',currentStock:'',minStock:'',safetyStock:'',unit:'Piece',unitCost:'',supplier:'',location:'',notes:''}); };
  const editWhItem = (w: WarehouseItem) => { setEditingWhId(w.id); setWhForm({code:w.code,name:w.name,category:w.category,currentStock:String(w.currentStock),minStock:String(w.minStock),safetyStock:String(w.safetyStock),unit:w.unit,unitCost:String(w.unitCost),supplier:w.supplier,location:w.location,notes:w.notes}); setTab('warehouse'); };
  const deleteWhItem = (id:number) => { if(confirm('Delete?')) setWarehouse(p=>p.filter(w=>w.id!==id)); };
  const addPurchaseReq = () => {
    if(!prForm.warehouseItemId||!prForm.qty) return;
    const whItem = warehouse.find(w=>w.id===prForm.warehouseItemId);
    const requestedQty = parseInt(prForm.qty);
    
    if(!whItem) {
      setPurchaseReqs(p=>[...p,{id:Date.now(),date:new Date().toISOString().split('T')[0],warehouseItemId:prForm.warehouseItemId,itemCode:prForm.itemCode,itemName:prForm.itemName,qty:requestedQty,reason:prForm.reason,requestedBy:prForm.requestedBy,approvedBy:'',status:'Pending',priority:prForm.priority,notes:'Item not found in warehouse',autoRejected:false}]);
    } else if(whItem.currentStock >= requestedQty) {
      const report = `📊 WAREHOUSE SEARCH REPORT\n\n✅ Item Found: ${whItem.name} (${whItem.code})\n📦 Current Stock: ${whItem.currentStock} ${whItem.unit}\n🎯 Requested Qty: ${requestedQty} ${whItem.unit}\n🛡️ Safety Stock: ${whItem.safetyStock} ${whItem.unit}\n\n✨ Request REJECTED - Item available in warehouse!`;
      alert(report);
      setPurchaseReqs(p=>[...p,{id:Date.now(),date:new Date().toISOString().split('T')[0],warehouseItemId:prForm.warehouseItemId,itemCode:whItem.code,itemName:whItem.name,qty:requestedQty,reason:prForm.reason,requestedBy:prForm.requestedBy,approvedBy:'',status:'Rejected',priority:prForm.priority,notes:`Auto-Rejected: Available (Stock: ${whItem.currentStock}, Safety: ${whItem.safetyStock})`,autoRejected:true}]);
    } else {
      const deficit = requestedQty - whItem.currentStock;
      const belowSafety = whItem.currentStock < whItem.safetyStock;
      const report = `📊 WAREHOUSE SEARCH REPORT\n\n⚠️ Item Found: ${whItem.name} (${whItem.code})\n📦 Current Stock: ${whItem.currentStock} ${whItem.unit}\n🎯 Requested Qty: ${requestedQty} ${whItem.unit}\n📉 Deficit: ${deficit} ${whItem.unit}\n🛡️ Safety Stock: ${whItem.safetyStock} ${whItem.unit}\n${belowSafety ? `\n🚨 WARNING: Stock below safety level!\n   Need to replenish ${whItem.safetyStock - whItem.currentStock} units to reach safety stock\n` : ''}\n✅ Request APPROVED - Purchase needed`;
      alert(report);
      setPurchaseReqs(p=>[...p,{id:Date.now(),date:new Date().toISOString().split('T')[0],warehouseItemId:prForm.warehouseItemId,itemCode:whItem.code,itemName:whItem.name,qty:requestedQty,reason:prForm.reason,requestedBy:prForm.requestedBy,approvedBy:'',status:'Pending',priority:prForm.priority,notes:`Approved (Deficit: ${deficit}, Safety: ${whItem.safetyStock})`,autoRejected:false}]);
    }
    setPrForm({warehouseItemId:0,itemCode:'',itemName:'',qty:'',reason:'',requestedBy:'',priority:'Medium',notes:''});
  };
  const approvePR = (id:number) => { setPurchaseReqs(p=>p.map(pr=>pr.id===id?{...pr,status:'Approved',approvedBy:currentUser?.username||''}:pr)); };
  const rejectPR = (id:number) => { setPurchaseReqs(p=>p.map(pr=>pr.id===id?{...pr,status:'Rejected'}:pr)); };
  const receivePR = (id:number) => { setPurchaseReqs(p=>p.map(pr=>{ if(pr.id!==id) return pr; const whItem=warehouse.find(w=>w.id===pr.warehouseItemId); if(whItem) setWarehouse(p2=>p2.map(w=>w.id===pr.warehouseItemId?{...w,currentStock:w.currentStock+pr.qty,lastUpdated:new Date().toISOString().split('T')[0]}:w)); return {...pr,status:'Received'}; })); };
  // Mixing Stations
  const saveStation = () => { if(!stForm.name) return; if(editingStId){ setStations(p=>p.map(s=>s.id===editingStId?{...s,...stForm,designCap:Number(stForm.designCap)||0,actualCap:Number(stForm.actualCap)||0}:s)); setEditingStId(null); } else setStations(p=>[...p,{id:Date.now(),...stForm,designCap:Number(stForm.designCap)||0,actualCap:Number(stForm.actualCap)||0}]); setStForm({plantId:'',name:'',productType:'concrete',operator:'',designCap:'',actualCap:'',unit:'m³/h',location:'',installDate:'',status:'Running',notes:''}); };
  const editStation = (s:MixingStation) => { setEditingStId(s.id); setStForm({plantId:s.plantId,name:s.name,productType:s.productType,operator:s.operator,designCap:String(s.designCap),actualCap:String(s.actualCap),unit:s.unit,location:s.location,installDate:s.installDate,status:s.status,notes:s.notes}); };
  const deleteStation = (id:number) => { if(confirm('Delete station?')){ setStations(p=>p.filter(s=>s.id!==id)); setPeriodicMaints(p=>p.filter(m=>m.stationId!==id)); } };
  // Periodic Maintenance
  const savePeriodicMaint = () => { if(!pmForm.stationId||!pmForm.description) return; if(editingPmId){ setPeriodicMaints(p=>p.map(m=>m.id===editingPmId?{...m,...pmForm,cost:Number(pmForm.cost)||0,stationId:Number(pmForm.stationId)}:m)); setEditingPmId(null); } else setPeriodicMaints(p=>[...p,{id:Date.now(),...pmForm,cost:Number(pmForm.cost)||0,stationId:Number(pmForm.stationId)}]); setPmForm({stationId:0,date:new Date().toISOString().split('T')[0],taskType:'Greasing',description:'',technician:'',nextDue:'',status:'Scheduled',cost:'',notes:''}); };
  const editPeriodicMaint = (pm:PeriodicMaint) => { setEditingPmId(pm.id); setPmForm({stationId:pm.stationId,date:pm.date,taskType:pm.taskType,description:pm.description,technician:pm.technician,nextDue:pm.nextDue,status:pm.status,cost:String(pm.cost),notes:pm.notes}); };
  const deletePeriodicMaint = (id:number) => { if(confirm('Delete?')) setPeriodicMaints(p=>p.filter(m=>m.id!==id)); };
  const markMaintDone = (id:number) => { setPeriodicMaints(p=>p.map(m=>m.id===id?{...m,status:'Done'}:m)); };
  const addAsset = () => { if(!assetForm.id||!assetForm.plate) return; const ex=assets.find(a=>a.id===assetForm.id); const na:Asset={...assetForm,initOdo:Number(assetForm.initOdo)||0,engHours:Number(assetForm.engHours)||0}; if(ex) setAssets(p=>p.map(a=>a.id===assetForm.id?na:a)); else setAssets(p=>[...p,na]); setAssetForm({id:'',plate:'',chassis:'',type:'Mixer',status:'Ready',driver:'',initOdo:'',engHours:'',regExpiry:'',insExpiry:'',opcardExpiry:'',authExpiry:'',gpsId:'',tare:'',gross:''}); };
  const saveConfigFn = () => { alert('Config saved!'); };

  // Filters
  const vf=(i:any)=>!reportVehicle||i.assetId===reportVehicle;
  const df=(i:any)=>(!reportFrom||i.date>=reportFrom)&&(!reportTo||i.date<=reportTo);
  const ff=fuelLogs.filter(f=>vf(f)&&df(f));
  const fo=oilLogs.filter(o=>vf(o)&&df(o));
  const fs=sparePartLogs.filter(s=>vf(s)&&df(s));
  const fb=breakdowns.filter(b=>vf(b)&&df(b));
  const totalFuelCost=ff.reduce((s,f)=>s+f.totalCost,0);
  const totalOilCost=fo.reduce((s,o)=>s+o.cost,0);
  const totalPartsCost=fs.reduce((s,p)=>s+p.totalCost,0);
  const totalRepairCost=fb.reduce((s,b)=>s+b.repairCost,0);
  const grandTotal=totalFuelCost+totalOilCost+totalPartsCost+totalRepairCost;

  // ===== CURRENCY =====
  const getCurrency = (): { symbol: string; code: string; rate: number } => {
    const c = (currentUser?.country || 'Egypt').toLowerCase();
    if (c.includes('saudi')) return { symbol: 'SAR', code: 'SAR', rate: 3.75 };
    if (c.includes('emirates')||c.includes('uae')) return { symbol: 'AED', code: 'AED', rate: 3.67 };
    if (c.includes('kuwait')) return { symbol: 'KWD', code: 'KWD', rate: 0.31 };
    if (c.includes('qatar')) return { symbol: 'QAR', code: 'QAR', rate: 3.64 };
    if (c.includes('bahrain')) return { symbol: 'BHD', code: 'BHD', rate: 0.38 };
    if (c.includes('oman')) return { symbol: 'OMR', code: 'OMR', rate: 0.38 };
    if (c.includes('jordan')) return { symbol: 'JOD', code: 'JOD', rate: 0.71 };
    if (c.includes('egypt')) return { symbol: 'EGP', code: 'EGP', rate: 50 };
    return { symbol: 'USD', code: 'USD', rate: 1 };
  };
  const cur = getCurrency();
  const fmtMoney = (usdAmount: number) => {
    const local = usdAmount * cur.rate;
    if (local >= 1000000) return `${cur.symbol} ${(local/1000000).toFixed(1)}M`;
    if (local >= 1000) return `${cur.symbol} ${local.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    return `${cur.symbol} ${local.toFixed(0)}`;
  };

  // ===== VEHICLE REPORT =====
  const factoryTargets = {
    monthlyKmTarget: parseInt(config?.fuelEffTarget || '2500') * 2000 || 5000,
    monthlyM3Target: parseInt(config?.targetProd || '12000') / (assets.filter(a=>a.status==='Ready').length || 5) || 2000,
    monthlyMaintBudget: parseInt(config?.maintBudget || '15000') / (assets.length || 5) || 3000,
  };

  let vehTrips: any[] = [], vehTotalKm = 0, vehTotalM3 = 0, vehTotalBlocks = 0, vehTotalFuel = 0, vehMaintCost = 0;
  if (reportVehicle) {
    try {
      const trips = JSON.parse(localStorage.getItem('trips_data')||localStorage.getItem('trips')||'[]');
      vehTrips = trips.filter((t:any)=>t.code===reportVehicle && (!reportFrom||t.date>=reportFrom) && (!reportTo||t.date<=reportTo));
      vehTotalM3 = vehTrips.reduce((s:number,t:any)=>s+Number(t.qty||0),0);
      vehTotalBlocks = Math.round(vehTotalM3 * 12.5);
    } catch {}
    vehTotalFuel = ff.reduce((s,f)=>s+f.liters,0);
    vehMaintCost = fb.reduce((s,b)=>s+b.repairCost,0) + fs.reduce((s,p)=>s+p.totalCost,0);
    const asset = assets.find(a=>a.id===reportVehicle);
    if (asset) vehTotalKm = asset.initOdo;
  }

  const getVehicleAlerts = () => {
    const alerts: { type: 'danger'|'warning'|'success'; icon: string; msg: string }[] = [];
    if (!reportVehicle) return alerts;
    if (vehTotalKm < factoryTargets.monthlyKmTarget * 0.5) alerts.push({ type: 'danger', icon: 'KM', msg: `Odometer below 50% target (${vehTotalKm} / ${factoryTargets.monthlyKmTarget} km)` });
    else if (vehTotalKm < factoryTargets.monthlyKmTarget * 0.8) alerts.push({ type: 'warning', icon: 'KM', msg: `Odometer under 80% target` });
    else alerts.push({ type: 'success', icon: 'KM', msg: 'Odometer target achieved' });
    if (vehTotalM3 < factoryTargets.monthlyM3Target * 0.5) alerts.push({ type: 'danger', icon: 'M3', msg: `Concrete below 50% (${vehTotalM3.toFixed(0)} / ${factoryTargets.monthlyM3Target} m3)` });
    else if (vehTotalM3 < factoryTargets.monthlyM3Target * 0.8) alerts.push({ type: 'warning', icon: 'M3', msg: `Concrete under 80% target` });
    else alerts.push({ type: 'success', icon: 'M3', msg: 'Concrete target achieved' });
    if (vehMaintCost > factoryTargets.monthlyMaintBudget * 1.5) alerts.push({ type: 'danger', icon: 'COST', msg: `Maint budget exceeded 150%! (${fmtMoney(vehMaintCost)} / ${fmtMoney(factoryTargets.monthlyMaintBudget)})` });
    else if (vehMaintCost > factoryTargets.monthlyMaintBudget) alerts.push({ type: 'warning', icon: 'COST', msg: 'Maint budget exceeded' });
    else alerts.push({ type: 'success', icon: 'COST', msg: 'Within maint budget' });
    return alerts;
  };
  const vehicleAlerts = getVehicleAlerts();

  if (!currentUser) return <div className="min-h-screen bg-[#0B111E] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">{t('accessDenied')}</p><Link to="/" className="text-sky-400 underline">{t('backToLogin')}</Link></div></div>;

  const tabs: {id:Tab;label:string}[] = [
    {id:'home',label:t('home')},{id:'fuel',label:t('fuelAndDiesel')},{id:'oil',label:t('oilAndFluids')},
    {id:'spareparts',label:t('spareParts')},{id:'breakdown',label:t('breakdownReports')},
    {id:'purchaserequests',label:t('purchaseRequests')},{id:'warehouse',label:t('warehouse')},
    {id:'vehiclereport',label:t('vehicleReport')},{id:'mixingstations',label:'🏭 محطات الخلط'},{id:'config',label:t('fleetSettings')},{id:'reports',label:t('reports')},
  ];

  const sevColor = (s: string) => s==='Critical'?'bg-red-600':s==='Major'?'bg-orange-500':'bg-yellow-500 text-slate-900';

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div><h1 className="text-xl font-black tracking-tight text-white">{t('fleetMaintenanceManager')}</h1><p className="text-xs text-slate-400">{t('workshopSubtitle')}</p></div>
        <div className="flex gap-3 items-center flex-wrap">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-3 py-2 rounded hover:text-white hover:bg-white/[0.06] transition">{t('backToDashboard')}</Link>
          <QuickJump />
          <LangSelector />
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">{currentUser.plantName}</span>
        </div>
      </div>
      {openBDs.length>0 && (<div className="bg-red-900/40 border-b border-red-500/40 px-6 py-2.5"><p className="text-sm text-red-300 font-bold">{openBDs.length} Open Breakdowns - vehicles out of service</p></div>)}

      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-1 p-2 max-w-6xl mx-auto">
        {tabs.map(tb=>(<button key={tb.id} onClick={()=>setTab(tb.id)} className={`py-2 px-1 rounded-lg font-bold text-[10px] transition text-center ${tab===tb.id?'bg-sky-500/15 text-sky-300 border border-sky-500/40':'bg-white/[0.03] text-slate-400 border border-white/10 hover:text-sky-300 hover:bg-white/[0.06]'}`}>{tb.label}</button>))}
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-8">
        {/* HOME */}
        {tab==='home'&&(<div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[{label:t('totalAssets'),value:assets.length,color:'border-sky-500'},{label:t('readyForOperation'),value:activeAssets,color:'border-emerald-500'},{label:t('inWorkshop'),value:workshopAssets,color:'border-yellow-500'},{label:t('openBreakdowns'),value:openBDs.length,color:'border-red-500'},{label:t('maintenanceCosts'),value:fmtMoney(totalRepairCost),color:'border-sky-500'}].map(k=>(<div key={k.label} className={`bg-white/[0.04] border-l-4 ${k.color} rounded-lg p-4`}><p className="text-[10px] text-slate-400">{k.label}</p><p className="text-xl font-bold text-white">{k.value}</p></div>))}</div>

          {/* Workshop Duration */}
          {openBDs.length > 0 && (<div className={`rounded-xl p-5 border-2 mb-6 ${criticalOverdue.length>0?'bg-red-950/60 border-red-500 animate-pulse':overdueBreakdowns.length>0?'bg-yellow-950/40 border-yellow-500':'bg-white/[0.04] border-white/10'}`}>
            <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-white">Workshop Duration Report</h3><span className="text-xs text-slate-400">{new Date().toLocaleTimeString()}</span></div>
            {criticalOverdue.length>0&&<div className="bg-red-600/20 border border-red-400/50 rounded-lg p-3 mb-4 animate-pulse"><p className="text-red-300 font-bold text-sm">{criticalOverdue.length} vehicles over 24h in workshop!</p></div>}
            {overdueBreakdowns.length>0&&criticalOverdue.length===0&&<div className="bg-yellow-500/10 border border-yellow-400/30 rounded-lg p-3 mb-4"><p className="text-yellow-300 font-bold text-sm">{overdueBreakdowns.length} vehicles over 12h since breakdown report</p></div>}
            <div className="overflow-x-auto"><table className="w-full text-sm text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-xs"><tr><th className="p-3">Vehicle</th><th className="p-3">Entry Date</th><th className="p-3">Duration</th><th className="p-3">12h Blocks</th><th className="p-3">Status</th><th className="p-3">Alert</th></tr></thead><tbody>{openBDs.map(b=>{const dur=calcWorkshopDuration(b);const rowBg=dur.totalHours>24?'bg-red-500/10':dur.totalHours>12?'bg-yellow-500/5':'';return(<tr key={b.id} className={`border-b border-white/10 ${rowBg} ${dur.totalHours>24?'animate-pulse':''}`}><td className="p-3 font-bold text-lg">{b.assetId}</td><td className="p-3"><span className="text-white font-semibold">{b.date}</span></td><td className="p-3"><span className={`text-lg font-bold ${dur.totalHours>24?'text-red-400':dur.totalHours>12?'text-yellow-400':'text-emerald-400'}`}>{dur.days>0?`${dur.days}d `:''}{dur.hours}h</span></td><td className="p-3"><div className="flex gap-0.5 flex-wrap">{Array.from({length:Math.min(dur.blocks12h,8)}).map((_,i)=>(<span key={i} className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold ${i<2?'bg-emerald-500/60':i<4?'bg-yellow-500/60 text-slate-900':'bg-red-500/80 animate-pulse'}`}>{i+1}</span>))}{dur.blocks12h===0&&<span className="text-emerald-400 font-bold text-xs">Under 12h</span>}</div></td><td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold ${b.status==='Open'?'bg-red-500/80':'bg-yellow-500/80'} text-white`}>{b.status}</span></td><td className="p-3">{dur.totalHours>24?<span className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold animate-pulse block text-center">24h+</span>:dur.totalHours>12?<span className="bg-yellow-500 text-slate-900 px-3 py-1.5 rounded-lg text-xs font-bold block text-center">12h Alert</span>:<span className="bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-bold block text-center">OK</span>}</td></tr>)})}</tbody></table></div>
            <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap justify-between items-center text-xs text-slate-400 gap-2"><span>Total: <b className="text-white">{openBDs.length}</b></span><span>Normal: <b className="text-emerald-400">{openBDs.length-overdueBreakdowns.length}</b></span><span>Over 12h: <b className="text-yellow-400">{overdueBreakdowns.length-criticalOverdue.length}</b></span><span>Critical 24h+: <b className="text-red-400">{criticalOverdue.length}</b></span><button onClick={()=>window.print()} className="bg-sky-600 text-white px-3 py-1 rounded font-bold hover:bg-sky-700">Print</button></div>
          </div>)}

          {/* Open Breakdowns */}
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5"><h3 className="text-lg font-bold text-red-400 mb-4">{t('openBreakdownsList')}</h3>{openBDs.length===0?<p className="text-slate-500 text-center py-8">{t('noOpenBreakdowns')}</p>:<div className="overflow-x-auto"><table className="w-full text-sm text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-xs"><tr><th className="p-3">{t('date')}</th><th className="p-3">{t('vehicle')}</th><th className="p-3">{t('symptom')}</th><th className="p-3">{t('severity')}</th><th className="p-3">{t('status')}</th><th className="p-3">{t('mechanic')}</th><th className="p-3">{t('actions')}</th></tr></thead><tbody>{openBDs.map(b=>(<tr key={b.id} className="border-b border-white/10"><td className="p-3">{b.date}</td><td className="p-3 font-bold">{b.assetId}</td><td className="p-3">{b.symptom}</td><td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${sevColor(b.severity)}`}>{b.severity}</span></td><td className="p-3"><span className="text-yellow-400 font-bold">{b.status==='Open'?'Open':b.status==='In Repair'?'In Repair':'Done'}</span></td><td className="p-3">{b.mechanicAssigned||'-'}</td><td className="p-3 flex gap-1"><button onClick={()=>editBD(b)} className="bg-sky-500 text-white text-xs px-2 py-1 rounded">{t('edit')}</button><button onClick={()=>resolveBD(b.id)} className="bg-emerald-600 text-white text-xs px-2 py-1 rounded">Fix</button></td></tr>))}</tbody></table></div>}</div>

          {/* Fleet Overview */}
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5"><h3 className="text-lg font-bold text-sky-400 mb-4">{t('fleetOverview')}</h3><div className="overflow-x-auto"><table className="w-full text-sm text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-xs uppercase"><tr><th className="p-3">{t('vehicleCode')}</th><th className="p-3">{t('plateNumber')}</th><th className="p-3">{t('assetType')}</th><th className="p-3">{t('driverName')}</th><th className="p-3">{t('currentOdometer')}</th><th className="p-3">{t('status')}</th></tr></thead><tbody>{assets.map(a=>{const hasBD=openBDs.some(b=>b.assetId===a.id);return(<tr key={a.id} className="border-b border-white/10"><td className="p-3 font-bold">{a.id}</td><td className="p-3">{a.plate}</td><td className="p-3">{a.type}</td><td className="p-3">{a.driver||'-'}</td><td className="p-3">{a.initOdo} km</td><td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${hasBD||a.status==='Workshop'?'bg-yellow-500/80 text-white':a.status==='Ready'?'bg-emerald-500/80 text-white':'bg-red-500/80 text-white'}`}>{hasBD?'In Workshop':a.status}</span></td></tr>);})}</tbody></table></div></div>
        </div>)}

        {/* FUEL */}
        {tab==='fuel'&&(<div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-bold text-yellow-400 mb-4">{t('recordFuel')}</h3><form onSubmit={addFuelLog} className="space-y-3">
            <DatePicker value={fuelForm.date} onChange={val=>setFuelForm({...fuelForm,date:val})} label={t('date')} required />
            <div><label className="text-xs text-slate-400 font-semibold">{t('vehicle')}</label><div className="flex gap-1.5"><select value={fuelForm.assetId} onChange={e=>setFuelForm({...fuelForm,assetId:e.target.value})} className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required><option value="">{t('selectVehicle')}</option>{assets.map(a=><option key={a.id} value={a.id}>{a.id} - {a.plate}</option>)}</select><button type="button" onClick={()=>fuelForm.assetId&&fetchVehicleData(fuelForm.assetId)} disabled={!fuelForm.assetId} className="bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 text-white text-[10px] px-2 py-1.5 rounded-lg font-bold">Get</button></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('currentOdometer')}</label><input type="number" value={fuelForm.odoReading} onChange={e=>setFuelForm({...fuelForm,odoReading:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div><div><label className="text-xs text-slate-400 font-semibold">{t('fuelType')}</label><select value={fuelForm.fuelType} onChange={e=>setFuelForm({...fuelForm,fuelType:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option>Diesel</option><option>Gasoline 92</option><option>Gasoline 95</option></select></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('liters')}</label><input type="number" step="0.01" value={fuelForm.liters} onChange={e=>setFuelForm({...fuelForm,liters:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required/></div><div><label className="text-xs text-slate-400 font-semibold">{t('costPerLiter')}</label><input type="number" step="0.01" value={fuelForm.costPerLiter} onChange={e=>setFuelForm({...fuelForm,costPerLiter:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('station')}</label><input value={fuelForm.station} onChange={e=>setFuelForm({...fuelForm,station:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div><div><label className="text-xs text-slate-400 font-semibold">{t('invoice')}</label><input value={fuelForm.invoice} onChange={e=>setFuelForm({...fuelForm,invoice:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div></div>
            <button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-bold py-3 rounded-lg">{t('save')}</button>
          </form></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-black tracking-tight text-white mb-4">{t('fuelLog')} ({fuelLogs.length})</h3><div className="overflow-x-auto"><table className="w-full text-xs text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">{t('date')}</th><th className="p-2">{t('vehicle')}</th><th className="p-2">{t('currentOdometer')}</th><th className="p-2">{t('liters')}</th><th className="p-2">{t('totalCost')}</th></tr></thead><tbody>{fuelLogs.slice(-20).reverse().map(f=><tr key={f.id} className="border-b border-white/10"><td className="p-2">{f.date}</td><td className="p-2 font-bold">{f.assetId}</td><td className="p-2">{f.odoReading}</td><td className="p-2">{f.liters}</td><td className="p-2 font-bold text-yellow-400">{fmtMoney(f.totalCost)}</td></tr>)}</tbody></table></div></div>
        </div>)}

        {/* OIL */}
        {tab==='oil'&&(<div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-bold text-sky-400 mb-4">{t('recordOil')}</h3><form onSubmit={addOilLog} className="space-y-3">
            <DatePicker value={oilForm.date} onChange={val=>setOilForm({...oilForm,date:val})} label={t('date')} required />
            <div><label className="text-xs text-slate-400 font-semibold">{t('vehicle')}</label><div className="flex gap-1.5"><select value={oilForm.assetId} onChange={e=>setOilForm({...oilForm,assetId:e.target.value})} className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required><option value="">{t('selectVehicle')}</option>{assets.map(a=><option key={a.id} value={a.id}>{a.id} - {a.plate}</option>)}</select><button type="button" onClick={()=>oilForm.assetId&&fetchVehicleData(oilForm.assetId)} disabled={!oilForm.assetId} className="bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 text-white text-[10px] px-2 py-1.5 rounded-lg font-bold">Get</button></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('oilType')}</label><select value={oilForm.oilType} onChange={e=>setOilForm({...oilForm,oilType:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option>Engine Oil</option><option>Hydraulic Oil</option><option>Gear Oil</option><option>Transmission Oil</option><option>Brake Fluid</option><option>Coolant</option></select></div><div><label className="text-xs text-slate-400 font-semibold">{t('brand')}</label><input value={oilForm.brand} onChange={e=>setOilForm({...oilForm,brand:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('quantity')}</label><input type="number" step="0.1" value={oilForm.quantity} onChange={e=>setOilForm({...oilForm,quantity:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required/></div><div><label className="text-xs text-slate-400 font-semibold">{t('totalCost')}</label><input type="number" step="0.01" value={oilForm.cost} onChange={e=>setOilForm({...oilForm,cost:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div></div>
            <button type="submit" className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg">{t('save')}</button>
          </form></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-black tracking-tight text-white mb-4">{t('oilLog')} ({oilLogs.length})</h3><div className="overflow-x-auto"><table className="w-full text-xs text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">{t('date')}</th><th className="p-2">{t('vehicle')}</th><th className="p-2">{t('oilType')}</th><th className="p-2">{t('quantity')}</th><th className="p-2">{t('totalCost')}</th></tr></thead><tbody>{oilLogs.slice(-20).reverse().map(o=><tr key={o.id} className="border-b border-white/10"><td className="p-2">{o.date}</td><td className="p-2 font-bold">{o.assetId}</td><td className="p-2">{o.oilType}</td><td className="p-2">{o.quantity} {o.unit}</td><td className="p-2 font-bold text-sky-400">{fmtMoney(o.cost)}</td></tr>)}</tbody></table></div></div>
        </div>)}

        {/* SPARE PARTS */}
        {tab==='spareparts'&&(<div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-bold text-sky-400 mb-4">{t('spareParts')}</h3><form onSubmit={addSparePart} className="space-y-3">
            <DatePicker value={spForm.date} onChange={val=>setSpForm({...spForm,date:val})} label={t('date')} required />
            <div><label className="text-xs text-slate-400 font-semibold">{t('vehicle')}</label><div className="flex gap-1.5"><select value={spForm.assetId} onChange={e=>setSpForm({...spForm,assetId:e.target.value})} className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required><option value="">{t('selectVehicle')}</option>{assets.map(a=><option key={a.id} value={a.id}>{a.id} - {a.plate}</option>)}</select><button type="button" onClick={()=>spForm.assetId&&fetchVehicleData(spForm.assetId)} disabled={!spForm.assetId} className="bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 text-white text-[10px] px-2 py-1.5 rounded-lg font-bold">Get</button></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('partName')}</label><input value={spForm.partName} onChange={e=>setSpForm({...spForm,partName:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required/></div><div><label className="text-xs text-slate-400 font-semibold">{t('partNumber')}</label><input value={spForm.partNumber} onChange={e=>setSpForm({...spForm,partNumber:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('quantity')}</label><input type="number" value={spForm.quantity} onChange={e=>setSpForm({...spForm,quantity:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div><div><label className="text-xs text-slate-400 font-semibold">{t('unitCost')}</label><input type="number" step="0.01" value={spForm.unitCost} onChange={e=>setSpForm({...spForm,unitCost:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div></div>
            <button type="submit" className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg">{t('save')}</button>
          </form></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-black tracking-tight text-white mb-4">{t('spareParts')} ({sparePartLogs.length})</h3><div className="overflow-x-auto"><table className="w-full text-xs text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">{t('date')}</th><th className="p-2">{t('vehicle')}</th><th className="p-2">{t('partName')}</th><th className="p-2">{t('totalCost')}</th></tr></thead><tbody>{sparePartLogs.slice(-20).reverse().map(s=><tr key={s.id} className="border-b border-white/10"><td className="p-2">{s.date}</td><td className="p-2 font-bold">{s.assetId}</td><td className="p-2">{s.partName}</td><td className="p-2 font-bold text-sky-400">{fmtMoney(s.totalCost)}</td></tr>)}</tbody></table></div></div>
        </div>)}

        {/* BREAKDOWN */}
        {tab==='breakdown'&&(<div className="grid grid-cols-1 lg:grid-cols-[480px_1fr] gap-6">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-bold text-red-400 mb-4">{editingBdId?'Edit':'New'} Breakdown</h3><form onSubmit={submitBD} className="space-y-3">
            <DatePicker value={bdForm.date} onChange={val=>setBdForm({...bdForm,date:val})} label={t('breakdownDate')} required />
            <div><label className="text-xs text-slate-400 font-semibold">{t('vehicle')}</label><div className="flex gap-1.5"><select value={bdForm.assetId} onChange={e=>setBdForm({...bdForm,assetId:e.target.value})} className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required><option value="">{t('selectVehicle')}</option>{assets.map(a=><option key={a.id} value={a.id}>{a.id} - {a.plate}</option>)}</select><button type="button" onClick={()=>bdForm.assetId&&fetchVehicleData(bdForm.assetId)} disabled={!bdForm.assetId} className="bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 text-white text-[10px] px-2 py-1.5 rounded-lg font-bold">Get</button></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('reporter')}</label><input value={bdForm.reportedBy} onChange={e=>setBdForm({...bdForm,reportedBy:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required/></div><div><label className="text-xs text-slate-400 font-semibold">{t('severity')}</label><select value={bdForm.severity} onChange={e=>setBdForm({...bdForm,severity:e.target.value as any})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option value="Critical">Critical</option><option value="Major">Major</option><option value="Minor">Minor</option></select></div></div>
            <div><label className="text-xs text-slate-400 font-semibold">{t('symptom')}</label><textarea value={bdForm.symptom} onChange={e=>setBdForm({...bdForm,symptom:e.target.value})} rows={3} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm resize-none" required/></div>
            {editingBdId&&(<div className="border-t border-white/10 pt-4 mt-4 space-y-3"><h4 className="text-sm font-bold text-yellow-400">Repair Details</h4><div><label className="text-xs text-slate-400 font-semibold">{t('mechanic')}</label><input value={bdForm.mechanicAssigned} onChange={e=>setBdForm({...bdForm,mechanicAssigned:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div><div className="grid grid-cols-2 gap-3"><DatePicker value={bdForm.repairStart} onChange={val=>setBdForm({...bdForm,repairStart:val})} label={t('repairStart')} /><DatePicker value={bdForm.repairEnd} onChange={val=>setBdForm({...bdForm,repairEnd:val})} label={t('repairEnd')} /></div><div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('partsUsed')}</label><input value={bdForm.partsUsed} onChange={e=>setBdForm({...bdForm,partsUsed:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div><div><label className="text-xs text-slate-400 font-semibold">{t('repairCost')}</label><input type="number" step="0.01" value={bdForm.repairCost} onChange={e=>setBdForm({...bdForm,repairCost:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div></div></div>)}
            <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg">{editingBdId?t('save'):t('submit')}</button>
            {editingBdId&&<button type="button" onClick={()=>{setEditingBdId(null);setBdForm({date:new Date().toISOString().split('T')[0],assetId:'',reportedBy:'',symptom:'',severity:'Major',mechanicAssigned:'',repairStart:'',repairEnd:'',repairDesc:'',partsUsed:'',repairCost:'',notes:''});}} className="w-full bg-white/[0.06] text-white font-bold py-2 rounded-lg text-sm">{t('cancel')}</button>}
          </form></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-black tracking-tight text-white mb-4">{t('breakdownsReport')} ({breakdowns.length})</h3><div className="overflow-x-auto"><table className="w-full text-xs text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">{t('date')}</th><th className="p-2">{t('vehicle')}</th><th className="p-2">{t('symptom')}</th><th className="p-2">{t('severity')}</th><th className="p-2">{t('status')}</th><th className="p-2">{t('repairCost')}</th><th className="p-2">{t('actions')}</th></tr></thead><tbody>{breakdowns.slice(-30).reverse().map(b=>(<tr key={b.id} className={`border-b border-white/10 ${b.status==='Open'?'bg-red-500/5':''}`}><td className="p-2">{b.date}</td><td className="p-2 font-bold">{b.assetId}</td><td className="p-2 max-w-[100px] truncate">{b.symptom}</td><td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sevColor(b.severity)}`}>{b.severity}</span></td><td className="p-2 font-bold">{b.status}</td><td className="p-2">{fmtMoney(b.repairCost)}</td><td className="p-2 flex gap-1"><button onClick={()=>editBD(b)} className="bg-sky-500 text-white text-[10px] px-1.5 py-0.5 rounded">{t('edit')}</button>{b.status!=='Resolved'&&<button onClick={()=>resolveBD(b.id)} className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded">Fix</button>}<button onClick={()=>deleteBD(b.id)} className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded">{t('delete')}</button></td></tr>))}</tbody></table></div></div>
        </div>)}

        {/* WAREHOUSE */}
        {tab==='warehouse'&&(<div className="grid grid-cols-1 lg:grid-cols-[450px_1fr] gap-6">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-bold text-emerald-400 mb-4">{editingWhId?t('editWarehouseItem'):t('addWarehouseItem')}</h3><div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('itemCode')}</label><input value={whForm.code} onChange={e=>setWhForm({...whForm,code:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required/></div><div><label className="text-xs text-slate-400 font-semibold">{t('itemName')}</label><input value={whForm.name} onChange={e=>setWhForm({...whForm,name:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required/></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('itemCategory')}</label><select value={whForm.category} onChange={e=>setWhForm({...whForm,category:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option>Mechanical</option><option>Electrical</option><option>Hydraulic</option><option>Pneumatic</option><option>Tires</option><option>Filters</option><option>Oils</option></select></div><div><label className="text-xs text-slate-400 font-semibold">{t('unit')}</label><select value={whForm.unit} onChange={e=>setWhForm({...whForm,unit:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option>Piece</option><option>Liter</option><option>Kg</option><option>Meter</option><option>Set</option></select></div></div>
            <div className="grid grid-cols-4 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('currentStock')}</label><input type="number" value={whForm.currentStock} onChange={e=>setWhForm({...whForm,currentStock:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div><div><label className="text-xs text-slate-400 font-semibold">{t('minStockLevel')}</label><input type="number" value={whForm.minStock} onChange={e=>setWhForm({...whForm,minStock:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div><div><label className="text-xs text-slate-400 font-semibold">🛡️ Safety Stock</label><input type="number" value={whForm.safetyStock} onChange={e=>setWhForm({...whForm,safetyStock:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" placeholder="احتياطي"/></div><div><label className="text-xs text-slate-400 font-semibold">{t('unitCost')}</label><input type="number" step="0.01" value={whForm.unitCost} onChange={e=>setWhForm({...whForm,unitCost:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('supplier')}</label><input value={whForm.supplier} onChange={e=>setWhForm({...whForm,supplier:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div><div><label className="text-xs text-slate-400 font-semibold">{t('location')}</label><input value={whForm.location} onChange={e=>setWhForm({...whForm,location:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div></div>
            <button onClick={addWhItem} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg">{editingWhId?t('save'):t('addWarehouseItem')}</button>
            {editingWhId&&<button onClick={()=>{setEditingWhId(null);setWhForm({code:'',name:'',category:'Mechanical',currentStock:'',minStock:'',safetyStock:'',unit:'Piece',unitCost:'',supplier:'',location:'',notes:''});}} className="w-full bg-white/[0.06] text-white font-bold py-2 rounded-lg text-sm">{t('cancel')}</button>}
          </div></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-black tracking-tight text-white mb-4">{t('warehouseInventory')} ({warehouse.length})</h3>
            {warehouse.filter(w=>w.currentStock<=w.safetyStock&&w.safetyStock>0).length>0&&(<div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-xs text-red-400 font-bold">🚨 CRITICAL: {warehouse.filter(w=>w.currentStock<=w.safetyStock&&w.safetyStock>0).length} items below Safety Stock level!</div>)}
            {warehouse.filter(w=>w.currentStock<=w.minStock&&w.currentStock>w.safetyStock&&w.currentStock>0).length>0&&(<div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 text-xs text-yellow-400 font-bold">⚠️ Low Stock Alert: {warehouse.filter(w=>w.currentStock<=w.minStock&&w.currentStock>w.safetyStock&&w.currentStock>0).length} items</div>)}
            <div className="overflow-x-auto"><table className="w-full text-xs text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">{t('itemCode')}</th><th className="p-2">{t('itemName')}</th><th className="p-2">{t('currentStock')}</th><th className="p-2">🛡️ Safety</th><th className="p-2">{t('minStockLevel')}</th><th className="p-2">{t('unitCost')}</th><th className="p-2">{t('actions')}</th></tr></thead><tbody>{warehouse.map(w=>{const low=w.currentStock<=w.minStock;const belowSafety=w.currentStock<=w.safetyStock&&w.safetyStock>0;const out=w.currentStock===0;return(<tr key={w.id} className={`border-b border-white/10 ${belowSafety?'bg-orange-500/5':low?'bg-yellow-500/5':''}`}><td className="p-2 font-bold">{w.code}</td><td className="p-2">{w.name}</td><td className={`p-2 font-bold ${out?'text-red-400':belowSafety?'text-orange-400':low?'text-yellow-400':'text-emerald-400'}`}>{w.currentStock}</td><td className="p-2 font-semibold text-sky-400">{w.safetyStock||0}</td><td className="p-2">{w.minStock}</td><td className="p-2">{fmtMoney(w.unitCost)}</td><td className="p-2 flex gap-1"><button onClick={()=>editWhItem(w)} className="bg-sky-500 text-white text-[10px] px-1.5 py-0.5 rounded">{t('edit')}</button><button onClick={()=>deleteWhItem(w.id)} className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded">{t('delete')}</button></td></tr>);})}</tbody></table></div></div>
        </div>)}

        {/* PURCHASE REQUESTS */}
        {tab==='purchaserequests'&&(<div className="grid grid-cols-1 lg:grid-cols-[450px_1fr] gap-6">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-bold text-orange-400 mb-4">{t('newPurchaseRequest')}</h3><div className="space-y-3">
            <div><label className="text-xs text-slate-400 font-semibold">{t('warehouseInventory')}</label><select value={prForm.warehouseItemId} onChange={e=>{const id=parseInt(e.target.value);const w=warehouse.find(x=>x.id===id);setPrForm({...prForm,warehouseItemId:id,itemCode:w?.code||'',itemName:w?.name||''});}} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option value="0">-- Select --</option>{warehouse.map(w=><option key={w.id} value={w.id}>{w.code} - {w.name} (Stock: {w.currentStock})</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-semibold">{t('requestQty')}</label><input type="number" value={prForm.qty} onChange={e=>setPrForm({...prForm,qty:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required/></div><div><label className="text-xs text-slate-400 font-semibold">{t('priority')}</label><select value={prForm.priority} onChange={e=>setPrForm({...prForm,priority:e.target.value as any})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option value="High">{t('high')}</option><option value="Medium">{t('medium')}</option><option value="Low">{t('low')}</option></select></div></div>
            <div><label className="text-xs text-slate-400 font-semibold">{t('requestedBy')}</label><input value={prForm.requestedBy} onChange={e=>setPrForm({...prForm,requestedBy:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required/></div>
            <button onClick={addPurchaseReq} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg">{t('submit')}</button>
          </div></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-black tracking-tight text-white mb-4">{t('purchaseRequestsList')} ({purchaseReqs.length})</h3><div className="overflow-x-auto"><table className="w-full text-xs text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">{t('date')}</th><th className="p-2">{t('itemName')}</th><th className="p-2">{t('requestQty')}</th><th className="p-2">{t('priority')}</th><th className="p-2">{t('requestStatus')}</th><th className="p-2">{t('actions')}</th></tr></thead><tbody>{purchaseReqs.slice(-20).reverse().map(pr=>{const sc:Record<string,string>={Pending:'text-yellow-400',Approved:'text-emerald-400',Rejected:'text-red-400',Received:'text-sky-400'};return(<tr key={pr.id} className={`border-b border-white/10 ${pr.autoRejected?'bg-red-500/5':''}`}><td className="p-2">{pr.date}</td><td className="p-2 font-bold">{pr.itemCode} - {pr.itemName}</td><td className="p-2">{pr.qty}</td><td className="p-2">{pr.priority}</td><td className={`p-2 font-bold ${sc[pr.status]}`}>{pr.status}</td><td className="p-2 flex gap-1">{pr.status==='Pending'&&<><button onClick={()=>approvePR(pr.id)} className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded">Approve</button><button onClick={()=>rejectPR(pr.id)} className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded">Reject</button></>}{pr.status==='Approved'&&<button onClick={()=>receivePR(pr.id)} className="bg-sky-500 text-white text-[10px] px-1.5 py-0.5 rounded">Receive</button>}</td></tr>);})}</tbody></table></div></div>
        </div>)}

        {/* ===== VEHICLE REPORT WITH TARGETS & ALERTS ===== */}
        {tab==='vehiclereport'&&(<div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
          <h3 className="text-lg font-bold text-cyan-400 mb-4">{t('vehicleServiceReport')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <div><label className="text-xs text-slate-400 font-semibold">{t('vehicle')}</label><select value={reportVehicle} onChange={e=>setReportVehicle(e.target.value)} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option value="">{t('selectVehicleReport')}</option>{assets.map(a=><option key={a.id} value={a.id}>{a.id} - {a.plate}</option>)}</select></div>
              <DatePicker value={reportFrom} onChange={setReportFrom} label={t('from')} />
              <DatePicker value={reportTo} onChange={setReportTo} label={t('to')} />
            </div>

          {reportVehicle&&(<>
            {/* Factory Targets card */}
            <div className="bg-[#0B111E] border border-white/10 rounded-lg p-4 mb-6">
              <h4 className="text-xs font-bold text-sky-400 mb-3">Factory Targets (from Settings) - Currency: {cur.symbol} ({cur.code})</h4>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-white/[0.04] rounded-lg p-3 text-center"><p className="text-slate-400">KM Target</p><p className="text-lg font-bold text-sky-400">{factoryTargets.monthlyKmTarget} km</p></div>
                <div className="bg-white/[0.04] rounded-lg p-3 text-center"><p className="text-slate-400">Concrete Target</p><p className="text-lg font-bold text-emerald-400">{factoryTargets.monthlyM3Target} m3</p></div>
                <div className="bg-white/[0.04] rounded-lg p-3 text-center"><p className="text-slate-400">Maint Budget</p><p className="text-lg font-bold text-sky-400">{fmtMoney(factoryTargets.monthlyMaintBudget)}</p></div>
              </div>
            </div>

            {/* Alerts */}
            <div className="mb-6 space-y-2">
              <h4 className="text-xs font-bold text-slate-400 mb-2">Performance vs Targets</h4>
              {vehicleAlerts.map((a,i)=>(
                <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${
                  a.type==='danger'?'bg-red-500/10 border border-red-500/30 text-red-300':
                  a.type==='warning'?'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300':
                  'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                }`}>
                  <span className="text-lg">{a.type==='danger'?'\u{1F6A8}':a.type==='warning'?'\u26A0\uFE0F':'\u2705'}</span>
                  <span className="font-bold text-xs px-2 py-0.5 rounded bg-white/10">{a.icon}</span>
                  <span>{a.msg}</span>
                </div>
              ))}
              {vehicleAlerts.length===0 && <p className="text-slate-500 text-sm">No vehicle selected</p>}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { label: t('totalKmDriven'), value: vehTotalKm+' km', target: factoryTargets.monthlyKmTarget+' km', pct: Math.min(100,(vehTotalKm/factoryTargets.monthlyKmTarget)*100), color: 'border-sky-500' },
                { label: t('totalConcretePoured'), value: vehTotalM3.toFixed(0)+' m3', target: factoryTargets.monthlyM3Target+' m3', pct: Math.min(100,(vehTotalM3/factoryTargets.monthlyM3Target)*100), color: 'border-emerald-500' },
                { label: t('totalBlocksDelivered'), value: vehTotalBlocks+' Blocks', target: '', pct: 0, color: 'border-sky-500' },
                { label: t('totalTrips'), value: vehTrips.length, target: '', pct: 0, color: 'border-yellow-500' },
                { label: t('totalFuelConsumed'), value: vehTotalFuel.toFixed(0)+' L', target: '', pct: 0, color: 'border-orange-500' },
                { label: t('avgFuelEfficiency'), value: vehTotalFuel>0?(vehTotalKm/vehTotalFuel).toFixed(1)+' km/L':'-', target: '', pct: 0, color: 'border-cyan-500' },
                { label: t('totalMaintenanceCost'), value: fmtMoney(vehMaintCost), target: fmtMoney(factoryTargets.monthlyMaintBudget), pct: Math.min(100,(vehMaintCost/factoryTargets.monthlyMaintBudget)*100), color: 'border-red-500' },
                { label: t('lastServiceDate'), value: oilLogs.filter(o=>o.assetId===reportVehicle).slice(-1)[0]?.date||'-', target: '', pct: 0, color: 'border-teal-500' },
              ].map(k=>(
                <div key={k.label} className={`bg-[#0B111E] border-l-4 ${k.color} rounded-lg p-4`}>
                  <p className="text-[10px] text-slate-400">{k.label}</p>
                  <p className="text-lg font-bold text-white">{k.value}</p>
                  {k.target && (
                    <div className="mt-2">
                      <div className="flex justify-between text-[9px] text-slate-500 mb-0.5"><span>Target: {k.target}</span><span>{k.pct.toFixed(0)}%</span></div>
                      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${k.pct>=100?'bg-emerald-500':k.pct>=50?'bg-yellow-500':'bg-red-500'}`} style={{width:k.pct+'%'}}/>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {vehTrips.length>0 && (<>
            <h4 className="text-sm font-bold text-slate-400 mb-2">{t('serviceHistory')}</h4>
            <div className="overflow-x-auto"><table className="w-full text-xs text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">{t('date')}</th><th className="p-2">{t('loadQty')}</th><th className="p-2">{t('siteName')}</th><th className="p-2">{t('projectName')}</th><th className="p-2">{t('status')}</th></tr></thead><tbody>{vehTrips.slice(-20).reverse().map((trip:any,i:number)=><tr key={i} className="border-b border-white/10"><td className="p-2">{trip.date}</td><td className="p-2 font-bold text-emerald-400">{trip.qty} m3</td><td className="p-2">{trip.siteName}</td><td className="p-2">{trip.projectName}</td><td className="p-2"><span className="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[10px]">{trip.status}</span></td></tr>)}</tbody></table></div>
            </>)}
          </>)}

          {!reportVehicle&&<p className="text-slate-500 text-center py-8">{t('selectVehicleReport')}</p>}
        </div>)}

        {/* ===== MIXING STATIONS & PERIODIC MAINTENANCE ===== */}
        {tab==='mixingstations'&&(<div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Total Stations', value: stations.length, color: 'border-sky-500' },
              { label: 'Running', value: stations.filter(s=>s.status==='Running').length, color: 'border-emerald-500' },
              { label: 'Maintenance', value: stations.filter(s=>s.status==='Maintenance').length, color: 'border-yellow-500' },
              { label: 'Overdue Tasks', value: periodicMaints.filter(m=>m.status==='Overdue').length, color: 'border-red-500' },
              { label: 'Avg Efficiency', value: (stations.reduce((s,st)=>s+(st.actualCap/(st.designCap||1))*100,0)/(stations.length||1)).toFixed(0)+'%', color: 'border-sky-500' },
            ].map(k=>(<div key={k.label} className={`bg-white/[0.04] border-l-4 ${k.color} rounded-lg p-4`}><p className="text-[10px] text-slate-400">{k.label}</p><p className="text-xl font-bold text-white">{k.value}</p></div>))}
          </div>

          {/* Register Station */}
          <div className="grid grid-cols-1 lg:grid-cols-[480px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-bold text-cyan-400 mb-4">{editingStId?'Edit Station':'Register Mixing/Block Station'}</h3>
              <div className="space-y-3">
                <div><label className="text-xs text-slate-400 font-semibold">Station Name / اسم المحطة</label><input value={stForm.name} onChange={e=>setStForm({...stForm,name:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" placeholder="محطة الخلط المركزية" required/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">Product Type / نوع المنتج</label><select value={stForm.productType} onChange={e=>setStForm({...stForm,productType:e.target.value as any,unit:e.target.value==='blocks'?'Blocks/day':'m³/h'})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option value="concrete">🏗️ Concrete (خرسانة)</option><option value="blocks">🧱 Blocks (بلوك)</option><option value="both">🔄 Both (خرسانة + بلوك)</option></select></div>
                  <div><label className="text-xs text-slate-400 font-semibold">Operator / المشغل</label><input value={stForm.operator} onChange={e=>setStForm({...stForm,operator:e.target.value})} placeholder="اسم المشغل" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">Status / الحالة</label><select value={stForm.status} onChange={e=>setStForm({...stForm,status:e.target.value as any})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option value="Running">🟢 Running (قيد التشغيل)</option><option value="Maintenance">🟡 Maintenance (صيانة)</option><option value="Stopped">🔴 Stopped (متوقفة)</option></select></div>
                  <div><label className="text-xs text-slate-400 font-semibold">Unit / الوحدة</label><select value={stForm.unit} onChange={e=>setStForm({...stForm,unit:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option>m³/h</option><option>m³/day</option><option>Blocks/day</option><option>Blocks/h</option><option>Ton/h</option></select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">Design Capacity / الإنتاجية التصميمية</label><input type="number" value={stForm.designCap} onChange={e=>setStForm({...stForm,designCap:e.target.value})} placeholder="120" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required/></div>
                  <div><label className="text-xs text-slate-400 font-semibold">Actual Capacity / الإنتاجية الواقعية</label><input type="number" value={stForm.actualCap} onChange={e=>setStForm({...stForm,actualCap:e.target.value})} placeholder="70" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required/></div>
                </div>
                <DatePicker value={stForm.installDate} onChange={val=>setStForm({...stForm,installDate:val})} label="Install Date / تاريخ التركيب" />
                <div><label className="text-xs text-slate-400 font-semibold">Location / الموقع</label><input value={stForm.location} onChange={e=>setStForm({...stForm,location:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div>
                <div><label className="text-xs text-slate-400 font-semibold">Notes / ملاحظات</label><input value={stForm.notes} onChange={e=>setStForm({...stForm,notes:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div>
                <button onClick={saveStation} className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 rounded-lg">{editingStId?'Update Station':'Register Station'}</button>
                {editingStId&&<button onClick={()=>{setEditingStId(null);setStForm({plantId:'',name:'',productType:'concrete',operator:'',designCap:'',actualCap:'',unit:'m³/h',location:'',installDate:'',status:'Running',notes:''});}} className="w-full bg-white/[0.06] text-white font-bold py-2 rounded-lg text-sm">Cancel</button>}
              </div>
            </div>

            {/* Stations List */}
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-black tracking-tight text-white mb-4">Registered Stations ({stations.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">Name</th><th className="p-2">Product</th><th className="p-2">Operator</th><th className="p-2">Design</th><th className="p-2">Actual</th><th className="p-2">Efficiency</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead>
                  <tbody>{stations.map(s=>{const eff=Math.round((s.actualCap/(s.designCap||1))*100);return(<tr key={s.id} className="border-b border-white/10"><td className="p-2 font-bold">{s.name}</td><td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.productType==='concrete'?'bg-sky-500/20 text-sky-400':s.productType==='blocks'?'bg-sky-500/20 text-sky-400':'bg-cyan-500/20 text-cyan-400'}`}>{s.productType==='concrete'?'🏗️ Concrete':s.productType==='blocks'?'🧱 Blocks':'🔄 Both'}</span></td><td className="p-2 text-[10px]">{s.operator}</td><td className="p-2">{s.designCap} {s.unit}</td><td className="p-2 font-bold">{s.actualCap} {s.unit}</td><td className="p-2"><div className="flex items-center gap-1"><div className="h-1.5 flex-1 bg-white/[0.06] rounded-full overflow-hidden"><div className={`h-full rounded-full ${eff>=90?'bg-emerald-500':eff>=60?'bg-yellow-500':'bg-red-500'}`} style={{width:eff+'%'}}/></div><span className="text-[10px]">{eff}%</span></div></td><td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.status==='Running'?'bg-emerald-500/80':s.status==='Maintenance'?'bg-yellow-500/80':'bg-red-500/80'} text-white`}>{s.status==='Running'?'🟢':s.status==='Maintenance'?'🟡':'🔴'} {s.status}</span></td><td className="p-2 flex gap-1"><button onClick={()=>editStation(s)} className="bg-sky-500 text-white text-[10px] px-1.5 py-0.5 rounded">Edit</button><button onClick={()=>deleteStation(s.id)} className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded">Del</button></td></tr>)})}</tbody></table>
              </div>
            </div>
          </div>

          {/* ===== PERIODIC MAINTENANCE ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-[480px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-bold text-orange-400 mb-4">{editingPmId?'Edit':'Schedule'} Periodic Maintenance</h3>
              <div className="space-y-3">
                <div><label className="text-xs text-slate-400 font-semibold">Station / المحطة</label><select value={pmForm.stationId} onChange={e=>setPmForm({...pmForm,stationId:Number(e.target.value)})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required><option value="0">-- Select Station --</option>{stations.map(s=><option key={s.id} value={s.id}>{s.name} - {s.productType==='concrete'?'خرسانة':s.productType==='blocks'?'بلوك':'كلاهما'} ({s.operator})</option>)}</select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <DatePicker value={pmForm.date} onChange={val=>setPmForm({...pmForm,date:val})} label="Date / التاريخ" required />
                    <DatePicker value={pmForm.nextDue} onChange={val=>setPmForm({...pmForm,nextDue:val})} label="Next Due / القادم" />
                  </div>
                <div><label className="text-xs text-slate-400 font-semibold">Task Type / نوع المهمة</label><select value={pmForm.taskType} onChange={e=>setPmForm({...pmForm,taskType:e.target.value as any})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                  <option value="Belts">🔗 Conveyor Belts (سيور ناقلة)</option>
                  <option value="Greasing">💧 Greasing (تشحيم)</option>
                  <option value="Oiling">🛢️ Oiling (تزييت)</option>
                  <option value="Drum Cleaning">🧹 Drum Cleaning (تنظيف الحلة)</option>
                  <option value="General Hygiene">🧼 General Hygiene (نظافة عامة)</option>
                  <option value="Electrical Check">⚡ Electrical Check (فحص كهربائي)</option>
                  <option value="Control Room">🖥️ Control Room (غرفة التحكم)</option>
                  <option value="Software Update">💾 Software Update (تحديث برنامج)</option>
                  <option value="Pipe Change">🔧 Pipe Change (تغيير مواسير)</option>
                  <option value="Pipe Welding">🔥 Pipe Welding (لحام مواسير)</option>
                  <option value="Pump Special Maintenance">🚰 Pump Special Maintenance (صيانة خاصة بالمضخة)</option>
                  <option value="Other">📦 Other (أخرى)</option>
                </select></div>
                <div><label className="text-xs text-slate-400 font-semibold">Description / الوصف</label><textarea value={pmForm.description} onChange={e=>setPmForm({...pmForm,description:e.target.value})} rows={2} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm resize-none" required/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">Technician / الفني</label><input value={pmForm.technician} onChange={e=>setPmForm({...pmForm,technician:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div>
                  <div><label className="text-xs text-slate-400 font-semibold">Status / الحالة</label><select value={pmForm.status} onChange={e=>setPmForm({...pmForm,status:e.target.value as any})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option value="Scheduled">Scheduled (مجدول)</option><option value="Done">Done (تم)</option><option value="Overdue">Overdue (متأخر)</option></select></div>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">Cost / التكلفة ({cur.symbol})</label><input type="number" step="0.01" value={pmForm.cost} onChange={e=>setPmForm({...pmForm,cost:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"/></div>
                <button onClick={savePeriodicMaint} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg">{editingPmId?'Update':'Schedule Maintenance'}</button>
                {editingPmId&&<button onClick={()=>{setEditingPmId(null);setPmForm({stationId:0,date:new Date().toISOString().split('T')[0],taskType:'Greasing',description:'',technician:'',nextDue:'',status:'Scheduled',cost:'',notes:''});}} className="w-full bg-white/[0.06] text-white font-bold py-2 rounded-lg text-sm">Cancel</button>}
              </div>
            </div>

            {/* Maintenance Schedule Table */}
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-white">Periodic Maintenance Schedule ({periodicMaints.length})</h3><button onClick={()=>window.print()} className="bg-sky-600 text-white text-xs px-3 py-1 rounded font-bold">Print</button></div>
              {/* Overdue alerts */}
              {periodicMaints.filter(m=>m.status==='Overdue').length>0&&(<div className="bg-red-500/10 border border-red-400/30 rounded-lg p-3 mb-4"><p className="text-red-300 font-bold text-sm">{periodicMaints.filter(m=>m.status==='Overdue').length} overdue maintenance tasks!</p></div>)}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">Station</th><th className="p-2">Date</th><th className="p-2">Task</th><th className="p-2">Description</th><th className="p-2">Next Due</th><th className="p-2">Status</th><th className="p-2">Cost</th><th className="p-2">Actions</th></tr></thead>
                  <tbody>{periodicMaints.slice(-30).reverse().map(pm=>{const st=stations.find(s=>s.id===pm.stationId);return(<tr key={pm.id} className={`border-b border-white/10 ${pm.status==='Overdue'?'bg-red-500/5':pm.status==='Done'?'bg-emerald-500/5':''}`}><td className="p-2 font-bold">{st?.name||'Station #'+pm.stationId}</td><td className="p-2">{pm.date}</td><td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pm.taskType==='Belts'?'bg-sky-500/20 text-sky-400':pm.taskType==='Greasing'?'bg-yellow-500/20 text-yellow-400':pm.taskType==='Oiling'?'bg-sky-500/20 text-sky-400':pm.taskType==='Drum Cleaning'?'bg-red-500/20 text-red-400':pm.taskType==='Electrical Check'?'bg-orange-500/20 text-orange-400':pm.taskType==='Software Update'?'bg-cyan-500/20 text-cyan-400':pm.taskType==='Pipe Change'?'bg-teal-500/20 text-teal-400':pm.taskType==='Pipe Welding'?'bg-pink-500/20 text-pink-400':pm.taskType==='Pump Special Maintenance'?'bg-sky-500/20 text-sky-400':'bg-slate-500/20 text-slate-400'}`}>{pm.taskType}</span></td><td className="p-2 max-w-[120px] truncate">{pm.description}</td><td className={`p-2 font-bold ${pm.nextDue&&new Date(pm.nextDue)<new Date()&&pm.status!=='Done'?'text-red-400':''}`}>{pm.nextDue||'-'}</td><td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pm.status==='Done'?'bg-emerald-500/80':pm.status==='Scheduled'?'bg-yellow-500/80':'bg-red-500/80'} text-white`}>{pm.status}</span></td><td className="p-2 font-bold">{pm.cost>0?fmtMoney(pm.cost):'-'}</td><td className="p-2 flex gap-1"><button onClick={()=>editPeriodicMaint(pm)} className="bg-sky-500 text-white text-[10px] px-1.5 py-0.5 rounded">Edit</button>{pm.status!=='Done'&&<button onClick={()=>markMaintDone(pm.id)} className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded">Done</button>}<button onClick={()=>deletePeriodicMaint(pm.id)} className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded">Del</button></td></tr>)})}</tbody></table>
              </div>
            </div>
          </div>
        </div>)}

        {/* CONFIG */}
        {tab==='config'&&(<div className="space-y-6">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-black tracking-tight text-white mb-4">{t('fleetRegistration')}</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">{[{key:'id',label:t('assetCode')},{key:'plate',label:t('plateNumber')},{key:'chassis',label:'Chassis'},{key:'driver',label:t('driverName')},{key:'gpsId',label:'GPS ID'},{key:'tare',label:'Tare (Ton)'}].map(f=>(<div key={f.key}><label className="text-[10px] text-slate-400 font-semibold">{f.label}</label><input value={(assetForm as any)[f.key]} onChange={e=>setAssetForm({...assetForm,[f.key]:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-xs"/></div>))}<div><label className="text-[10px] text-slate-400 font-semibold">{t('assetType')}</label><select value={assetForm.type} onChange={e=>setAssetForm({...assetForm,type:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-xs"><option>Mixer</option><option>Mobile Pump</option><option>Light Vehicle</option><option>Loader</option></select></div><div><label className="text-[10px] text-slate-400 font-semibold">{t('status')}</label><select value={assetForm.status} onChange={e=>setAssetForm({...assetForm,status:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-xs"><option>Ready</option><option>Workshop</option><option>Out of Service</option><option>Scrap</option></select></div><div><label className="text-[10px] text-slate-400 font-semibold">{t('currentOdometer')}</label><input type="number" value={assetForm.initOdo} onChange={e=>setAssetForm({...assetForm,initOdo:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-xs"/></div><div><label className="text-[10px] text-slate-400 font-semibold">{t('engineHours')}</label><input type="number" value={assetForm.engHours} onChange={e=>setAssetForm({...assetForm,engHours:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-xs"/></div></div><button onClick={addAsset} className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-8 rounded-lg">{t('saveAsset')}</button></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6"><h3 className="text-lg font-black tracking-tight text-white mb-4">{t('factorySettings')}</h3><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Object.entries(config).map(([k,v])=>(<div key={k}><label className="text-[10px] text-slate-400 font-semibold capitalize">{k.replace(/([A-Z])/g,' $1')}</label><input value={String(v)} onChange={e=>setConfig({...config,[k]:e.target.value})} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-xs"/></div>))}</div><button onClick={saveConfigFn} className="mt-4 bg-sky-500 hover:bg-sky-400 text-white font-bold py-2.5 px-6 rounded-lg">{t('saveSettings')}</button></div>
        </div>)}

        {/* REPORTS */}
        {tab==='reports'&&(<div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-black tracking-tight text-white mb-4">{t('financialReport')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6"><div><label className="text-xs text-slate-400 font-semibold">{t('vehicle')}</label><select value={reportVehicle} onChange={e=>setReportVehicle(e.target.value)} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option value="">{t('allVehicles')}</option>{assets.map(a=><option key={a.id} value={a.id}>{a.id} - {a.plate}</option>)}</select></div><DatePicker value={reportFrom} onChange={setReportFrom} label={t('from')} /><DatePicker value={reportTo} onChange={setReportTo} label={t('to')} /></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">{[{label:'Fuel',value:fmtMoney(totalFuelCost),border:'border-yellow-500'},{label:'Oil',value:fmtMoney(totalOilCost),border:'border-sky-500'},{label:'Spare Parts',value:fmtMoney(totalPartsCost),border:'border-sky-500'},{label:'Grand Total',value:fmtMoney(grandTotal),border:'border-emerald-500'}].map(k=>(<div key={k.label} className={`bg-[#0B111E] border-l-4 ${k.border} rounded-lg p-4`}><p className="text-xs text-slate-400">{k.label}</p><p className="text-lg font-bold text-white">{k.value}</p></div>))}</div>
          {[{title:t('fuelReport'),data:ff.map(f=>(<tr key={f.id}><td className="p-2">{f.date}</td><td className="p-2 font-bold">{f.assetId}</td><td className="p-2">{f.liters}</td><td className="p-2">{fmtMoney(f.totalCost)}</td></tr>)),headers:['Date','Vehicle','Liters','Cost']},{title:t('breakdownsReport'),data:fb.map(b=>(<tr key={b.id}><td className="p-2">{b.date}</td><td className="p-2 font-bold">{b.assetId}</td><td className="p-2">{b.symptom}</td><td className="p-2">{fmtMoney(b.repairCost)}</td></tr>)),headers:['Date','Vehicle','Symptom','Cost']}].map(s=>(<div key={s.title}><h4 className="text-sm font-bold text-slate-400 mt-4 mb-2">{s.title}</h4><div className="overflow-x-auto mb-4"><table className="w-full text-xs text-slate-300"><thead className="bg-white/[0.04] text-slate-400"><tr>{s.headers.map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{s.data.length===0?<tr><td colSpan={s.headers.length} className="p-4 text-center text-slate-500">{t('noData')}</td></tr>:s.data}</tbody></table></div></div>))}
          <button onClick={()=>window.print()} className="mt-6 bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-6 rounded-lg">{t('printReport')}</button>
        </div>)}
      </div>
    </div>
  );
}
