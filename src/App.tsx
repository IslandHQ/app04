import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import DrillPage from './pages/DrillPage';
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
import SettingsPage from './pages/SettingsPage';
import CustomDrillPage from './pages/CustomDrillPage';
import AuthPage from './pages/AuthPage';
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));
import TestsPage from './pages/TestsPage';
import { useAuth } from './contexts/AuthContext';

function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>読み込み中...</div>;
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <Suspense fallback={<div style={{padding:24}}>読み込み中...</div>}><Routes>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/:section" element={<AdminPage />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="drill" element={<DrillPage />} />
        <Route path="custom" element={<CustomDrillPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="tests" element={<TestsPage />} />
        <Route path="tests/:attemptId" element={<TestsPage />} />
      </Route>
    </Routes></Suspense>
  );
}

export default App;
