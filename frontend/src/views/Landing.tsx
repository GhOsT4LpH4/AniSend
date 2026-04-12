
interface LandingProps {
  onConnect: () => Promise<void>;
  loading: boolean;
}

/** Static deal card preview shown on the right column of the hero */
function DealMockPreview() {
  return (
    <div className="deal-mock animate-fade-in">
      {/* Mock top bar */}
      <div className="deal-mock__header">
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
          Deal Preview
        </span>
        <span
          style={{
            background: 'var(--accent-paddy)',
            color: '#fff',
            fontFamily: 'var(--font-heading)',
            fontSize: '0.6rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '0.2rem 0.6rem',
            border: '2px solid var(--accent-paddy)',
          }}
        >
          Funded
        </span>
      </div>

      {/* Mock deal title */}
      <div>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
          🐃 Carabao — Deal #AS-42
        </h3>
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.2rem' }}>
          Nueva Ecija · Livestock Escrow
        </p>
      </div>

      {/* Mock rows */}
      <div className="deal-mock__row">
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Seller</span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>GBCD…3F4A</span>
      </div>
      <div className="deal-mock__row">
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Buyer</span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>GABC…9E2D</span>
      </div>
      <div className="deal-mock__row" style={{ borderBottom: 'none' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>In Escrow</span>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-paddy-bright)' }}>
          850 <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>XLM</span>
        </span>
      </div>

      {/* Mock action button */}
      <div
        style={{
          background: 'var(--accent-paddy)',
          color: '#fff',
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: '0.8rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          padding: '0.75rem',
          textAlign: 'center',
          border: '3px solid var(--accent-paddy)',
          marginTop: '0.25rem',
          opacity: 0.85,
        }}
      >
        ✅ I Received the Animal
      </div>
    </div>
  );
}

export function Landing({ onConnect, loading }: LandingProps) {
  return (
    <div className="landing animate-slide-up stagger-children">

      {/* ── Hero: Split-screen on desktop ── */}
      <section className="landing-split">

        {/* Left column — brand + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <header>
            <p
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--accent-paddy-bright)',
                marginBottom: '0.75rem',
              }}
            >
              Stellar Soroban · Testnet
            </p>
            <h1 className="display-xl" style={{ marginBottom: '1rem', lineHeight: 0.95 }}>
              Ani<span style={{ color: 'var(--accent-paddy-bright)' }}>Send</span>
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
                color: 'var(--text-main)',
                opacity: 0.8,
                lineHeight: 1.6,
                maxWidth: '480px',
              }}
            >
              Trust-free livestock escrow for Filipino smallholder
              farmers. Lock funds on-chain. Release only when{' '}
              <strong style={{ color: 'var(--text-main)' }}>both parties confirm</strong>.
            </p>
          </header>

          {/* CTA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              disabled={loading}
              onClick={onConnect}
              className="btn-neo btn-shimmer landing-cta-btn"
              aria-busy={loading}
            >
              {loading ? 'Connecting...' : 'Connect Freighter Wallet →'}
            </button>
            <p className="text-meta" style={{ opacity: 0.55 }}>
              Freighter browser extension · Stellar Testnet
            </p>
          </div>
        </div>

        {/* Right column — live deal mock (desktop only) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--text-muted)',
              marginBottom: '0.25rem',
            }}
          >
            Live deal interface ↓
          </p>
          <DealMockPreview />
        </div>

      </section>

      {/* ── How it works — horizontal step timeline ── */}
      <section aria-label="How AniSend works">
        <p
          className="text-meta"
          style={{ marginBottom: '1rem', opacity: 0.6 }}
        >
          How it works
        </p>
        <div className="step-timeline">

          <div className="step-item">
            <div className="step-item__accent" style={{ background: 'var(--accent-paddy-bright)' }} />
            <div className="step-item__num">01</div>
            <div className="step-item__title">List Your Animal</div>
            <p className="step-item__body">
              Seller creates the escrow — sets the{' '}
              <strong style={{ color: 'var(--text-main)' }}>price</strong>,{' '}
              <strong style={{ color: 'var(--text-main)' }}>animal type</strong>, and the{' '}
              <strong style={{ color: 'var(--text-main)' }}>buyer's address</strong>.
            </p>
          </div>

          <div className="step-item">
            <div className="step-item__accent" style={{ background: 'var(--accent-harvest)' }} />
            <div className="step-item__num">02</div>
            <div className="step-item__title">Buyer Deposits XLM</div>
            <p className="step-item__body">
              The buyer locks the exact price in{' '}
              <strong style={{ color: 'var(--text-main)' }}>XLM</strong> into the smart
              contract. Funds are held safely on-chain.
            </p>
          </div>

          <div className="step-item">
            <div className="step-item__accent" style={{ background: 'var(--text-main)' }} />
            <div className="step-item__num">03</div>
            <div className="step-item__title">Both Confirm</div>
            <p className="step-item__body">
              <strong style={{ color: 'var(--text-main)' }}>Buyer</strong> confirms receipt.{' '}
              <strong style={{ color: 'var(--text-main)' }}>Seller</strong> confirms handoff.
              Funds auto-release to the seller.
            </p>
          </div>

        </div>
      </section>

      {/* ── Trust Strip ── */}
      <section className="trust-strip" aria-label="AniSend trust signals">
        <div className="trust-item">
          <span className="trust-number">₱0</span>
          <span className="trust-label">Platform Fees</span>
        </div>
        <div className="trust-item">
          <span className="trust-number">Soroban</span>
          <span className="trust-label">Smart Contract Secured</span>
        </div>
        <div className="trust-item">
          <span className="trust-number">Filipino</span>
          <span className="trust-label">Built for Smallholder Farmers</span>
        </div>
        <div className="trust-item">
          <span className="trust-number">XLM</span>
          <span className="trust-label">Stellar Native Token</span>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          background: 'var(--surface-container)',
          border: '4px solid var(--text-main)',
          boxShadow: 'var(--shadow-neo)',
          padding: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <h4 className="text-h3" style={{ marginBottom: '0.25rem' }}>
            AniSend Livestock Escrow v1.0
          </h4>
          <p className="text-meta" style={{ opacity: 0.6 }}>
            Eliminating livestock fraud for Filipino smallholder farmers — one carabao at a time.
          </p>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '0.65rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--accent-paddy-bright)',
            border: '2px solid var(--accent-paddy)',
            padding: '0.25rem 0.75rem',
          }}
        >
          Testnet
        </span>
      </footer>

    </div>
  );
}
