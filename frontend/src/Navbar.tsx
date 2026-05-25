import { useAuth } from './context/AuthContext';

const navLinks = [
  { label: 'Dashboard',   path: '/' },
  { label: 'Discover',    path: '/discover' },
  { label: 'History',     path: '/history' },
  { label: 'Performance', path: '/performance' },
];

interface NavbarProps {
  currentPath: string;
  navigate: (path: string) => void;
}

export default function Navbar({ currentPath, navigate }: NavbarProps) {
  const { user, isAdmin, logout } = useAuth();

  function isActive(path: string) {
    if (path === '/') return !navLinks.slice(1).some(l => currentPath.startsWith(l.path)) && !currentPath.startsWith('/users');
    return currentPath.startsWith(path);
  }

  function handleLogout() {
    logout();
    navigate('/');
  }

  const links = isAdmin ? [...navLinks, { label: 'Users', path: '/users' }] : navLinks;

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(8,12,20,0.96)',
      borderBottom: '1px solid #1a2e47',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{
        maxWidth: 1280, margin: '0 auto', padding: '0 24px',
        display: 'flex', alignItems: 'center', height: 60,
      }}>
        {/* Brand */}
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            marginRight: 'auto',
          }}
        >
          <div
            className="hex-logo"
            style={{
              width: 32, height: 32, flexShrink: 0,
              background: 'linear-gradient(145deg, #d97706, #7c2d12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 900, color: 'white', letterSpacing: '-0.05em',
            }}
          >
            BB
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2 }}>
              Byte Boards
            </div>
            <div style={{
              fontSize: 9, fontWeight: 600, color: '#d97706',
              letterSpacing: '0.12em', lineHeight: 1.2, textTransform: 'uppercase',
            }}>
              Catan AI Arena
            </div>
          </div>
        </button>

        {/* Nav links */}
        <nav style={{ display: 'flex', gap: 2 }}>
          {links.map(({ label, path }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                style={{
                  padding: '7px 14px', borderRadius: 6,
                  fontSize: 14, fontWeight: active ? 600 : 400,
                  border: 'none', cursor: 'pointer',
                  background: active ? 'rgba(217,119,6,0.12)' : 'transparent',
                  color: active ? '#f59e0b' : '#64748b',
                  transition: 'all 0.15s ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* User info */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 16 }}>
            {isAdmin && (
              <span style={{
                padding: '2px 8px', borderRadius: 4,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171', textTransform: 'uppercase',
              }}>
                Admin
              </span>
            )}
            <span style={{ fontSize: 13, color: '#475569', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name ?? user.email}
            </span>
            <button
              onClick={handleLogout}
              style={{
                padding: '5px 12px', borderRadius: 6,
                fontSize: 12, fontWeight: 500,
                border: '1px solid #1a2e47', background: 'transparent',
                color: '#64748b', cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
