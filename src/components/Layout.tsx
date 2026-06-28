import { Outlet, NavLink } from 'react-router-dom';
import { Home, BookOpen, LineChart, Settings, PenTool } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { user } = useAuth();
  return (
    <div className="app-container">
      <div className="page-content">
        <Outlet />
      </div>
      
      <nav className="bottom-nav">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
          <Home size={24} />
          <span>ホーム</span>
        </NavLink>
        <NavLink to="/drill" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <BookOpen size={24} />
          <span>ドリル</span>
        </NavLink>
        {user?.role === 'admin' && (
          <NavLink to="/custom" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <PenTool size={24} />
            <span>作る</span>
          </NavLink>
        )}
        <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LineChart size={24} />
          <span>データ</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Settings size={24} />
          <span>設定</span>
        </NavLink>
      </nav>
    </div>
  );
}
