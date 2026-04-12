import { useState } from 'react';
import { Landing } from './views/Landing';
import { Dashboard } from './views/Dashboard';
import { CreateDeal } from './views/CreateDeal';
import { DealDetail } from './views/DealDetail';
import { History } from './views/History';

import { TopAppBar } from './components/TopAppBar';
import { BottomNavBar } from './components/BottomNavBar';
import { connectToFreighter } from './lib/freighter';

// Convex Hooks
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

type ViewState = 'CONNECT' | 'DASHBOARD' | 'CREATE' | 'DETAIL' | 'HISTORY';

function App() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('CONNECT');
  const [activeDealId, setActiveDealId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Real Dynamic Data from Convex
  const getOrCreateUser = useMutation(api.users.getOrCreateUser);
  const userProfile = useQuery(api.users.getUser, wallet ? { stellarAddress: wallet } : "skip");

  const handleConnect = async () => {
    try {
      setLoading(true);
      const pubKey = await connectToFreighter();
      if (!pubKey) throw new Error("Could not retrieve public key.");

      await getOrCreateUser({
        stellarAddress: pubKey,
        farmerName: "Magsasaka",
        province: "Nueva Ecija",
      });

      setWallet(pubKey);
      setCurrentView('DASHBOARD');
    } catch (e: unknown) {
      console.error("Connection error:", e);
      const msg = e instanceof Error ? e.message : 'Failed to connect Freighter.';
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    setWallet(null);
    setCurrentView('CONNECT');
    setActiveDealId('');
  };

  const handleNavigate = (view: ViewState, dealId?: string) => {
    if (dealId) setActiveDealId(dealId);
    setCurrentView(view);
    window.scrollTo(0, 0);
  };

  const renderView = () => {
    if (!wallet) {
      return <Landing onConnect={handleConnect} loading={loading} />;
    }

    // Wait for profile to load
    if (currentView === 'DASHBOARD' && userProfile === undefined) {
      return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-meta animate-pulse">Syncing Farmer Profile...</div>
      </div>;
    }

    switch (currentView) {
      case 'DASHBOARD':
        return (
          <Dashboard
            wallet={wallet}
            userName={userProfile?.farmerName || "Magsasaka"}
            onNavigate={(v, id?) => handleNavigate(v as ViewState, id)}
          />
        );
      case 'CREATE':
        return (
          <CreateDeal
            sellerAddress={wallet}
            onCancel={() => handleNavigate('DASHBOARD')}
            onSuccess={(id) => { setActiveDealId(id); setCurrentView('DETAIL'); }}
          />
        );
      case 'DETAIL':
        return (
          <DealDetail
            dealId={activeDealId}
            walletAddress={wallet}
            onBack={() => handleNavigate('DASHBOARD')}
          />
        );
      case 'HISTORY':
        return (
          <History
            wallet={wallet}
            onViewDeal={(id) => handleNavigate('DETAIL', id)}
          />
        );
      default:
        return <Dashboard wallet={wallet} userName={userProfile?.farmerName || "Magsasaka"} onNavigate={(v, id?) => handleNavigate(v as ViewState, id)} />;
    }
  };

  return (
    <div className="page-wrapper">
      <TopAppBar
        wallet={wallet}
        currentView={currentView}
        onNavigate={handleNavigate as (view: string) => void}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
      <main className="page-content">{renderView()}</main>
      <BottomNavBar currentView={currentView} onNavigate={handleNavigate as (view: string) => void} />
      {/* Subtle farm texture overlay */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, opacity: 0.04, pointerEvents: 'none', backgroundImage: 'url("https://www.transparenttextures.com/patterns/cardboard.png")' }} />
    </div>
  );
}

export default App;
