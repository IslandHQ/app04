import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import DrillPage from './pages/DrillPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import CustomDrillPage from './pages/CustomDrillPage';
import AuthPage from './pages/AuthPage';
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
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="drill" element={<DrillPage />} />
        <Route path="custom" element={<CustomDrillPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
