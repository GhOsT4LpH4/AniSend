
interface TopAppBarProps {
  wallet: string | null;
  currentView: string;
  onNavigate: (view: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

const navItems = [
  { id: 'DASHBOARD', label: 'Home' },
  { id: 'CREATE', label: 'Sell' },
  { id: 'HISTORY', label: 'History' },
];

/** Inline carabao-head SVG brand mark */
function CarabaoMark() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {/* Head */}
      <ellipse cx="24" cy="28" rx="13" ry="11" fill="var(--accent-paddy)" />
      {/* Left horn */}
      <path d="M11 22 Q4 10 8 6 Q10 14 13 20" fill="var(--accent-paddy)" />
      {/* Right horn */}
      <path d="M37 22 Q44 10 40 6 Q38 14 35 20" fill="var(--accent-paddy)" />
      {/* Snout */}
      <ellipse cx="24" cy="36" rx="7" ry="4" fill="var(--accent-earth)" />
      {/* Left nostril */}
      <circle cx="21.5" cy="36.5" r="1.2" fill="var(--bg)" />
      {/* Right nostril */}
      <circle cx="26.5" cy="36.5" r="1.2" fill="var(--bg)" />
      {/* Left eye */}
      <circle cx="18" cy="26" r="1.8" fill="var(--bg-white)" />
      <circle cx="18.5" cy="26" r="0.9" fill="var(--bg)" />
      {/* Right eye */}
      <circle cx="30" cy="26" r="1.8" fill="var(--bg-white)" />
      <circle cx="30.5" cy="26" r="0.9" fill="var(--bg)" />
    </svg>
  );
}

export function TopAppBar({ wallet, currentView, onNavigate, onConnect, onDisconnect }: TopAppBarProps) {
  return (
    <header
      id="top-app-bar"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 'var(--topbar-height)',
        background: 'var(--bg)',
        borderBottom: 'var(--border-thick)',
        zIndex: 1000,
      }}
    >
      <div 
        className="page-content"
        style={{
          height: '100%',
          paddingTop: 0,
          paddingBottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
      {/* Brand */}
      <button
        onClick={() => onNavigate('DASHBOARD')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color: 'var(--text-main)',
          cursor: 'pointer',
          background: 'none',
          border: 'none',
          flexShrink: 0,
        }}
        aria-label="Go to Dashboard"
      >
        <CarabaoMark />
        Ani<span style={{ color: 'var(--accent-paddy-bright)' }}>Send</span>
      </button>

      {/* Desktop Nav */}
      <nav
        style={{ display: 'none', gap: '0.25rem' }}
        className="desktop-nav"
        aria-label="Primary navigation"
      >
        {navItems.map((item) => (
          <button
            key={item.id}
            id={`nav-${item.id.toLowerCase()}`}
            onClick={() => onNavigate(item.id)}
            aria-current={currentView === item.id ? 'page' : undefined}
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '0.8125rem',
              fontWeight: currentView === item.id ? 700 : 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '0.5rem 1rem',
              background: currentView === item.id ? 'var(--text-main)' : 'transparent',
              color: currentView === item.id ? 'var(--bg)' : 'var(--text-main)',
              border: currentView === item.id ? '3px solid var(--text-main)' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.1s ease',
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Action Area */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {wallet ? (
          <>
            {/* Wallet address chip */}
            <div
              id="wallet-status"
              title={wallet}
              aria-label={`Connected wallet: ${wallet}`}
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                padding: '0.5rem 0.875rem',
                background: 'var(--text-main)',
                color: 'var(--accent-paddy)',
                border: '3px solid var(--text-main)',
                userSelect: 'none',
              }}
            >
              {wallet.slice(0, 4)}…{wallet.slice(-4)}
            </div>

            {/* Disconnect button */}
            <button
              id="disconnect-wallet-btn"
              onClick={onDisconnect}
              className="btn-neo btn-danger btn-sm"
              title="Disconnect wallet"
              aria-label="Disconnect wallet"
            >
              <span className="material-icons-outlined" style={{ fontSize: '13px' }}>logout</span>
              <span className="desktop-only-label">Disconnect</span>
            </button>
          </>
        ) : (
          <button
            id="connect-wallet-btn"
            onClick={onConnect}
            className="btn-neo btn-primary btn-sm"
          >
            Connect
          </button>
        )}
      </div>

      {/* Responsive style injection */}
      <style>{`
        .desktop-nav {
          display: none !important;
        }
        .desktop-only-label {
          display: none;
        }
        @media (min-width: 768px) {
          .desktop-nav {
            display: flex !important;
          }
          .desktop-only-label {
            display: inline;
          }
        }
      `}</style>
      </div>
    </header>
  );
}
