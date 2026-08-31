import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider, useStore } from './state/store.jsx';
import { AppShell } from './components/AppShell.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { GroupsPage } from './pages/GroupsPage.jsx';
import { UsersPage } from './pages/UsersPage.jsx';
import { ProvidersPage } from './pages/ProvidersPage.jsx';
import { ModelsPage } from './pages/ModelsPage.jsx';
import { PersonalitiesPage } from './pages/PersonalitiesPage.jsx';
import { MemoryPage } from './pages/MemoryPage.jsx';
import { ModerationPage } from './pages/ModerationPage.jsx';
import { AnalyticsPage } from './pages/AnalyticsPage.jsx';
import { VpsPage } from './pages/VpsPage.jsx';
import { AuditPage, NotificationsPage, HealthPage } from './pages/SystemPages.jsx';
import { SecurityPage } from './pages/SecurityPage.jsx';

function Protected() {
  const { me, authReady } = useStore();
  if (!authReady) return <div className="auth-page"><div className="skeleton" style={{ width: 300, height: 20 }} /></div>;
  if (!me) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/personalities" element={<PersonalitiesPage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/moderation" element={<ModerationPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/vps" element={<VpsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<Protected />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
