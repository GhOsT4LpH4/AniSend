
interface LandingProps {
  onConnect: () => Promise<void>;
  loading: boolean;
}

export function Landing({ onConnect, loading }: LandingProps) {
  return (
    <div className="animate-slide-up stagger-children" style={{ display: 'flex', flexDirection: 'column', gap: '4rem', padding: '4rem 1.5rem' }}>

      {/* Brand Hero */}
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="display-xl" style={{ marginBottom: '1rem' }}>
          🐃 Ani<span style={{ color: 'var(--accent-green)' }}>Send</span>
        </h1>
        <p className="text-h2" style={{ color: 'var(--text-main)', opacity: 0.8, maxWidth: '600px', margin: '0 auto' }}>
          Trust-free livestock auction escrow.<br/>Powered by XLM on Stellar Soroban.
        </p>
      </header>

      {/* Main CTA */}
      <div style={{ textAlign: 'center' }}>
        <button
          disabled={loading}
          onClick={onConnect}
          className="btn-neo btn-primary"
          style={{ padding: '1.5rem 3rem', fontSize: '1.25rem' }}
        >
          {loading ? 'Connecting...' : 'Connect Freighter Wallet →'}
        </button>
        <p className="text-meta" style={{ marginTop: '1rem', opacity: 0.6 }}>Testnet Connection Required</p>
      </div>

      {/* How it works */}
      <section className="stagger-children" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>

        <div className="card-neo" style={{ borderTop: '8px solid var(--accent-green)' }}>
          <span className="display-lg" style={{ fontSize: '2.5rem', opacity: 0.2 }}>01</span>
          <h2 className="text-h2" style={{ marginTop: '1rem' }}>List Your Animal</h2>
          <p className="text-body" style={{ marginTop: '1rem' }}>
            Seller creates an escrow listing — set the <strong>price</strong>, <strong>animal type</strong>, and the <strong>buyer's address</strong>.
          </p>
        </div>

        <div className="card-neo" style={{ borderTop: '8px solid var(--accent-blue)' }}>
          <span className="display-lg" style={{ fontSize: '2.5rem', opacity: 0.2 }}>02</span>
          <h2 className="text-h2" style={{ marginTop: '1rem' }}>Buyer Deposits XLM</h2>
          <p className="text-body" style={{ marginTop: '1rem' }}>
            The buyer locks the exact price in <strong>XLM</strong> into the smart contract. Funds are held safely on-chain.
          </p>
        </div>

        <div className="card-neo" style={{ borderTop: '8px solid var(--text-main)' }}>
          <span className="display-lg" style={{ fontSize: '2.5rem', opacity: 0.2 }}>03</span>
          <h2 className="text-h2" style={{ marginTop: '1rem' }}>Both Confirm</h2>
          <p className="text-body" style={{ marginTop: '1rem' }}>
            <strong>Buyer</strong> confirms receipt. <strong>Seller</strong> confirms handoff. Once both confirm — funds auto-release to the seller.
          </p>
        </div>

      </section>

      {/* Footer Info */}
      <footer className="card-neo-accent" style={{ backgroundColor: 'var(--surface-container)', color: 'var(--text-main)', textAlign: 'center' }}>
        <h4 className="text-h3" style={{ marginBottom: '0.5rem' }}>AniSend Livestock Escrow v1.0</h4>
        <p className="text-meta" style={{ opacity: 0.7 }}>Eliminating livestock fraud for Filipino smallholder farmers — one carabao at a time.</p>
      </footer>

    </div>
  );
}
