import { Outlet, NavLink } from 'react-router-dom';
import { Home, BookOpen, Settings, PenTool, Globe } from 'lucide-react';

export default function Layout() {
  return (
    <div className="app-container">
      <div className="page-content">
        <Outlet />
      </div>
      
      <nav className="bottom-nav">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
          <Home size={22} />
          <span>ホーム</span>
        </NavLink>
        <NavLink to="/drill" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <BookOpen size={22} />
          <span>ドリル</span>
        </NavLink>
        <NavLink to="/explore" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Globe size={22} />
          <span>探す</span>
        </NavLink>
        <NavLink to="/custom" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <PenTool size={22} />
          <span>作る</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Settings size={22} />
          <span>設定</span>
        </NavLink>
      </nav>
    </div>
  );
}
