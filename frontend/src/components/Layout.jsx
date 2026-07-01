import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui';
import GlobalSearch from './GlobalSearch';
import Notifications from './Notifications';
import brandIcon from '../assets/score-erp-ai-logo-clean.png';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/beneficiaries', label: 'Beneficiaries', icon: '👥' },
  { to: '/clusters', label: 'Skill Clusters', icon: '🧩' },
  { to: '/projects', label: 'Projects', icon: '📋' },
  { to: '/finance', label: 'Finance & Grants', icon: '💰' },
  { to: '/livelihoods', label: 'Livelihoods', icon: '💼' },
  { to: '/donors', label: 'Donors / CSR', icon: '🤝' },
  { to: '/hr', label: 'HR & Volunteers', icon: '🧑‍💼' },
  { to: '/payroll', label: 'Payroll', icon: '🧾' },
  { to: '/field-schedule', label: 'Field Schedule', icon: '🗓️' },
  { to: '/ai-insights', label: 'AI Skill Insights', icon: '🤖' },
  { to: '/csr-reports', label: 'CSR Impact Reports', icon: '📊' },
  { to: '/users', label: 'Users', icon: '⚙️', roles: ['admin', 'manager'] },
];

const TITLES = {
  '/': 'Dashboard',
  '/beneficiaries': 'Beneficiary Management',
  '/clusters': 'Skill Clusters',
  '/projects': 'Project Management',
  '/finance': 'Finance & Grants',
  '/livelihoods': 'Livelihood Opportunities',
  '/donors': 'Donors / CSR CRM',
  '/hr': 'HR & Volunteer Management',
  '/payroll': 'Payroll',
  '/field-schedule': 'Field Schedule',
  '/ai-insights': 'AI Skill Insights',
  '/csr-reports': 'CSR Impact Reports',
  '/profile': 'My Profile',
  '/users': 'User Management',
};

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const location = useLocation();
  const initials = (user?.full_name || 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const title =
    TITLES[location.pathname] ||
    (location.pathname.startsWith('/beneficiaries') ? 'Beneficiary Management' : 'SCORE ERP');

  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={brandIcon} alt="SCORE ERP" className="brand-icon" />
          <div>
            SCORE ERP
            <small>NGO Management System</small>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV.filter((n) => !n.roles || hasRole(...n.roles)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="topbar-actions">
            <button className="icon-btn" title="Search" aria-label="Search" onClick={() => setSearchOpen(true)}>
              <SearchIcon />
            </button>
            <Notifications />
            <span className="topbar-sep" />
            <UserMenu user={user} initials={initials} logout={logout} />
          </div>
        </header>
        {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function UserMenu({ user, initials, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  return (
    <div className="user-menu-wrap" ref={ref}>
      <button
        className={`user-chip ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar src={user?.avatar_url} initials={initials} />
        <span className="user-chip-text">
          <span className="user-chip-name">{user?.full_name}</span>
          <span className="user-chip-role">{user?.role}</span>
        </span>
        <ChevronIcon className={open ? 'rot' : ''} />
      </button>

      {open && (
        <div className="user-menu" role="menu">
          <div className="user-menu-head">
            <Avatar src={user?.avatar_url} initials={initials} size="lg" />
            <div>
              <div className="user-chip-name">{user?.full_name}</div>
              <div className="user-menu-email">{user?.email}</div>
            </div>
          </div>
          <div className="user-menu-divider" />
          <button className="user-menu-item" role="menuitem" onClick={() => { setOpen(false); navigate('/profile'); }}>
            <span>👤</span> My Profile
          </button>
          <button className="user-menu-item" role="menuitem" onClick={() => { setOpen(false); navigate('/csr-reports'); }}>
            <span>📊</span> Reports
          </button>
          <div className="user-menu-divider" />
          <button className="user-menu-item danger" role="menuitem" onClick={logout}>
            <span>⎋</span> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ChevronIcon({ className }) {
  return (
    <svg className={`chev ${className || ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}


