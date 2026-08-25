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
import MultiPlant from './pages/MultiPlant';
import LoginRegister from './components/LoginRegister';
import FloatingActions from './components/FloatingActions';
import FimtoFooter from './components/FimtoFooter';
import Admin from './pages/Admin';
import Console from './pages/Console';
import CustomSection from './pages/CustomSection';

export default function App() {
  return (
    <DateProvider>
    <LangProvider>
    <AuthProvider>
    <AdminProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginRegister />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/console" element={<Console />} />
          <Route path="/s/:id" element={<CustomSection />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/operation" element={<Operations />} />
          <Route path="/operations" element={<Operations />} />
          <Route path="/evaluation" element={<Evaluation />} />
          <Route path="/workshop" element={<Workshop />} />
          <Route path="/mixing" element={<MixingQuality />} />
          <Route path="/quality" element={<MixingQuality />} />
          <Route path="/production" element={<Production />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/rnd" element={<ResearchDevelopment />} />
          <Route path="/governance" element={<Governance />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/multiplant" element={<MultiPlant />} />
        </Routes>
        <FloatingActions />
        <FimtoFooter />
      </HashRouter>
    </AdminProvider>
    </AuthProvider>
    </LangProvider>
    </DateProvider>
  );
}
