import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loadInventory, saveInventory, loadDeliveries, saveDeliveries, loadProductionRuns, saveProductionRuns, loadOrders, saveOrders, loadAdditives, saveAdditives, addNotification } from '../firebase/firestore';
import DatePicker from '../components/DatePicker';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import NotificationsBell from '../components/NotificationsBell';
import BatchControllerIntegration from '../components/BatchControllerIntegration';
import { DeviceStatusBadge } from '../components/DeviceHub';
import { useProductionDict } from '../i18n/productionDict';

interface Delivery { date: string; material: string; qty: number; invoice: string; }
interface ProdRun { date: string; time: string; recipe: string; volume: number; cementUsed: number; sandUsed: number; gravelUsed: number; orderId?: string; }

// نظام الإضافات
interface Addition {
  id: number;
  name: string;
  type: 'delay_set' | 'strength_enhance' | 'integrated'; // تأخير شك، زيادة قوة، متكاملة
  dosagePerM3: number; // الجرعة لكل متر مكعب
  currentStock: number;
  minStock: number;
  unit: string;
  supplier: string;
  costPerUnit: number;
}

// نظام البلوك
interface BlockType {
  id: number;
  code: string; // كود الصنف
  name: string; // الصنف
  length: number; // الطول (سم)
  width: number; // العرض (سم)
  height: number; // الارتفاع (سم)
  stock: number; // الكمية المتاحة
  minStock: number; // الحد الأدنى
  pricePerUnit: number; // سعر الوحدة
  mixDesign?: BlockMixDesign; // خلطة البلوك
}

// خلطة البلوك
interface BlockMixDesign {
  cementPerBlock: number; // كجم أسمنت لكل بلوك
  sandPerBlock: number; // كجم رمل لكل بلوك
  gravelPerBlock: number; // كجم زلط لكل بلوك
  waterPerBlock: number; // لتر ماء لكل بلوك
  admixturePerBlock: number; // كجم إضافات لكل بلوك
}

// إنتاج البلوك
interface BlockProduction {
  id: number;
  date: string;
  blockCode: string;
  quantity: number;
  mixDesign: BlockMixDesign;
  totalCement: number;
  totalSand: number;
  totalGravel: number;
  totalWater: number;
  totalAdmixture: number;
}

const MAX: Record<string, number> = { cement: 100, sand: 200, gravel: 300, admixture: 2000 };

export default function Production() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const t = useProductionDict();
  const DEF_INV = { cement: 85, sand: 156, gravel: 270, admixture: 1700 };
  const DEF_DELIV = [{ date: '2026-06-17', material: 'cement', qty: 25, invoice: 'INV-4012' }, { date: '2026-06-18', material: 'admixture', qty: 500, invoice: 'INV-4099' }];
  const [inventory, setInventory] = useState<Record<string, number>>(DEF_INV);
  const [deliveries, setDeliveries] = useState<Delivery[]>(DEF_DELIV);
  const [prodRuns, setProdRuns] = useState<ProdRun[]>([]);
  // بيانات الإضافات (قابلة للتعديل)
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [additionForm, setAdditionForm] = useState({ name: '', type: 'delay_set' as Addition['type'], dosagePerM3: '', currentStock: '', minStock: '', unit: 'كجم', supplier: '', costPerUnit: '' });
  const [editingAddition, setEditingAddition] = useState<number | null>(null);
  const [showBatchCtrl, setShowBatchCtrl] = useState(false);
  const [blocks, setBlocks] = useState<BlockType[]>(() => {
    const saved = localStorage.getItem('plantBlocks');
    return saved ? JSON.parse(saved) : [
      { 
        id: 1, 
        code: 'BLK-20x20x40', 
        name: 'بلوك عادي', 
        length: 40, width: 20, height: 20, 
        stock: 5000, minStock: 1000, pricePerUnit: 2.5,
        mixDesign: {
          cementPerBlock: 0.8, // 800 جرام أسمنت لكل بلوك
          sandPerBlock: 2.5, // 2.5 كجم رمل
          gravelPerBlock: 0, // بلوك لا يستخدم زلط
          waterPerBlock: 0.4, // 400 مل ماء
          admixturePerBlock: 0.01 // 10 جرام إضافات
        }
      },
      { 
        id: 2, 
        code: 'BLK-15x20x40', 
        name: 'بلوك رفيع', 
        length: 40, width: 20, height: 15, 
        stock: 3000, minStock: 800, pricePerUnit: 2.0,
        mixDesign: {
          cementPerBlock: 0.6,
          sandPerBlock: 1.9,
          gravelPerBlock: 0,
          waterPerBlock: 0.3,
          admixturePerBlock: 0.008
        }
      },
    ];
  });
  const [blockProductions, setBlockProductions] = useState<BlockProduction[]>(() => {
    const saved = localStorage.getItem('plantBlockProductions');
    return saved ? JSON.parse(saved) : [];
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([loadInventory(currentUser.username), loadDeliveries(currentUser.username), loadProductionRuns(currentUser.username), loadOrders(currentUser.username)]).then(([inv, del, runs, ords]) => {
      if (inv) setInventory(inv); else { const s = localStorage.getItem('plantInventory'); if (s) setInventory(JSON.parse(s)); }
      if (del?.length) setDeliveries(del); else { const s = localStorage.getItem('plantDeliveries'); if (s) setDeliveries(JSON.parse(s)); }
      if (runs?.length) setProdRuns(runs); else { const s = localStorage.getItem('plantProductionRuns'); if (s) setProdRuns(JSON.parse(s)); }
      if (Array.isArray(ords)) setOrders(ords);
      setLoaded(true);
    }).catch(() => { setLoaded(true); });
  }, [currentUser?.username]);

  useEffect(() => { if (!loaded || !currentUser) return; localStorage.setItem('plantInventory', JSON.stringify(inventory)); saveInventory(currentUser.username, inventory).catch(() => {}); }, [inventory, loaded]);
  useEffect(() => { if (!loaded || !currentUser) return; localStorage.setItem('plantDeliveries', JSON.stringify(deliveries)); saveDeliveries(currentUser.username, deliveries).catch(() => {}); }, [deliveries, loaded]);
  useEffect(() => { if (!loaded || !currentUser) return; localStorage.setItem('plantProductionRuns', JSON.stringify(prodRuns)); saveProductionRuns(currentUser.username, prodRuns).catch(() => {}); }, [prodRuns, loaded]);
  useEffect(() => { if (!loaded || !currentUser) return; saveAdditives(currentUser.username, additions).catch(() => {}); }, [additions, loaded]);
  useEffect(() => { if (!loaded) return; localStorage.setItem('plantBlocks', JSON.stringify(blocks)); }, [blocks, loaded]);

  // تحميل الإضافات من Firebase
  useEffect(() => {
    if (!currentUser) return;
    loadAdditives(currentUser.username).then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setAdditions(data);
      } else {
        // بيانات افتراضية
        setAdditions([
          { id: 1, name: 'مضاف تأخير شك', type: 'delay_set', dosagePerM3: 2.5, currentStock: 500, minStock: 100, unit: 'كجم', supplier: 'شركة الكيمياويات', costPerUnit: 15 },
          { id: 2, name: 'مضاف زيادة قوة', type: 'strength_enhance', dosagePerM3: 3.0, currentStock: 300, minStock: 80, unit: 'كجم', supplier: 'مصنع الإضافات', costPerUnit: 25 },
          { id: 3, name: 'مضاف متكامل', type: 'integrated', dosagePerM3: 4.0, currentStock: 400, minStock: 100, unit: 'كجم', supplier: 'شركة البناء', costPerUnit: 20 },
        ]);
      }
    }).catch(() => {});
  }, [currentUser?.username]);

  // CRUD functions for additives
  const addAddition = () => {
    if (!additionForm.name) return;
    const newAddition: Addition = {
      id: Date.now(),
      name: additionForm.name,
      type: additionForm.type,
      dosagePerM3: parseFloat(additionForm.dosagePerM3) || 0,
      currentStock: parseFloat(additionForm.currentStock) || 0,
      minStock: parseFloat(additionForm.minStock) || 0,
      unit: additionForm.unit,
      supplier: additionForm.supplier,
      costPerUnit: parseFloat(additionForm.costPerUnit) || 0,
    };
    setAdditions([...additions, newAddition]);
    setAdditionForm({ name: '', type: 'delay_set', dosagePerM3: '', currentStock: '', minStock: '', unit: 'كجم', supplier: '', costPerUnit: '' });
  };

  const updateAddition = (id: number) => {
    setAdditions(additions.map(a => a.id === id ? {
      ...a,
      name: additionForm.name || a.name,
      type: additionForm.type,
      dosagePerM3: parseFloat(additionForm.dosagePerM3) || a.dosagePerM3,
      currentStock: parseFloat(additionForm.currentStock) || a.currentStock,
      minStock: parseFloat(additionForm.minStock) || a.minStock,
      unit: additionForm.unit,
      supplier: additionForm.supplier || a.supplier,
      costPerUnit: parseFloat(additionForm.costPerUnit) || a.costPerUnit,
    } : a));
    setEditingAddition(null);
    setAdditionForm({ name: '', type: 'delay_set', dosagePerM3: '', currentStock: '', minStock: '', unit: 'كجم', supplier: '', costPerUnit: '' });
  };

  const deleteAddition = (id: number) => {
    if (confirm(t('deleteAdditionConfirm'))) {
      setAdditions(additions.filter(a => a.id !== id));
    }
  };

  const startEditAddition = (a: Addition) => {
    setEditingAddition(a.id);
    setAdditionForm({
      name: a.name,
      type: a.type,
      dosagePerM3: a.dosagePerM3.toString(),
      currentStock: a.currentStock.toString(),
      minStock: a.minStock.toString(),
      unit: a.unit,
      supplier: a.supplier,
      costPerUnit: a.costPerUnit.toString(),
    });
  };
  const [delivForm, setDelivForm] = useState({ type: 'cement', qty: '', invoice: '' });
  const [batchForm, setBatchForm] = useState({ recipe: 'C30', volume: '', orderId: '' });
  const [orders, setOrders] = useState<any[]>([]);
  const [blockProdForm, setBlockProdForm] = useState({ blockCode: '', quantity: '' });
  const [fromDate, setFromDate] = useState(''); const [toDate, setToDate] = useState('');
  const [recipes] = useState<any[]>(() => { try { const s = localStorage.getItem('plantRecipes'); return s ? JSON.parse(s) : []; } catch { return []; } });
  


  // (Firebase sync is handled by the new effects above)

  const pct = (k: string) => Math.round((inventory[k] / MAX[k]) * 100);



  const addDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    const type = delivForm.type, qty = parseFloat(delivForm.qty);
    setInventory(prev => ({ ...prev, [type]: Math.min(prev[type] + qty, MAX[type] * 1.2) }));
    setDeliveries(prev => [...prev, { date: new Date().toISOString().split('T')[0], material: type, qty, invoice: delivForm.invoice }]);
    setDelivForm({ type: 'cement', qty: '', invoice: '' });
    alert(`✅ Material delivery recorded! Added ${qty} to ${type}.`);
  };

  // إنتاج البلوك وتحديث المخزون
  const produceBlocks = (e: React.FormEvent) => {
    e.preventDefault();
    const block = blocks.find(b => b.code === blockProdForm.blockCode);
    const qty = parseFloat(blockProdForm.quantity);
    
    if (!block || !block.mixDesign || !qty) return;

    // حساب استهلاك المواد الخام (بالطن)
    const cementUsed = (block.mixDesign.cementPerBlock * qty) / 1000; // من جرام إلى طن
    const sandUsed = (block.mixDesign.sandPerBlock * qty) / 1000; // من كجم إلى طن

    // التحقق من توفر المواد الخام
    if (inventory.cement < cementUsed || inventory.sand < sandUsed) {
      alert(t('insufficientRaw') +
        `${t('cementReq')}${cementUsed.toFixed(2)}${t('tons')}${t('availOpen')}${inventory.cement.toFixed(2)}${t('tons')}${t('closeParen')}\n` +
        `${t('sandReq')}${sandUsed.toFixed(2)}${t('tons')}${t('availOpen')}${inventory.sand.toFixed(2)}${t('tons')}${t('closeParen')}`);
      return;
    }

    // تحديث المخزون
    setInventory(prev => ({
      ...prev,
      cement: prev.cement - cementUsed,
      sand: prev.sand - sandUsed,
    }));

    // تحديث مخزون البلوك
    const updatedBlocks = blocks.map(b => 
      b.code === blockProdForm.blockCode ? { ...b, stock: b.stock + qty } : b
    );
    setBlocks(updatedBlocks);

    // تسجيل عملية الإنتاج
    const production: BlockProduction = {
      id: Date.now(),
      date: new Date().toISOString().split('T')[0],
      blockCode: blockProdForm.blockCode,
      quantity: qty,
      mixDesign: block.mixDesign,
      totalCement: cementUsed,
      totalSand: sandUsed,
      totalGravel: 0,
      totalWater: 0,
      totalAdmixture: 0,
    };
    setBlockProductions(prev => [...prev, production]);

    alert(`${t('prodBlocksPrefix')}${qty} ${t('blockUnit')}${t('prodBlocksMid')}${block.name}\n` +
      `${t('inventoryUpdated')}\n` +
      `${t('dashCement')}-${cementUsed.toFixed(2)}${t('tons')}\n` +
      `${t('dashSand')}-${sandUsed.toFixed(2)}${t('tons')}\n` +
      `${t('dashBlockStock')}${qty} ${t('blockUnit')}`);
    setBlockProdForm({ blockCode: '', quantity: '' });
  };

  // مقارنة الطلبات بالمخزون
  const checkInventoryVsOrders = () => {
    const lsOrders = JSON.parse(localStorage.getItem('concrete_plant_orders') || '[]');
    const ordersAll = orders.length ? orders : lsOrders;
    const approvedOrders = ordersAll.filter((o: any) => o.accountStatus === 'approved' && o.status !== 'completed');

    const totalConcreteNeeded = approvedOrders
      .filter((o: any) => o.orderType === 'concrete')
      .reduce((sum: number, o: any) => sum + (o.quantity || 0), 0);

    const totalBlocksNeeded = approvedOrders
      .filter((o: any) => o.orderType === 'blocks')
      .reduce((sum: number, o: any) => sum + (o.quantity || 0), 0);

    const cementForConcrete = totalConcreteNeeded * 0.35;
    const sandForConcrete = totalConcreteNeeded * 0.75;
    const gravelForConcrete = totalConcreteNeeded * 1.1;

    let cementForBlocks = 0, sandForBlocks = 0;
    approvedOrders.filter((o: any) => o.orderType === 'blocks').forEach((order: any) => {
      const block = blocks.find(b => b.code === order.blockCode);
      if (block?.mixDesign) {
        cementForBlocks += (block.mixDesign.cementPerBlock * order.quantity) / 1000;
        sandForBlocks += (block.mixDesign.sandPerBlock * order.quantity) / 1000;
      }
    });

    return {
      concreteNeeded: totalConcreteNeeded,
      blocksNeeded: totalBlocksNeeded,
      cementNeeded: cementForConcrete + cementForBlocks,
      sandNeeded: sandForConcrete + sandForBlocks,
      gravelNeeded: gravelForConcrete,
      cementAvailable: inventory.cement,
      sandAvailable: inventory.sand,
      gravelAvailable: inventory.gravel,
      blocksAvailable: blocks.reduce((sum, b) => sum + b.stock, 0),
      cementShortage: Math.max(0, (cementForConcrete + cementForBlocks) - inventory.cement),
      sandShortage: Math.max(0, (sandForConcrete + sandForBlocks) - inventory.sand),
      gravelShortage: Math.max(0, gravelForConcrete - inventory.gravel),
      blocksShortage: Math.max(0, totalBlocksNeeded - blocks.reduce((sum, b) => sum + b.stock, 0)),
    };
  };

  const inventoryCheck = checkInventoryVsOrders();

  const runBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const recipe = batchForm.recipe, vol = parseFloat(batchForm.volume);
    let factor = 1; if (recipe === 'C25') factor = 0.85; if (recipe === 'C35') factor = 1.15; if (recipe === 'C40') factor = 1.3;
    const cementN = 0.35 * vol * factor, sandN = 0.75 * vol * factor, gravelN = 1.1 * vol * factor, admixN = 5 * vol * factor;
    if (inventory.cement < cementN || inventory.sand < sandN || inventory.gravel < gravelN || inventory.admixture < admixN) {
      alert('❌ Insufficient raw materials! Record a delivery first.'); return;
    }
    const order = orders.find(o => o.id === batchForm.orderId);
    setInventory(prev => ({ cement: prev.cement - cementN, sand: prev.sand - sandN, gravel: prev.gravel - gravelN, admixture: prev.admixture - admixN }));
    setProdRuns(prev => [...prev, { date: new Date().toISOString().split('T')[0], time: new Date().toLocaleTimeString(), recipe, volume: vol, cementUsed: cementN, sandUsed: sandN, gravelUsed: gravelN, orderId: order?.orderNo }]);
    if (order) {
      const delivered = (Number(order.deliveredQty) || 0) + vol;
      const done = delivered >= (Number(order.quantity) || 0);
      const updated = { ...order, deliveredQty: Math.min(delivered, Number(order.quantity) || delivered), status: done ? 'completed' : 'in_progress' };
      setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
      saveOrders(currentUser!.username, orders.map(o => o.id === order.id ? updated : o)).catch(() => {});
      if (currentUser) addNotification(currentUser.username, {
        level: done ? 'success' : 'info',
        title: `${t('prodNotifPrefix')}${vol}${t('m3')}${t('prodNotifMid')}${order.orderNo}`,
        body: `${order.customerName}${t('delivBodyPipe')}${Math.min(delivered, Number(order.quantity) || delivered).toFixed(1)} / ${order.quantity}${t('m3')}${done ? ` — ✅ ${t('completedOrder')}` : ''}`,
      }).catch(() => {});
      setBatchForm({ recipe: 'C30', volume: '', orderId: '' });
      alert(done
        ? `${t('prodDonePrefix')}${vol}${t('m3')}${t('prodDoneMid')}${order.orderNo}${t('prodDoneMid2')}${order.quantity}${t('prodDoneSuffix')}`
        : `${t('prodRunPrefix')}${vol}${t('m3')}${t('prodRunMid')}${order.orderNo}${t('prodRunMid2')}${cementN.toFixed(2)}${t('prodRunMid3')}${(Number(order.quantity) - Math.min(delivered, Number(order.quantity))).toFixed(1)}${t('prodRunSuffix')}`);
      return;
    }
    setBatchForm({ recipe: 'C30', volume: '', orderId: '' });
    alert(`🚀 Poured ${vol}m³ of ${recipe}. Cement: ${cementN.toFixed(2)}T, Sand: ${sandN.toFixed(2)}T, Gravel: ${gravelN.toFixed(2)}T.`);
  };

  const filteredDeliv = deliveries.filter(d => (!fromDate || d.date >= fromDate) && (!toDate || d.date <= toDate));
  const filteredRuns = prodRuns.filter(p => (!fromDate || p.date >= fromDate) && (!toDate || p.date <= toDate));

  const exportCSV = () => {
    let csv = 'Timestamp,Recipe,Volume,Cement,Sand,Gravel\n';
    prodRuns.forEach(p => { csv += `${p.time},${p.recipe},${p.volume},${p.cementUsed.toFixed(2)},${p.sandUsed.toFixed(2)},${p.gravelUsed.toFixed(2)}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'production_runs.csv'; a.click();
  };

  if (!currentUser) return <div className="min-h-screen bg-[#0B111E] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">Back to Login</Link></div></div>;

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2.5 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-black tracking-tight text-white">🏭 Concrete Production & Material Inventory</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setShowBatchCtrl(true)} className="bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 text-xs font-bold px-3 py-1.5 rounded-lg">{t('batchCtrl')}</button>
          <DeviceStatusBadge id="batchController" />
          <NotificationsBell />
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <button onClick={() => { logout(); navigate('/'); }} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">{t('logout')}</button>
          <p className="text-[10px] text-emerald-500/80">Design by Dr. Ahmad Abdo Alyan</p>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Poured', value: '30.0 m³', border: 'border-emerald-500' },
            { label: 'Silo Avg Level', value: `${((pct('cement') + pct('sand') + pct('gravel') + pct('admixture')) / 4).toFixed(1)}%`, border: 'border-yellow-500' },
            { label: 'Deliveries', value: `${deliveries.length} Logs`, border: 'border-sky-500' },
            { label: 'Low Stock Alerts', value: `${[pct('cement'), pct('sand'), pct('gravel'), pct('admixture')].filter(v => v < 25).length} Silos`, border: 'border-red-500' },
          ].map(kpi => (
            <div key={kpi.label} className={`bg-white/[0.04] rounded-xl p-5 border-l-4 ${kpi.border} shadow-lg`}>
              <p className="text-xs text-slate-400 mb-1">{kpi.label}</p><p className="text-xl font-bold text-white">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Silo Visuals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { name: 'Cement Silo', key: 'cement', unit: 'Tons', fill: 'bg-gradient-to-t from-slate-400 to-slate-200' },
            { name: 'Fine Sand Bin', key: 'sand', unit: 'Tons', fill: 'bg-gradient-to-t from-yellow-500 to-yellow-200' },
            { name: 'Aggregate Bin', key: 'gravel', unit: 'Tons', fill: 'bg-gradient-to-t from-gray-600 to-gray-400' },
            { name: 'Admixture Tank', key: 'admixture', unit: 'Liters', fill: 'bg-gradient-to-t from-cyan-500 to-cyan-300' },
          ].map(silo => (
            <div key={silo.key} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 text-center">
              <h4 className="text-sm text-slate-300 mb-3">{silo.name}</h4>
              <div className="w-14 h-24 bg-white/[0.06] rounded-t-sm rounded-b-xl mx-auto relative overflow-hidden border-2 border-white/10 mb-3">
                <div className={`absolute bottom-0 left-0 right-0 ${silo.fill} transition-all duration-500`} style={{ height: `${Math.min(pct(silo.key), 100)}%` }} />
              </div>
              <p className="text-xs font-bold">{inventory[silo.key].toFixed(silo.key === 'admixture' ? 0 : 1)} {silo.unit} ({pct(silo.key)}%)</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* Forms */}
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 shadow-lg">
            <h3 className="text-lg font-black tracking-tight text-white mb-4 pb-2 border-b border-white/10">➕ Raw Material Delivery</h3>
            <form onSubmit={addDelivery} className="space-y-3">
              <div><label className="text-xs text-slate-400 font-semibold">Material Type</label><select value={delivForm.type} onChange={e => setDelivForm({ ...delivForm, type: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm"><option value="cement">Cement (Tons)</option><option value="sand">Fine Sand (Tons)</option><option value="gravel">Aggregate (Tons)</option><option value="admixture">Admixture (Liters)</option></select></div>
              <div><label className="text-xs text-slate-400 font-semibold">Quantity</label><input type="number" step="0.1" value={delivForm.qty} onChange={e => setDelivForm({ ...delivForm, qty: e.target.value })} placeholder="50" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
              <div><label className="text-xs text-slate-400 font-semibold">Invoice</label><input value={delivForm.invoice} onChange={e => setDelivForm({ ...delivForm, invoice: e.target.value })} placeholder="INV-8879" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
              <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg">💾 Record Delivery</button>
            </form>

            <h3 className="text-lg font-black tracking-tight text-white mt-8 mb-4 pb-2 border-b border-white/10">⚙️ Run Manual Batch</h3>
            <form onSubmit={runBatch} className="space-y-3">
              <div><label className="text-xs text-slate-400 font-semibold">Concrete Recipe</label>
                <select value={batchForm.recipe} onChange={e => setBatchForm({ ...batchForm, recipe: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                  {(recipes.length > 0 ? recipes : [{ code: 'C25' }, { code: 'C30' }, { code: 'C35' }, { code: 'C40' }]).map((r: any) => <option key={r.code} value={r.code}>{r.code}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-slate-400 font-semibold">Volume (m³)</label><input type="number" step="0.1" value={batchForm.volume} onChange={e => setBatchForm({ ...batchForm, volume: e.target.value })} placeholder="10" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
              <div>
                <label className="text-xs text-slate-400 font-semibold">{t('linkOrder')}</label>
                <select value={batchForm.orderId} onChange={e => setBatchForm({ ...batchForm, orderId: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                  <option value="">{t('noLink')}</option>
                  {orders.filter((o: any) => o.status === 'in_progress' || o.status === 'scheduled').map((o: any) => (
                    <option key={o.id} value={o.id}>{o.orderNo || o.id} · {o.customerName} · {t('delivWord')} {(Number(o.deliveredQty) || 0).toFixed(1)}/{o.quantity} {t('m3')}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg">🚀 Execute Batch</button>
            </form>

            {/* 🧱 إنتاج البلوك */}
            <h3 className="text-lg font-black tracking-tight text-white mt-8 mb-4 pb-2 border-b border-white/10">🧱 Produce Blocks</h3>
            <form onSubmit={produceBlocks} className="space-y-3">
              <div><label className="text-xs text-slate-400 font-semibold">Block Type</label>
                <select value={blockProdForm.blockCode} onChange={e => setBlockProdForm({ ...blockProdForm, blockCode: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required>
                  <option value="">-- Select Block Type --</option>
                  {blocks.map(b => (
                    <option key={b.id} value={b.code}>{b.code} - {b.name} (Stock: {b.stock})</option>
                  ))}
                </select>
              </div>
              <div><label className="text-xs text-slate-400 font-semibold">Quantity (Blocks)</label><input type="number" min="1" value={blockProdForm.quantity} onChange={e => setBlockProdForm({ ...blockProdForm, quantity: e.target.value })} placeholder="1000" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
              <button type="submit" className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg">🧱 Produce Blocks</button>
            </form>

            {/* 🧪 إدارة الإضافات الكيماوية */}
            <h3 className="text-lg font-black tracking-tight text-white mt-8 mb-4 pb-2 border-b border-white/10">{t('admixSection')}</h3>
            <div className="space-y-3">
              <input value={additionForm.name} onChange={e => setAdditionForm({ ...additionForm, name: e.target.value })} placeholder={t('namePlaceholder')} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
              <select value={additionForm.type} onChange={e => setAdditionForm({ ...additionForm, type: e.target.value as Addition['type'] })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                <option value="delay_set">{t('delaySet')}</option>
                <option value="strength_enhance">{t('strengthEnhance')}</option>
                <option value="integrated">{t('integrated')}</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="0.1" value={additionForm.dosagePerM3} onChange={e => setAdditionForm({ ...additionForm, dosagePerM3: e.target.value })} placeholder={t('dosagePlaceholder')} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
                <input type="number" step="0.1" value={additionForm.currentStock} onChange={e => setAdditionForm({ ...additionForm, currentStock: e.target.value })} placeholder={t('stockPlaceholder')} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="0.1" value={additionForm.minStock} onChange={e => setAdditionForm({ ...additionForm, minStock: e.target.value })} placeholder={t('minStockPlaceholder')} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
                <input type="number" step="0.1" value={additionForm.costPerUnit} onChange={e => setAdditionForm({ ...additionForm, costPerUnit: e.target.value })} placeholder={t('costPlaceholder')} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
              </div>
              <input value={additionForm.supplier} onChange={e => setAdditionForm({ ...additionForm, supplier: e.target.value })} placeholder={t('supplierPlaceholder')} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
              {editingAddition ? (
                <div className="flex gap-2">
                  <button onClick={() => updateAddition(editingAddition)} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg">{t('saveEdit')}</button>
                  <button onClick={() => { setEditingAddition(null); setAdditionForm({ name: '', type: 'delay_set', dosagePerM3: '', currentStock: '', minStock: '', unit: 'كجم', supplier: '', costPerUnit: '' }); }} className="flex-1 bg-slate-500 hover:bg-slate-600 text-white font-bold py-2 rounded-lg">{t('cancel')}</button>
                </div>
              ) : (
                <button onClick={addAddition} className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 rounded-lg">{t('addAddition')}</button>
              )}
            </div>
          </div>

          {/* 📊 مقارنة المخزون بالطلبات */}
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 shadow-lg mt-6">
            <h3 className="text-lg font-black tracking-tight text-white mb-4 pb-2 border-b border-white/10">📊 Inventory vs Orders Comparison</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-[#0B111E] rounded-lg p-4">
                <p className="text-xs text-slate-400">Concrete Needed</p>
                <p className="text-lg font-bold text-white">{inventoryCheck.concreteNeeded.toFixed(0)} m³</p>
              </div>
              <div className="bg-[#0B111E] rounded-lg p-4">
                <p className="text-xs text-slate-400">Blocks Needed</p>
                <p className="text-lg font-bold text-white">{inventoryCheck.blocksNeeded}</p>
              </div>
              <div className="bg-[#0B111E] rounded-lg p-4">
                <p className="text-xs text-slate-400">Cement Available</p>
                <p className="text-lg font-bold text-white">{inventoryCheck.cementAvailable.toFixed(2)} T</p>
              </div>
              <div className="bg-[#0B111E] rounded-lg p-4">
                <p className="text-xs text-slate-400">Blocks Available</p>
                <p className="text-lg font-bold text-white">{inventoryCheck.blocksAvailable}</p>
              </div>
            </div>
            {(inventoryCheck.cementShortage > 0 || inventoryCheck.sandShortage > 0 || inventoryCheck.gravelShortage > 0 || inventoryCheck.blocksShortage > 0) && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-red-400 font-bold mb-2">⚠️ Material Shortages Detected!</p>
                {inventoryCheck.cementShortage > 0 && <p className="text-sm text-slate-300">• Cement shortage: {inventoryCheck.cementShortage.toFixed(2)} tons</p>}
                {inventoryCheck.sandShortage > 0 && <p className="text-sm text-slate-300">• Sand shortage: {inventoryCheck.sandShortage.toFixed(2)} tons</p>}
                {inventoryCheck.gravelShortage > 0 && <p className="text-sm text-slate-300">• Gravel shortage: {inventoryCheck.gravelShortage.toFixed(2)} tons</p>}
                {inventoryCheck.blocksShortage > 0 && <p className="text-sm text-slate-300">• Blocks shortage: {inventoryCheck.blocksShortage} blocks</p>}
              </div>
            )}
            {inventoryCheck.cementShortage === 0 && inventoryCheck.sandShortage === 0 && inventoryCheck.gravelShortage === 0 && inventoryCheck.blocksShortage === 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                <p className="text-emerald-400 font-bold">✅ All materials are sufficient for pending orders</p>
              </div>
            )}
          </div>

          {/* Tables */}
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/10">
              <h3 className="text-lg font-black tracking-tight text-white">📋 Reconciliation Logs</h3>
              <div className="flex gap-2"><button onClick={exportCSV} className="bg-yellow-500 text-slate-900 text-xs px-3 py-1.5 rounded font-bold">Excel</button><button onClick={() => window.print()} className="bg-sky-500 text-white text-xs px-3 py-1.5 rounded font-bold">Print</button></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4"><DatePicker value={fromDate} onChange={setFromDate} label="From" /><DatePicker value={toDate} onChange={setToDate} label="To" /></div>

            <h4 className="text-xs text-slate-400 uppercase mb-2">📥 Recent Deliveries</h4>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-left text-sm text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-xs uppercase"><tr><th className="p-3">Date</th><th className="p-3">Material</th><th className="p-3">Qty</th><th className="p-3">Invoice</th><th className="p-3">Status</th></tr></thead>
                <tbody>{filteredDeliv.slice(-5).reverse().map((d, i) => <tr key={i} className="border-b border-white/10"><td className="p-3">{d.date}</td><td className="p-3 uppercase font-bold">{d.material}</td><td className="p-3">{d.qty} {d.material === 'admixture' ? 'L' : 'Tons'}</td><td className="p-3">{d.invoice}</td><td className="p-3"><span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold">Verified</span></td></tr>)}</tbody></table>
            </div>

            <h4 className="text-xs text-slate-400 uppercase mb-2">🏭 Recent Production Runs</h4>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-left text-sm text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-xs uppercase"><tr><th className="p-3">Time</th><th className="p-3">Recipe</th><th className="p-3">Vol</th><th className="p-3">Cement</th><th className="p-3">Gravel</th><th className="p-3">Status</th></tr></thead>
                <tbody>{filteredRuns.slice(-5).reverse().map((p, i) => <tr key={i} className="border-b border-white/10"><td className="p-3">{p.date} {p.time}</td><td className="p-3 font-bold text-sky-400">{p.recipe}</td><td className="p-3">{p.volume} m³</td><td className="p-3">{p.cementUsed.toFixed(2)} T</td><td className="p-3">{p.gravelUsed.toFixed(2)} T</td><td className="p-3"><span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold">Dispatched</span></td></tr>)}</tbody></table>
            </div>

            <h4 className="text-xs text-slate-400 uppercase mb-2">🧱 Recent Block Productions</h4>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-left text-sm text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-xs uppercase"><tr><th className="p-3">Date</th><th className="p-3">Block Code</th><th className="p-3">Qty</th><th className="p-3">Cement</th><th className="p-3">Sand</th><th className="p-3">Status</th></tr></thead>
                <tbody>{blockProductions.slice(-5).reverse().map((p, i) => <tr key={i} className="border-b border-white/10"><td className="p-3">{p.date}</td><td className="p-3 font-bold text-sky-400">{p.blockCode}</td><td className="p-3">{p.quantity}</td><td className="p-3">{p.totalCement.toFixed(2)} T</td><td className="p-3">{p.totalSand.toFixed(2)} T</td><td className="p-3"><span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold">Produced</span></td></tr>)}</tbody></table>
            </div>

            <h4 className="text-xs text-slate-400 uppercase mb-2">🧪 {t('admixTitle')} ({additions.length})</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-xs uppercase"><tr><th className="p-3">{t('thName')}</th><th className="p-3">{t('thType')}</th><th className="p-3">{t('thDosage')}</th><th className="p-3">{t('thStock')}</th><th className="p-3">{t('thMinStock')}</th><th className="p-3">{t('thSupplier')}</th><th className="p-3">{t('thActions')}</th></tr></thead>
                <tbody>{additions.map(a => (
                  <tr key={a.id} className="border-b border-white/10">
                    <td className="p-3 font-bold text-white">{a.name}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${a.type === 'delay_set' ? 'bg-blue-500/20 text-blue-400' : a.type === 'strength_enhance' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'}`}>{a.type === 'delay_set' ? t('delaySet') : a.type === 'strength_enhance' ? t('strengthEnhance') : t('integrated')}</span></td>
                    <td className="p-3">{a.dosagePerM3} {a.unit}</td>
                    <td className="p-3"><span className={a.currentStock < a.minStock ? 'text-red-400 font-bold' : 'text-emerald-400'}>{a.currentStock} {a.unit}</span></td>
                    <td className="p-3">{a.minStock} {a.unit}</td>
                    <td className="p-3">{a.supplier}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => startEditAddition(a)} className="bg-sky-500/20 text-sky-400 text-[10px] px-2 py-0.5 rounded hover:bg-sky-500/30">✏️</button>
                        <button onClick={() => deleteAddition(a.id)} className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded hover:bg-red-500/30">🗑️</button>
                      </div>
                    </td>
                  </tr>
                 ))}</tbody></table>
            </div>
          </div>
        </div>
      </main>

      {/* نافذة ربط متحكم المحطة */}
      {showBatchCtrl && <BatchControllerIntegration onClose={() => setShowBatchCtrl(false)} />}
    </div>
  );
}
