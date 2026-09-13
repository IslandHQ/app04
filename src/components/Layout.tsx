import { Outlet, NavLink, Link } from 'react-router-dom';
import { Home, ClipboardList, LineChart, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { user } = useAuth();
  return (
    <div className="app-container">
      <div className="page-content">
        <div style={{display:'flex',justifyContent:'space-between',gap:12,marginBottom:18,fontSize:13}}><Link to="/">学習ホーム</Link>{user?.role==='admin'&&<Link to="/admin/overview">管理画面 →</Link>}</div>
        <Outlet />
      </div>
      
      <nav className="bottom-nav">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
          <Home size={24} />
          <span>学習</span>
        </NavLink>
        <NavLink to="/tests" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <ClipboardList size={24} />
          <span>テスト</span>
        </NavLink>
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
