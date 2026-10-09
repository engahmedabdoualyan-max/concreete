import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { loadOrders, saveOrders, stampOrderTime } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import DatePicker from '../components/DatePicker';
import EInvoice from '../components/EInvoice';
import CustomersManager, { type Customer } from '../components/CustomersManager';
import NotificationsBell from '../components/NotificationsBell';
import { addNotification } from '../firebase/firestore';
import { sendOrderStatusEmail, sendWhatsAppNotification } from '../lib/notifications';
import { useOrdersDict } from '../i18n/ordersDict';

interface Order {
  id: string;
  orderNo?: string;
  customerId?: string;
  orderDate: string;
  orderTime: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerCode: string; // كود العميل من المحاسب
  projectName: string;
  projectLocation: string;
  locationCoords: string;
  orderType: 'concrete' | 'blocks';
  elementType: string; // نوع العنصر (قواعد، أعمدة، سقف، إلخ)
  quantity: number;
  concreteType: string; // 2000, 2500, 3000, 3500, 4000, 5000
  slump: string;
  cementType: 'ordinary' | 'resistant'; // عادي أو مقاوم
  siteReady: boolean; // جاهزية الموقع
  pumpAccessible: boolean; // إمكانية وصول المضخة
  requiresPump: boolean; // طالب تلج
  requiresLab: boolean; // وجود معمل
  salesRep: string; // اسم المندوب
  accountant: string; // اسم المحاسب
  accountStatus: 'approved' | 'pending' | 'rejected' | 'postponed'; // موافق / مرفوض / مؤجل
  accountantDecision: 'execute' | 'postpone' | 'cancel'; // تنفيذ / تأجيل / إلغاء
  debtStatus: 'clear' | 'has_debt' | 'blocked';
  notes: string;
  status: 'pending' | 'approved' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  /** Server-recorded audit timestamps (Firestore REQUEST_TIME — cannot be forged). */
  serverCreatedAt?: string;
  serverApprovedAt?: string;
  serverUpdatedAt?: string;
  dailyEvaluation?: {
    plantScore: number;
    truckScore: number;
    laborScore: number;
    totalScore: number;
    notes: string;
  };
}

function fmtServerTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('ar-EG', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const ORDERS_KEY = 'concrete_plant_orders';

export default function Orders() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const t = useOrdersDict();
  const [orders, setOrders] = useState<Order[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'scheduled' | 'completed'>('all');
  const [invoiceFor, setInvoiceFor] = useState<Order | null>(null);
  const [evalFor, setEvalFor] = useState<Order | null>(null);
  const [evalForm, setEvalForm] = useState({ plantScore: 0, truckScore: 0, laborScore: 0, notes: '' });
  const [evalSaving, setEvalSaving] = useState(false);

  const openEvaluation = (o: Order) => {
    setEvalFor(o);
    setEvalForm({
      plantScore: o.dailyEvaluation?.plantScore || 0,
      truckScore: o.dailyEvaluation?.truckScore || 0,
      laborScore: o.dailyEvaluation?.laborScore || 0,
      notes: o.dailyEvaluation?.notes || '',
    });
  };

  const saveEvaluation = async () => {
    if (!evalFor) return;
    const { plantScore, truckScore, laborScore, notes } = evalForm;
    if (!plantScore || !truckScore || !laborScore) { alert(t('evalAllThree')); return; }
    setEvalSaving(true);
    const totalScore = plantScore + truckScore + laborScore;
    const updated = orders.map(o => o.id === evalFor.id
      ? { ...o, dailyEvaluation: { plantScore, truckScore, laborScore, totalScore, notes } }
      : o);
    setOrders(updated);
    try {
      await saveOrders(currentUser!.username, updated);
      alert(`${t('evalSavedPrefix')}${totalScore}/15`);
      setEvalFor(null);
    } catch {
      alert(t('evalSaveFailed'));
    }
    setEvalSaving(false);
  };
  const [showCustomers, setShowCustomers] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  useEffect(() => {
    if (!currentUser) return;
    import('../firebase/firestore').then(({ loadTrips }) => loadTrips(currentUser.username)).then(d => { if (Array.isArray(d)) setTrips(d); }).catch(() => {});
  }, [currentUser?.username]);
  const deliveredFor = (orderId?: string) =>
    trips.filter(t => (t.orderId || t.orderNo) === orderId && String(t.status).toUpperCase() === 'COMPLETED')
      .reduce((s, t) => s + (Number(t.qty) || 0), 0);
  const isCustomerHeld = (o: any) => !!customers.find(c => (c.id === o.customerId || c.name === o.customerName) && c.creditHold);
  useEffect(() => {
    if (!currentUser) return;
    import('../firebase/firestore').then(({ loadCustomers }) => loadCustomers(currentUser.username)).then(d => {
      if (Array.isArray(d) && d.length) setCustomers(d);
      else { const s = localStorage.getItem('concrete_plant_customers'); if (s) setCustomers(JSON.parse(s)); }
    }).catch(() => {});
  }, [currentUser?.username]);

  const [form, setForm] = useState({
    orderDate: new Date().toISOString().split('T')[0],
    orderTime: '08:00',
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerCode: '',
    projectName: '',
    projectLocation: '',
    locationCoords: '',
    orderType: 'concrete' as 'concrete' | 'blocks',
    elementType: 'foundation',
    quantity: '',
    concreteType: '3000',
    slump: '12',
    cementType: 'ordinary' as 'ordinary' | 'resistant',
    siteReady: true,
    pumpAccessible: true,
    requiresPump: false,
    requiresLab: false,
    salesRep: '',
    accountant: '',
    accountStatus: 'pending' as 'approved' | 'pending' | 'rejected' | 'postponed',
    accountantDecision: 'execute' as 'execute' | 'postpone' | 'cancel',
    debtStatus: 'clear' as 'clear' | 'has_debt' | 'blocked',
    notes: '',
  });

  // Server-time audit stamps queued until the orders doc is saved
  const pendingStamps = useRef<{ id: string; field: 'createdAt' | 'approvedAt' | 'updatedAt' }[]>([]);

  // ── ERP backend (central orders): clients, mixes, delivery sites ──
  const [erpOrders, setErpOrders] = useState<any[]>([]);
  const [erpClients, setErpClients] = useState<any[]>([]);
  const [erpMixes, setErpMixes] = useState<any[]>([]);
  const [erpSites, setErpSites] = useState<any[]>([]);
  const [erpMsg, setErpMsg] = useState('');
  const [erpBusy, setErpBusy] = useState('');
  const [erpForm, setErpForm] = useState({ clientId: '', siteId: '', mixId: '', volume: '', price: '', date: new Date().toISOString().slice(0, 10), time: '08:00', notes: '' });
  const [showClientAdd, setShowClientAdd] = useState(false);
  const [newClient, setNewClient] = useState({ companyName: '', phone: '', vatNumber: '' });
  const [showSiteAdd, setShowSiteAdd] = useState(false);
  const [newSite, setNewSite] = useState({ siteName: '', city: '' });

  const loadErp = async () => {
    try {
      const [c, m, o] = await Promise.all([
        api.get<any[]>('/api/clients').catch(() => []),
        api.get<any[]>('/api/mix-designs').catch(() => []),
        api.get<{ orders?: any[] }>('/api/orders').catch(() => ({ orders: [] })),
      ]);
      setErpClients(Array.isArray(c) ? c : []);
      setErpMixes(Array.isArray(m) ? m : (m as any)?.designs ?? []);
      setErpOrders(Array.isArray((o as any)?.orders) ? (o as any).orders : []);
    } catch { /* backend unreachable — legacy local mode stays */ }
  };

  const loadErpSites = async (clientId: string) => {
    if (!clientId) {
      setErpSites([]);
      return;
    }
    try {
      const s = await api.get<any[]>(`/api/clients/${clientId}/sites`);
      setErpSites(Array.isArray(s) ? s : []);
    } catch { setErpSites([]); }
  };

  useEffect(() => {
    if (!currentUser) return;
    loadErp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  const erpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!erpForm.clientId || !erpForm.siteId || !erpForm.mixId || !erpForm.volume) {
      setErpMsg(t('fillRequired'));
      return;
    }
    setErpBusy('create');
    try {
      await api.post('/api/orders', {
        clientId: erpForm.clientId,
        deliverySiteId: erpForm.siteId,
        mixDesignId: erpForm.mixId,
        totalVolumeM3: Number(erpForm.volume),
        ...(erpForm.price.trim() ? { pricePerM3Sar: Math.round(Number(erpForm.price) * 100) } : {}),
        scheduledDate: new Date(`${erpForm.date}T${erpForm.time}:00+03:00`).toISOString(),
        ...(erpForm.notes.trim() ? { specialInstructions: erpForm.notes.trim() } : {}),
      });
      setErpMsg('✅');
      setErpForm({ clientId: '', siteId: '', mixId: '', volume: '', price: '', date: new Date().toISOString().slice(0, 10), time: '08:00', notes: '' });
      setErpSites([]);
      await loadErp();
    } catch (err: any) {
      setErpMsg(`❌ ${err?.message ?? ''}`);
    } finally {
      setErpBusy('');
    }
  };

  const erpFinance = async (orderId: string, decision: 'approve' | 'reject') => {
    setErpBusy(decision + orderId);
    try {
      await api.post(`/api/finance/${decision}`, { orderId });
      await loadErp();
    } catch (err: any) {
      setErpMsg(`❌ ${err?.message ?? ''}`);
    } finally {
      setErpBusy('');
    }
  };

  const erpAddClient = async () => {
    if (!newClient.companyName.trim()) return;
    setErpBusy('client');
    try {
      const r = await api.post<{ id?: string }>('/api/clients', {
        companyName: newClient.companyName.trim(),
        ...(newClient.phone.trim() ? { phone: newClient.phone.trim() } : {}),
        ...(newClient.vatNumber.trim() ? { vatNumber: newClient.vatNumber.trim() } : {}),
      });
      setNewClient({ companyName: '', phone: '', vatNumber: '' });
      setShowClientAdd(false);
      await loadErp();
      if ((r as any)?.id) {
        setErpForm((p) => ({ ...p, clientId: (r as any).id }));
        loadErpSites((r as any).id);
      }
    } catch (err: any) {
      setErpMsg(`❌ ${err?.message ?? ''}`);
    } finally {
      setErpBusy('');
    }
  };

  const erpAddSite = async () => {
    if (!erpForm.clientId || !newSite.siteName.trim()) return;
    setErpBusy('site');
    try {
      const r = await api.post<{ id?: string }>(`/api/clients/${erpForm.clientId}/sites`, {
        siteName: newSite.siteName.trim(),
        ...(newSite.city.trim() ? { city: newSite.city.trim() } : {}),
      });
      setNewSite({ siteName: '', city: '' });
      setShowSiteAdd(false);
      await loadErpSites(erpForm.clientId);
      if ((r as any)?.id) setErpForm((p) => ({ ...p, siteId: (r as any).id }));
    } catch (err: any) {
      setErpMsg(`❌ ${err?.message ?? ''}`);
    } finally {
      setErpBusy('');
    }
  };

  // Load orders from localStorage + Firestore
  useEffect(() => {
    if (!currentUser) return;
    loadOrders(currentUser.username)
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) setOrders(data);
        else {
          const saved = localStorage.getItem(ORDERS_KEY);
          if (saved) setOrders(JSON.parse(saved));
        }
      })
      .catch(() => {
        const saved = localStorage.getItem(ORDERS_KEY);
        if (saved) setOrders(JSON.parse(saved));
      });
  }, [currentUser?.username]);

  // Save orders to localStorage + Firestore
  useEffect(() => {
    if (!currentUser) return;
    if (orders.length > 0 || localStorage.getItem(ORDERS_KEY)) {
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }
    if (orders.length > 0) {
      saveOrders(currentUser.username, orders)
        .then(() => {
          // Server-stamp queued audit times AFTER the doc exists (avoids races)
          const pending = pendingStamps.current;
          pendingStamps.current = [];
          pending.forEach(s => stampOrderTime(currentUser!.username, s.id, s.field).catch(() => {}));
        })
        .catch(() => {});
    }
  }, [orders, currentUser?.username]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.customerName || !form.customerPhone || !form.projectName || !form.quantity) {
      alert(t('fillRequired'));
      return;
    }

    let orderNo = editingOrder?.orderNo;
    if (!orderNo) {
      const maxNum = orders.reduce((m, o) => Math.max(m, (parseInt(String(o.orderNo || '').replace('ORD-', ''), 10) || 0)), 0);
      orderNo = 'ORD-' + String(maxNum + 1).padStart(4, '0');
    }

    const newOrder: Order = {
      id: editingOrder?.id || Date.now().toString(),
      orderNo,
      customerId: form.customerId || editingOrder?.customerId,
      orderDate: form.orderDate,
      orderTime: form.orderTime,
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerEmail: form.customerEmail,
      projectName: form.projectName,
      projectLocation: form.projectLocation,
      locationCoords: form.locationCoords,
      orderType: form.orderType,
      elementType: form.elementType,
      quantity: parseFloat(form.quantity),
      concreteType: form.concreteType,
      cementType: form.cementType,
      slump: form.slump,
      siteReady: form.siteReady,
      pumpAccessible: form.pumpAccessible,
      requiresPump: form.requiresPump,
      requiresLab: form.requiresLab,
      salesRep: form.salesRep,
      accountant: form.accountant,
      customerCode: form.customerCode,
      accountantDecision: form.accountantDecision,
      accountStatus: form.accountStatus,
      debtStatus: form.debtStatus,
      notes: form.notes,
      status: 'pending',
    };

    if (editingOrder) {
      setOrders(prev => prev.map(o => o.id === editingOrder.id ? newOrder : o));
      setEditingOrder(null);
      if (currentUser) addNotification(currentUser.username, { level: 'info', title: `${t('editedOrder')} ${orderNo}`, body: `${form.customerName} · ${form.projectName}` }).catch(() => {});
    } else {
      setOrders(prev => [...prev, newOrder]);
      // Server-stamp the creation time (anti-tamper audit trail)
      pendingStamps.current.push({ id: newOrder.id, field: 'createdAt' });
      if (currentUser) addNotification(currentUser.username, { level: 'info', title: `${t('newOrder')} ${orderNo}`, body: `${form.customerName} · ${form.quantity} ${form.orderType === 'concrete' ? t('m3') : t('blockUnit')} · ${t('awaitingAccounts')}` }).catch(() => {});
    }

    resetForm();
    setShowForm(false);
  };

  const resetForm = () => {
    setForm({
      orderDate: new Date().toISOString().split('T')[0],
      orderTime: '08:00',
      customerId: '',
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      customerCode: '',
      projectName: '',
      projectLocation: '',
      locationCoords: '',
      orderType: 'concrete',
      elementType: 'foundation',
      quantity: '',
      concreteType: '3000',
      slump: '12',
      cementType: 'ordinary',
      siteReady: true,
      pumpAccessible: true,
      requiresPump: false,
      requiresLab: false,
      salesRep: '',
      accountant: '',
      accountStatus: 'pending',
      accountantDecision: 'execute',
      debtStatus: 'clear',
      notes: '',
    });
  };

  const handleEdit = (order: Order) => {
    setEditingOrder(order);
    setForm({
      orderDate: order.orderDate,
      orderTime: order.orderTime,
      customerId: order.customerId || '',
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail || '',
      customerCode: order.customerCode || '',
      projectName: order.projectName,
      projectLocation: order.projectLocation,
      locationCoords: order.locationCoords,
      orderType: order.orderType,
      elementType: order.elementType || 'foundation',
      quantity: order.quantity.toString(),
      concreteType: order.concreteType || '3000',
      slump: order.slump || '12',
      cementType: order.cementType || 'ordinary',
      siteReady: order.siteReady !== false,
      pumpAccessible: order.pumpAccessible !== false,
      requiresPump: order.requiresPump === true,
      requiresLab: order.requiresLab === true,
      salesRep: order.salesRep || '',
      accountant: order.accountant || '',
      accountStatus: order.accountStatus,
      accountantDecision: order.accountantDecision || 'execute',
      debtStatus: order.debtStatus,
      notes: order.notes,
    });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm(t('deleteConfirm'))) {
      setOrders(prev => prev.filter(o => o.id !== id));
    }
  };

  const handleApproveAccount = (id: string, status: 'approved' | 'rejected') => {
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o;
      if (currentUser) {
        addNotification(currentUser.username, {
          level: status === 'approved' ? 'success' : 'error',
          title: `${status === 'approved' ? t('accountsApproved') : t('accountsRejected')} ${o.orderNo || id}`,
          body: `${o.customerName} · ${o.projectName}`,
        }).catch(() => {});
        // Record WHO approved + server-stamp the decision time (anti-tamper)
        if (status === 'approved') {
          pendingStamps.current.push({ id, field: 'approvedAt' });
        }
      }
      // Send email notification to customer
      sendOrderStatusEmail({
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        customerEmail: (o as any).customerEmail,
        orderNo: o.orderNo,
        projectName: o.projectName,
        quantity: o.quantity,
        concreteType: o.concreteType,
        status: status === 'approved' ? 'approved' : 'cancelled',
      }).catch(() => {});
      // Send WhatsApp notification to customer
      sendWhatsAppNotification({
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        orderNo: o.orderNo,
        projectName: o.projectName,
        quantity: o.quantity,
        concreteType: o.concreteType,
        status: status === 'approved' ? 'approved' : 'cancelled',
      });
      const accountantName = currentUser?.fullName || currentUser?.plantName || currentUser?.username || 'المحاسب';
      return { ...o, accountStatus: status, accountant: status === 'approved' ? accountantName : o.accountant };
    }));
  };

  const handleMarkScheduled = (id: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o;
      const held = customers.find(c => c.id === o.customerId);
      if (held?.creditHold) {
        alert(`${t('holdPrefix')}${o.customerName}${t('holdSuffix')}`);
        return o;
      }
      if (currentUser) addNotification(currentUser.username, {
        level: 'info', title: `${t('scheduledTitle')} ${o.orderNo || id}`,
        body: `${o.customerName} · ${o.quantity} ${o.orderType === 'concrete' ? t('m3') : t('blockUnit')} — ${t('readyForRun')}`,
      }).catch(() => {});
      // Send email notification to customer
      sendOrderStatusEmail({
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        customerEmail: (o as any).customerEmail,
        orderNo: o.orderNo,
        projectName: o.projectName,
        quantity: o.quantity,
        concreteType: o.concreteType,
        status: 'scheduled',
      }).catch(() => {});
      // Send WhatsApp notification to customer
      sendWhatsAppNotification({
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        orderNo: o.orderNo,
        projectName: o.projectName,
        quantity: o.quantity,
        concreteType: o.concreteType,
        status: 'scheduled',
      });
      return { ...o, status: 'scheduled' };
    }));
  };

  const handleMarkCompleted = (id: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o;
      if (currentUser) addNotification(currentUser.username, {
        level: 'success', title: `${t('completedTitle')} ${o.orderNo || id}`,
        body: `${o.customerName} · ${o.projectName}`,
      }).catch(() => {});
      // Send email notification to customer
      sendOrderStatusEmail({
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        customerEmail: (o as any).customerEmail,
        orderNo: o.orderNo,
        projectName: o.projectName,
        quantity: o.quantity,
        concreteType: o.concreteType,
        status: 'completed',
      }).catch(() => {});
      // Send WhatsApp notification to customer
      sendWhatsAppNotification({
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        orderNo: o.orderNo,
        projectName: o.projectName,
        quantity: o.quantity,
        concreteType: o.concreteType,
        status: 'completed',
      });
      return { ...o, status: 'completed' };
    }));
  };

  const filteredOrders = orders.filter(o => {
    if (filter === 'all') return true;
    return o.status === filter;
  });

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    scheduled: orders.filter(o => o.status === 'scheduled').length,
    completed: orders.filter(o => o.status === 'completed').length,
    accountPending: orders.filter(o => o.accountStatus === 'pending').length,
    hasDebt: orders.filter(o => o.debtStatus === 'has_debt').length,
    blocked: orders.filter(o => o.debtStatus === 'blocked').length,
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0B111E] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">🔒 Access Denied</p>
          <Link to="/" className="text-sky-400 underline">Back to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      {/* Header */}
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump />
          <LangSelector />
          <h1 className="text-sm font-black tracking-tight text-white">{t('ordersSystem')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NotificationsBell />
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <button onClick={() => { logout(); navigate('/'); }} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">{t('logout')}</button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <div className="bg-white/[0.04] border border-white/10 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">{t('totalOrders')}</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="bg-white/[0.04] border border-yellow-500/30 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">{t('pending')}</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
          </div>
          <div className="bg-white/[0.04] border border-sky-500/30 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">{t('scheduled')}</p>
            <p className="text-2xl font-bold text-sky-400">{stats.scheduled}</p>
          </div>
          <div className="bg-white/[0.04] border border-emerald-500/30 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">{t('completed')}</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.completed}</p>
          </div>
          <div className="bg-white/[0.04] border border-orange-500/30 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">{t('awaitingAccountsShort')}</p>
            <p className="text-2xl font-bold text-orange-400">{stats.accountPending}</p>
          </div>
          <div className="bg-white/[0.04] border border-sky-500/30 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">{t('hasDebt')}</p>
            <p className="text-2xl font-bold text-sky-400">{stats.hasDebt}</p>
          </div>
          <div className="bg-white/[0.04] border border-red-500/30 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">{t('blocked')}</p>
            <p className="text-2xl font-bold text-red-400">{stats.blocked}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setShowCustomers(true)}
              className="bg-sky-500 hover:bg-sky-400 text-white px-4 py-2 rounded-lg font-bold text-sm"
            >
              {t('manageCustomers')}
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-[0_0_20px_rgba(56,189,248,0.3)]"
            >
              {t('addNewOrder')}
            </button>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="bg-white/[0.04] border border-white/10 text-white px-4 py-2 rounded-lg text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
            >
              <option value="all">{t('allOrders')}</option>
              <option value="pending">{t('pending')}</option>
              <option value="scheduled">{t('scheduled')}</option>
              <option value="completed">{t('completed')}</option>
            </select>
          </div>
          <Link
            to="/schedule"
            className="bg-sky-500 hover:bg-sky-400 text-white px-4 py-2 rounded-lg font-bold text-sm"
          >
            {t('goToSchedule')}
          </Link>
        </div>

        {/* ===== Central ERP order (concrete) ===== */}
        <div className="bg-emerald-500/[0.05] border border-emerald-500/20 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-black text-emerald-300 mb-1">🏭 {t('erpOrderTitle') ?? 'طلب مركزي (خرسانة)'}</h3>
          <p className="text-[11px] text-slate-400 mb-3">
            {t('erpOrderHint') ?? 'يُسجل في النظام المركزي: العميل + الموقع + الخلطة + المالية والتشغيل والبوابة.'}
          </p>
          {erpMsg && <p className="text-xs font-bold mb-2">{erpMsg}</p>}
          <form onSubmit={erpSubmit} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <label className="text-[11px] text-slate-400 font-bold">{t('thCustomer') ?? 'العميل'} *
              <span className="flex gap-1 mt-0.5">
                <select value={erpForm.clientId} onChange={(e) => { setErpForm({ ...erpForm, clientId: e.target.value, siteId: '' }); loadErpSites(e.target.value); }}
                  className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                  <option value="">—</option>
                  {erpClients.map((c: any) => <option key={c.id} value={c.id}>{c.companyName} · {c.clientCode}</option>)}
                </select>
                <button type="button" onClick={() => setShowClientAdd((v) => !v)} title="+"
                  className="border border-emerald-500/50 text-emerald-300 rounded-lg px-2 text-sm">+</button>
              </span></label>
            <label className="text-[11px] text-slate-400 font-bold">{t('thProject') ?? 'الموقع'} *
              <span className="flex gap-1 mt-0.5">
                <select value={erpForm.siteId} onChange={(e) => setErpForm({ ...erpForm, siteId: e.target.value })}
                  className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                  <option value="">—</option>
                  {erpSites.map((s: any) => <option key={s.id} value={s.id}>{s.siteName}</option>)}
                </select>
                <button type="button" disabled={!erpForm.clientId} onClick={() => setShowSiteAdd((v) => !v)} title="+"
                  className="border border-emerald-500/50 text-emerald-300 rounded-lg px-2 text-sm disabled:opacity-40">+</button>
              </span></label>
            <label className="text-[11px] text-slate-400 font-bold">{t('mixLabel') ?? 'الخلطة'} *
              <select value={erpForm.mixId} onChange={(e) => setErpForm({ ...erpForm, mixId: e.target.value })}
                className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                <option value="">—</option>
                {erpMixes.map((m: any) => <option key={m.id} value={m.id}>{m.designCode} · {m.gradeDescription}</option>)}
              </select></label>
            <label className="text-[11px] text-slate-400 font-bold">{t('thQty') ?? 'م³'} *
              <input value={erpForm.volume} inputMode="decimal" onChange={(e) => setErpForm({ ...erpForm, volume: e.target.value })}
                className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
            <label className="text-[11px] text-slate-400 font-bold">{t('priceLabel') ?? 'السعر/م³'} 
              <input value={erpForm.price} inputMode="decimal" onChange={(e) => setErpForm({ ...erpForm, price: e.target.value })}
                className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
            <label className="text-[11px] text-slate-400 font-bold">{t('thDateTime') ?? 'الموعد'}
              <span className="flex gap-1 mt-0.5">
                <input type="date" value={erpForm.date} onChange={(e) => setErpForm({ ...erpForm, date: e.target.value })}
                  className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
                <input type="time" value={erpForm.time} onChange={(e) => setErpForm({ ...erpForm, time: e.target.value })}
                  className="w-20 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
              </span></label>
          </form>
          <input value={erpForm.notes} onChange={(e) => setErpForm({ ...erpForm, notes: e.target.value })}
            placeholder={t('notesLabel') ?? 'ملاحظات'}
            className="mt-2 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
          <button onClick={erpSubmit} disabled={erpBusy === 'create'}
            className="mt-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
            {erpBusy === 'create' ? '…' : `✅ ${t('saveOrder')}`}
          </button>
          {showClientAdd && (
            <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input value={newClient.companyName} onChange={(e) => setNewClient({ ...newClient, companyName: e.target.value })}
                placeholder={t('thCustomer') ?? 'العميل'} className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
              <input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                placeholder={t('phoneLabel') ?? 'الجوال'} className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
              <input value={newClient.vatNumber} onChange={(e) => setNewClient({ ...newClient, vatNumber: e.target.value })}
                placeholder={t('vatLabel') ?? 'الرقم الضريبي'} className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
              <button onClick={erpAddClient} disabled={erpBusy === 'client'}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-4 py-1.5">
                {erpBusy === 'client' ? '…' : `➕ ${t('thCustomer') ?? 'عميل'}`}
              </button>
            </div>
          )}
          {showSiteAdd && (
            <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input value={newSite.siteName} onChange={(e) => setNewSite({ ...newSite, siteName: e.target.value })}
                placeholder={t('thProject') ?? 'الموقع'} className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
              <input value={newSite.city} onChange={(e) => setNewSite({ ...newSite, city: e.target.value })}
                placeholder={t('cityLabel') ?? 'المدينة'} className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
              <button onClick={erpAddSite} disabled={erpBusy === 'site'}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-4 py-1.5">
                {erpBusy === 'site' ? '…' : `➕ ${t('thProject') ?? 'موقع'}`}
              </button>
            </div>
          )}
          {erpOrders.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full">
                <thead><tr className="text-[10px] text-slate-400">
                  <th className="text-right p-2">{t('thOrderNo')}</th>
                  <th className="text-right p-2">{t('thCustomer')}</th>
                  <th className="text-right p-2">{t('thProject')}</th>
                  <th className="text-right p-2">{t('thQty')}</th>
                  <th className="text-right p-2">{t('thStatus')}</th>
                  <th className="text-right p-2">{t('thActions')}</th>
                </tr></thead>
                <tbody>
                  {erpOrders.map((o: any) => (
                    <tr key={o.id} className="border-t border-white/5 text-xs">
                      <td className="p-2 font-mono" dir="ltr">{o.orderNumber}</td>
                      <td className="p-2">{o.companyName ?? o.clientName ?? ''}</td>
                      <td className="p-2">{o.siteName ?? ''}</td>
                      <td className="p-2">{o.totalVolumeM3} م³</td>
                      <td className="p-2"><span className="rounded px-2 py-0.5 bg-white/10 text-slate-200 text-[10px] font-black">{o.status}</span></td>
                      <td className="p-2 flex gap-1">
                        <button disabled={erpBusy === 'approve' + o.id} onClick={() => erpFinance(o.id, 'approve')}
                          className="text-[10px] font-black rounded px-2 py-1 border border-emerald-500/40 text-emerald-300 disabled:opacity-50">
                          {erpBusy === 'approve' + o.id ? '…' : (t('approveLabel') ?? 'اعتماد')}</button>
                        <button disabled={erpBusy === 'reject' + o.id} onClick={() => erpFinance(o.id, 'reject')}
                          className="text-[10px] font-black rounded px-2 py-1 border border-red-500/40 text-red-300 disabled:opacity-50">
                          {erpBusy === 'reject' + o.id ? '…' : (t('rejectLabel') ?? 'رفض')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Order Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-[#0B111E]/95 border border-white/10 rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-black tracking-tight text-white mb-4">
                {editingOrder ? `${t('editOrder')} ${editingOrder.orderNo || ''}` : t('newOrderModal')}
              </h2>

              {editingOrder?.orderNo && (
                <p className="text-xs font-bold text-sky-400 mb-3">{t('orderNoLabel')} <span className="text-white">{editingOrder.orderNo}</span></p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* التاريخ والوقت */}
                <div className="grid grid-cols-2 gap-4">
                  <DatePicker
                    value={form.orderDate}
                    onChange={(val) => setForm(prev => ({ ...prev, orderDate: val }))}
                    label={t('orderDateLabel')}
                    required
                  />
                  <div>
                    <label className="text-xs text-slate-400 font-semibold mb-1 block">{t('orderTimeLabel')}</label>
                    <input
                      type="time"
                      name="orderTime"
                      value={form.orderTime}
                      onChange={handleInputChange}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                      required
                    />
                  </div>
                </div>

                {/* بيانات العميل */}
                <div className="bg-[#0B111E] p-4 rounded-lg border border-white/10">
                  <h3 className="text-sm font-bold text-sky-400 mb-3">{t('customerData')}</h3>
                  <div className="grid grid-cols-1 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">{t('customerHint')}</label>
                      <select
                        name="customerId"
                        value={form.customerId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setForm(prev => ({ ...prev, customerId: id }));
                          if (id) {
                            const c = [...customers].find(x => x.id === id);
                            if (c) setForm(prev => ({ ...prev, customerName: c.name, customerPhone: c.phone, customerCode: c.code }));
                          }
                        }}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                      >
                        <option value="">{t('noSelection')}</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">{t('customerNameLabel')}</label>
                      <input
                        type="text"
                        name="customerName"
                        value={form.customerName}
                        onChange={handleInputChange}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">{t('customerPhoneLabel')}</label>
                      <input
                        type="tel"
                        name="customerPhone"
                        value={form.customerPhone}
                        onChange={handleInputChange}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">{t('customerEmailLabel')}</label>
                      <input
                        type="email"
                        name="customerEmail"
                        value={form.customerEmail}
                        onChange={handleInputChange}
                        placeholder="example@email.com"
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                      />
                    </div>
                  </div>
                </div>

                {/* بيانات المشروع */}
                <div className="bg-[#0B111E] p-4 rounded-lg border border-white/10">
                  <h3 className="text-sm font-bold text-sky-400 mb-3">{t('projectData')}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">{t('projectNameLabel')}</label>
                      <input
                        type="text"
                        name="projectName"
                        value={form.projectName}
                        onChange={handleInputChange}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">{t('projectLocationLabel')}</label>
                      <input
                        type="text"
                        name="projectLocation"
                        value={form.projectLocation}
                        onChange={handleInputChange}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">{t('locationCoordsLabel')}</label>
                      <input
                        type="text"
                        name="locationCoords"
                        value={form.locationCoords}
                        onChange={handleInputChange}
                        placeholder="26.4207, 50.0888"
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                      />
                    </div>
                  </div>
                </div>

                {/* تفاصيل الطلب */}
                <div className="bg-[#0B111E] p-4 rounded-lg border border-white/10">
                  <h3 className="text-sm font-bold text-sky-400 mb-3">{t('orderDetails')}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">{t('orderTypeLabel')}</label>
                      <select
                        name="orderType"
                        value={form.orderType}
                        onChange={handleInputChange}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                      >
                        <option value="concrete">🏗️ {t('concreteLabel')}</option>
                        <option value="blocks">🧱 {t('blocksLabel')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">{t('elementTypeLabel')}</label>
                      <select
                        name="elementType"
                        value={form.elementType}
                        onChange={handleInputChange}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                        required
                      >
                        <option value="foundation">🏗️ {t('elFoundation')}</option>
                        <option value="columns">🏛️ {t('elColumns')}</option>
                        <option value="beams">📏 {t('elBeams')}</option>
                        <option value="slab">🏠 {t('elSlab')}</option>
                        <option value="walls">🧱 {t('elWalls')}</option>
                        <option value="stairs">🪜 {t('elStairs')}</option>
                        <option value="cleaning_layer">🧹 {t('elCleaning')}</option>
                        <option value="other">📦 {t('elOther')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">{t('quantityLabel')}</label>
                      <input
                        type="number"
                        name="quantity"
                        value={form.quantity}
                        onChange={handleInputChange}
                        step="0.5"
                        min="0"
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                        required
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        {form.orderType === 'concrete' ? t('cubicMeter') : t('blocksCount')}
                      </p>
                    </div>

                    {form.orderType === 'concrete' && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-slate-400 mb-1 block">{t('concreteStrength')}</label>
                            <select
                              name="concreteType"
                              value={form.concreteType}
                              onChange={handleInputChange}
                              className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                              required
                            >
                              <option value="2000">2000 ({t('grade2000')})</option>
                              <option value="2500">2500</option>
                              <option value="3000">3000</option>
                              <option value="3500">3500</option>
                              <option value="4000">4000</option>
                              <option value="5000">5000 ({t('grade5000')})</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 mb-1 block">Slump (cm)</label>
                            <input
                              type="number"
                              name="slump"
                              value={form.slump}
                              onChange={handleInputChange}
                              min="5"
                              max="20"
                              className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-slate-400 mb-1 block">{t('cementTypeLabel')}</label>
                          <select
                            name="cementType"
                            value={form.cementType}
                            onChange={handleInputChange}
                            className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                            required
                          >
                            <option value="ordinary">🏭 {t('cementOrdinary')}</option>
                            <option value="resistant">🛡️ {t('cementResistant')}</option>
                          </select>
                        </div>
                      </>
                    )}

                    {/* جاهزية الموقع */}
                    <div className="border-t border-white/10 pt-3 mt-3">
                      <label className="text-xs text-sky-400 font-bold mb-2 block">{t('siteReadiness')}</label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer bg-white/[0.06] p-2 rounded">
                          <input
                            type="checkbox"
                            name="siteReady"
                            checked={form.siteReady}
                            onChange={e => setForm({ ...form, siteReady: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span>✓ {t('siteReadyYes')}</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer bg-white/[0.06] p-2 rounded">
                          <input
                            type="checkbox"
                            name="pumpAccessible"
                            checked={form.pumpAccessible}
                            onChange={e => setForm({ ...form, pumpAccessible: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span>✓ {t('pumpAccessibleYes')}</span>
                        </label>
                      </div>
                    </div>

                    {/* المتطلبات */}
                    <div className="border-t border-white/10 pt-3 mt-3">
                      <label className="text-xs text-sky-400 font-bold mb-2 block">{t('requirements')}</label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer bg-white/[0.06] p-2 rounded">
                          <input
                            type="checkbox"
                            name="requiresPump"
                            checked={form.requiresPump}
                            onChange={e => setForm({ ...form, requiresPump: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span>🚰 {t('requiresPumpLabel')}</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer bg-white/[0.06] p-2 rounded">
                          <input
                            type="checkbox"
                            name="requiresLab"
                            checked={form.requiresLab}
                            onChange={e => setForm({ ...form, requiresLab: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span>🧪 {t('requiresLabLabel')}</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* المندوب والمحاسب */}
                <div className="bg-white/[0.03] p-4 rounded-lg border border-sky-500/30">
                  <h3 className="text-sm font-bold text-sky-400 mb-3">{t('repAndAccountant')}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">📱 {t('salesRepLabel')}</label>
                      <input
                        type="text"
                        name="salesRep"
                        value={form.salesRep}
                        onChange={handleInputChange}
                        placeholder={t('salesRepPlaceholder')}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">💼 {t('accountantLabel')}</label>
                      <input
                        type="text"
                        name="accountant"
                        value={form.accountant}
                        onChange={handleInputChange}
                        placeholder={t('accountantPlaceholder')}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                        required
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs text-slate-400 mb-1 block">🔢 {t('customerCodeLabel')}</label>
                    <input
                      type="text"
                      name="customerCode"
                      value={form.customerCode}
                      onChange={handleInputChange}
                      placeholder={t('customerCodePlaceholder')}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                    />
                  </div>
                </div>

                {/* قرار المحاسب */}
                <div className="bg-[#0B111E] p-4 rounded-lg border border-orange-500/30">
                  <h3 className="text-sm font-bold text-orange-400 mb-3">{t('accountantDecisionSection')}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">{t('accountantDecisionLabel')}</label>
                      <select
                        name="accountantDecision"
                        value={form.accountantDecision}
                        onChange={handleInputChange}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                        required
                      >
                        <option value="execute">✅ {t('decisionExecute')}</option>
                        <option value="postpone">⏸️ {t('decisionPostpone')}</option>
                        <option value="cancel">❌ {t('decisionCancel')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">{t('accountStatusLabel')}</label>
                      <select
                        name="accountStatus"
                        value={form.accountStatus}
                        onChange={handleInputChange}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                      >
                        <option value="pending">⏳ {t('accPending')}</option>
                        <option value="approved">✅ {t('accApproved')}</option>
                        <option value="rejected">❌ {t('accRejected')}</option>
                        <option value="postponed">⏸️ {t('accPostponed')}</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs text-slate-400 mb-1 block">⚠️ {t('debtStatusLabel')}</label>
                    <select
                      name="debtStatus"
                      value={form.debtStatus}
                      onChange={handleInputChange}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                    >
                      <option value="clear">✅ {t('debtClear')}</option>
                      <option value="has_debt">⚠️ {t('debtHasFull')}</option>
                      <option value="blocked">🚫 {t('debtBlockedFull')}</option>
                    </select>
                  </div>
                </div>

                {/* ملاحظات */}
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">{t('notesLabel')}</label>
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                  />
                </div>

                {/* أزرار */}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg"
                  >
                    💾 {editingOrder ? t('updateOrder') : t('saveOrder')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setEditingOrder(null); resetForm(); }}
                    className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold py-2 rounded-lg"
                  >
                    ❌ {t('cancel')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Orders List */}
        <div className="bg-white/[0.04] rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/[0.04] border-b border-white/10">
                <tr>
                  <th className="text-right p-3 text-[10px] uppercase tracking-wider text-slate-400">{t('thDateTime')}</th>
                  <th className="text-right p-3 text-[10px] uppercase tracking-wider text-slate-400">{t('thOrderNo')}</th>
                  <th className="text-right p-3 text-[10px] uppercase tracking-wider text-slate-400">{t('thCustomer')}</th>
                  <th className="text-right p-3 text-[10px] uppercase tracking-wider text-slate-400">{t('thProject')}</th>
                  <th className="text-right p-3 text-[10px] uppercase tracking-wider text-slate-400">{t('thType')}</th>
                  <th className="text-right p-3 text-[10px] uppercase tracking-wider text-slate-400">{t('thQty')}</th>
                  <th className="text-right p-3 text-[10px] uppercase tracking-wider text-slate-400">{t('thAccounts')}</th>
                  <th className="text-right p-3 text-[10px] uppercase tracking-wider text-slate-400">{t('thDebt')}</th>
                  <th className="text-right p-3 text-[10px] uppercase tracking-wider text-slate-400">{t('thStatus')}</th>
                  <th className="text-right p-3 text-[10px] uppercase tracking-wider text-slate-400">{t('thActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-slate-500">
                      {t('noOrders')}
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(order => (
                    <tr key={order.id} className="border-b border-white/10 hover:bg-white/[0.05]">
                      <td className="p-3 text-sm">
                        <div className="text-white">{order.orderDate}</div>
                        <div className="text-xs text-slate-400">{order.orderTime}</div>
                      </td>
                      <td className="p-3 text-sm">
                        <div className="text-white font-bold text-sky-400">{order.orderNo || '—'}</div>
                        <div className="text-xs text-slate-400">{order.customerCode || '—'}</div>
                      </td>
                      <td className="p-3">
                        <div className="text-white text-sm">{order.customerName} {isCustomerHeld(order) && <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold ml-1">⛔ HOLD</span>}</div>
                        <div className="text-xs text-slate-400">{order.customerPhone}</div>
                        <div className="text-[10px] text-sky-400 mt-0.5">
                          📋 {t('salesRep')}: {order.salesRep || '—'}
                          {order.serverCreatedAt ? ` · 🕓 ${fmtServerTime(order.serverCreatedAt)}` : ''}
                        </div>
                      </td>
                      <td className="p-3 text-sm text-white">{order.projectName}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          order.orderType === 'concrete'
                            ? 'bg-sky-500/20 text-sky-400'
                            : 'bg-cyan-500/20 text-cyan-400'
                        }`}>
                          {order.orderType === 'concrete' ? `🏗️ ${t('concreteLabel')}` : `🧱 ${t('blocksLabel')}`}
                        </span>
                        {order.concreteType && (
                          <div className="text-xs text-slate-400 mt-1">{order.concreteType}</div>
                        )}
                      </td>
                      <td className="p-3 text-white text-sm">
                        {(() => {
                          const d = deliveredFor(order.id || order.orderNo);
                          const total = Number(order.quantity) || 0;
                          const pct = total > 0 ? Math.min(100, (d / total) * 100) : 0;
                          return (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <span>{order.quantity}</span>
                                <span className="text-[10px] text-slate-400">{order.orderType === 'concrete' ? t('m3') : t('blockUnit')}</span>
                              </div>
                              {order.orderType === 'concrete' && (
                                <div className="mt-1">
                                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                  <p className={`text-[10px] font-bold mt-0.5 ${pct >= 100 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                    {t('deliveredPrefix')} {d.toFixed(1)} / {total} {t('m3')}
                                  </p>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </td>
                      <td className="p-3">
                        <select
                          value={order.accountStatus}
                          onChange={(e) => handleApproveAccount(order.id, e.target.value as any)}
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            order.accountStatus === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : order.accountStatus === 'rejected'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-orange-500/20 text-orange-400'
                          }`}
                        >
                          <option value="pending">⏳ {t('awaitingShort')}</option>
                          <option value="approved">✅ {t('approvedShort')}</option>
                          <option value="rejected">❌ {t('accRejected')}</option>
                        </select>
                        {order.accountant || order.serverApprovedAt ? (
                          <div className="text-[10px] text-emerald-400 mt-1">
                            {order.accountant ? `👤 ${order.accountant}` : ''}
                            {order.serverApprovedAt ? ` · 🕓 ${fmtServerTime(order.serverApprovedAt)}` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          order.debtStatus === 'clear'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : order.debtStatus === 'has_debt'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {order.debtStatus === 'clear' ? '✅' : order.debtStatus === 'has_debt' ? '⚠️' : '🚫'}
                          {order.debtStatus === 'clear' ? t('debtClearShort') : order.debtStatus === 'has_debt' ? t('debtHasShort') : t('blocked')}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          order.status === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : order.status === 'scheduled'
                            ? 'bg-sky-500/20 text-sky-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {order.status === 'pending' ? `⏳ ${t('pendingShort')}` : order.status === 'scheduled' ? `📅 ${t('scheduled')}` : `✅ ${t('completed')}`}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {order.status === 'pending' && order.accountStatus === 'approved' && order.debtStatus !== 'blocked' && (
                            <button
                              onClick={() => handleMarkScheduled(order.id)}
                              disabled={isCustomerHeld(order)}
                              className={`${isCustomerHeld(order) ? 'bg-slate-600 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-400'} text-white px-2 py-1 rounded text-xs`}
                              title={isCustomerHeld(order) ? t('holdTitle') : ''}
                            >
                              📅 {t('scheduleBtn')}
                            </button>
                          )}
                          {order.status === 'scheduled' && (
                            <button
                              onClick={() => handleMarkCompleted(order.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-xs"
                            >
                              ✅ {t('doneBtn')}
                            </button>
                          )}
                          {order.status === 'completed' && (
                            <>
                              <button
                                onClick={() => setInvoiceFor(order)}
                                className="bg-teal-600 hover:bg-teal-700 text-white px-2 py-1 rounded text-xs"
                              >
                                🧾 {t('invoiceBtn')}
                              </button>
                              <button
                                onClick={() => openEvaluation(order)}
                                className={`px-2 py-1 rounded text-xs font-bold ${order.dailyEvaluation ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}
                                title={t('evalDailyShort')}
                              >
                                ⭐ {order.dailyEvaluation ? `${order.dailyEvaluation.totalScore}/15` : t('evalBtn')}
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleEdit(order)}
                            className="bg-orange-600 hover:bg-orange-700 text-white px-2 py-1 rounded text-xs"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(order.id)}
                            className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-sky-500/10 border border-sky-500/30 rounded-lg p-4">
          <h3 className="text-sm font-bold text-sky-400 mb-2">💡 {t('howToUse')}</h3>
          <ul className="text-xs text-slate-300 space-y-1">
            <li>✅ {t('how1')}</li>
            <li>✅ {t('how2')}</li>
            <li>✅ {t('how3')}</li>
            <li>✅ {t('how4')}</li>
            <li>✅ {t('how5')}</li>
          </ul>
        </div>
      </div>
      {showCustomers && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0B111E]/95 border border-white/10 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-black tracking-tight text-white">👥 {t('manageCustomers')}</h2>
              <button onClick={() => setShowCustomers(false)} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            <CustomersManager onSelect={(c) => {
              if (c) {
                setForm(prev => ({ ...prev, customerId: c.id, customerName: c.name, customerPhone: c.phone, customerCode: c.code }));
                setShowCustomers(false);
                setShowForm(true);
              }
            }} />
          </div>
        </div>
      )}

      {invoiceFor && (
        <EInvoice
          invoiceNo={`INV-${invoiceFor.id.slice(0, 6).toUpperCase()}`}
          date={invoiceFor.orderDate}
          time={invoiceFor.orderTime}
          customerName={invoiceFor.customerName}
          customerCode={invoiceFor.customerCode}
          customerPhone={invoiceFor.customerPhone}
          projectName={invoiceFor.projectName}
          orderType={invoiceFor.orderType}
          quantity={invoiceFor.quantity}
          concreteType={invoiceFor.concreteType}
          mixDesign={invoiceFor.concreteType ? `${invoiceFor.concreteType} psi` : undefined}
          elementType={invoiceFor.elementType}
          onClose={() => setInvoiceFor(null)}
        />
      )}

      {/* التقييم اليومي */}
      {evalFor && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEvalFor(null)}>
          <div className="bg-[#0B111E] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-5">
              <h3 className="text-lg font-black text-white">⭐ {t('evalDaily')}</h3>
              <p className="text-xs text-slate-400 mt-1">{evalFor.orderNo || evalFor.id} · {evalFor.customerName} · {evalFor.projectName}</p>
            </div>

            {([
              { key: 'plantScore', label: `🏭 ${t('evalPlant')}` },
              { key: 'truckScore', label: `🚚 ${t('evalTruck')}` },
              { key: 'laborScore', label: `👷 ${t('evalLabor')}` },
            ] as const).map(item => (
              <div key={item.key} className="mb-4">
                <p className="text-xs font-bold text-slate-300 mb-1.5">{item.label}</p>
                <div className="flex gap-1" dir="ltr">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setEvalForm(prev => ({ ...prev, [item.key]: star }))}
                      className={`text-2xl transition-transform hover:scale-110 ${(evalForm[item.key] || 0) >= star ? 'text-yellow-400' : 'text-slate-600'}`}
                    >
                      ★
                    </button>
                  ))}
                  {(evalForm[item.key] || 0) > 0 && (
                    <span className="text-xs text-slate-400 ml-2 self-center">{evalForm[item.key]}/5</span>
                  )}
                </div>
              </div>
            ))}

            <textarea
              value={evalForm.notes}
              onChange={e => setEvalForm({ ...evalForm, notes: e.target.value })}
              placeholder={t('notesPlaceholder')}
              rows={3}
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm resize-none mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={saveEvaluation}
                disabled={evalSaving}
                className={`flex-1 font-bold py-2.5 rounded-lg text-white ${evalSaving ? 'bg-slate-500 cursor-wait' : 'bg-emerald-500 hover:bg-emerald-600'}`}
              >
                {evalSaving ? `⏳ ${t('saving')}` : `💾 ${t('saveEval')}`}
              </button>
              <button onClick={() => setEvalFor(null)} className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 font-bold py-2.5 rounded-lg">
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
