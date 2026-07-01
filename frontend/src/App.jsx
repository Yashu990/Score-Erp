import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Beneficiaries from './pages/Beneficiaries';
import Clusters from './pages/Clusters';
import Projects from './pages/Projects';
import Finance from './pages/Finance';
import Donors from './pages/Donors';
import Hr from './pages/Hr';
import Payroll from './pages/Payroll';
import FieldSchedule from './pages/FieldSchedule';
import Users from './pages/Users';
import AiInsights from './pages/AiInsights';
import CsrReports from './pages/CsrReports';
import Profile from './pages/Profile';
import Livelihoods from './pages/Livelihoods';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/beneficiaries" element={<Beneficiaries />} />
        <Route path="/clusters" element={<Clusters />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/donors" element={<Donors />} />
        <Route path="/hr" element={<Hr />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/field-schedule" element={<FieldSchedule />} />
        <Route path="/livelihoods" element={<Livelihoods />} />
        <Route path="/ai-insights" element={<AiInsights />} />
        <Route path="/csr-reports" element={<CsrReports />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/users" element={<Users />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
