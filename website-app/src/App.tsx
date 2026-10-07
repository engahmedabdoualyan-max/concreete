import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LangProvider } from './context/LangContext';
import { DateProvider } from './context/DateContext';
import { AdminProvider } from './context/AdminContext';
import Dashboard from './pages/Dashboard';
import Operations from './pages/Operations';
import Evaluation from './pages/Evaluation';
import Workshop from './pages/Workshop';
import MixingQuality from './pages/MixingQuality';
import Production from './pages/Production';
import Schedule from './pages/Schedule';
import Orders from './pages/Orders';
import ResearchDevelopment from './pages/ResearchDevelopment';
import Governance from './pages/Governance';
import Finance from './pages/Finance';
import ErpMaterials from './pages/ErpMaterials';
import MultiPlant from './pages/MultiPlant';
import LoginRegister from './components/LoginRegister';
import FloatingActions from './components/FloatingActions';
import FimtoFooter from './components/FimtoFooter';
import Admin from './pages/Admin';
import Console from './pages/Console';
import CustomSection from './pages/CustomSection';
import CustomerPortal from './pages/CustomerPortal';
import LandingPage from './pages/LandingPage';
import PresenceTracker from './components/PresenceTracker';
import TrackOrder from './pages/TrackOrder';
import AccountingIntegrations from './pages/AccountingIntegrations';
import ZatcaCompliance from './pages/ZatcaCompliance';
import Quotations from './pages/Quotations';
import Payroll from './pages/Payroll';
import BatchControl from './pages/BatchControl';
import Sustainability from './pages/Sustainability';
import SsoProviders from './pages/SsoProviders';
import FieldHome from './field/FieldHome';
import MyWork from './field/MyWork';
import Tracking from './field/Tracking';
import NotificationsCenter from './field/NotificationsCenter';
import FieldRnd from './field/FieldRnd';
import FieldTeam from './field/FieldTeam';
import FleetCoding from './pages/FleetCoding';
import Sites from './pages/Sites';
import CommandCenter from './pages/CommandCenter';
import HR from './pages/HR';
import Procurement from './pages/Procurement';
import FieldBackButton from './field/FieldBackButton';
import { useLocation } from 'react-router-dom';

/** Field screens are app-like (no footer) — website pages keep theirs. */
function ConditionalFooter() {
  const loc = useLocation();
  if (loc.pathname.startsWith('/field')) return null;
  return <FimtoFooter />;
}

export default function App() {
  return (
    <DateProvider>
    <LangProvider>
    <AuthProvider>
      <PresenceTracker />
    <AdminProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginRegister />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/track/:token" element={<TrackOrder />} />
          <Route path="/integrations" element={<AccountingIntegrations />} />
          <Route path="/zatca" element={<ZatcaCompliance />} />
          <Route path="/quoting" element={<Quotations />} />
          <Route path="/payroll" element={<Payroll />} />
          <Route path="/batch-control" element={<BatchControl />} />
          <Route path="/sustainability" element={<Sustainability />} />
          <Route path="/sso" element={<SsoProviders />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/console" element={<Console />} />
          <Route path="/portal" element={<CustomerPortal />} />
          <Route path="/customer" element={<CustomerPortal />} />
          <Route path="/s/:id" element={<CustomSection />} />
          <Route path="/field" element={<FieldHome />} />
          <Route path="/field/work" element={<MyWork />} />
          <Route path="/field/tracking" element={<Tracking />} />
          <Route path="/field/notifications" element={<NotificationsCenter />} />
          <Route path="/field/rnd" element={<FieldRnd />} />
          <Route path="/field/team" element={<FieldTeam />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/operation" element={<Operations />} />
          <Route path="/operations" element={<Operations />} />
          <Route path="/evaluation" element={<Evaluation />} />
          <Route path="/workshop" element={<Workshop />} />
          <Route path="/fleet/coding" element={<FleetCoding />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/command" element={<CommandCenter />} />
          <Route path="/hr" element={<HR />} />
          <Route path="/procurement" element={<Procurement />} />
          <Route path="/mixing" element={<MixingQuality />} />
          <Route path="/quality" element={<MixingQuality />} />
          <Route path="/production" element={<Production />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/rnd" element={<ResearchDevelopment />} />
          <Route path="/governance" element={<Governance />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/materials" element={<ErpMaterials />} />
          <Route path="/multiplant" element={<MultiPlant />} />
        </Routes>
        <FloatingActions />
        <FieldBackButton />
        <ConditionalFooter />
      </HashRouter>
    </AdminProvider>
    </AuthProvider>
    </LangProvider>
    </DateProvider>
  );
}
