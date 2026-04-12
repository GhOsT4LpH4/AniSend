
interface BottomNavBarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

const tabs = [
  { id: 'DASHBOARD', label: 'Home',    icon: 'dashboard' },
  { id: 'CREATE',    label: 'Sell',    icon: 'storefront' },
  { id: 'HISTORY',   label: 'Deals',   icon: 'receipt_long' },
];

export function BottomNavBar({ currentView, onNavigate }: BottomNavBarProps) {
  // Show a contextual Deal tab when in DETAIL view
  const showDetailTab = currentView === 'DETAIL';
  const visibleTabs = showDetailTab
    ? [...tabs, { id: 'DETAIL', label: 'Deal', icon: 'handshake' }]
    : tabs;

  return (
    <>
      <nav
        id="bottom-nav-bar"
        aria-label="Bottom navigation"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'var(--bottombar-height)',
          background: 'var(--bg-white)',
          borderTop: 'var(--border-thick)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        {visibleTabs.map((tab, i) => {
          const isActive =
            currentView === tab.id ||
            (tab.id === 'DASHBOARD' && currentView === 'CONNECT');
          const isLast = i === visibleTabs.length - 1;
          return (
            <button
              key={tab.id}
              id={`bnav-${tab.id.toLowerCase()}`}
              onClick={() => onNavigate(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.25rem',
                background: isActive ? 'var(--accent-paddy)' : 'transparent',
                borderRight: !isLast ? '2px solid var(--text-main)' : 'none',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
                padding: '0.5rem',
                position: 'relative',
              }}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  background: 'var(--accent-paddy-bright)',
                }} />
              )}
              <span
                className="material-icons-outlined"
                style={{
                  fontSize: '22px',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  fontWeight: isActive ? 700 : 400,
                }}
              >
                {tab.icon}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.625rem',
                  fontWeight: isActive ? 700 : 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Hide on desktop ≥ 768px */}
      <style>{`
        @media (min-width: 768px) {
          #bottom-nav-bar {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
