import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { FindingsListPage } from './pages/FindingsListPage';
import { FindingDetailPage } from './pages/FindingDetailPage';
import { CreateFindingPage } from './pages/CreateFindingPage';
import { RecentTicketsPage } from './pages/RecentTicketsPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProtectedRoute } from './components/ProtectedRoute';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route path="/findings" element={<ProtectedRoute><FindingsListPage /></ProtectedRoute>} />
      <Route path="/findings/new" element={<ProtectedRoute><CreateFindingPage /></ProtectedRoute>} />
      <Route path="/findings/:id" element={<ProtectedRoute><FindingDetailPage /></ProtectedRoute>} />
      <Route path="/recent-tickets" element={<ProtectedRoute><RecentTicketsPage /></ProtectedRoute>} />
      <Route path="/automations" element={<ProtectedRoute><AutomationsPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

      <Route path="/" element={<Navigate to="/findings" replace />} />
      <Route path="*" element={<Navigate to="/findings" replace />} />
    </Routes>
  );
}
