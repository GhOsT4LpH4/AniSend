import { useState, useEffect, useMemo } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import { getDeal, getXlmBalance } from '../lib/stellar';
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { DealStatus } from '../types';

const EXPLORER_BASE = 'https://stellar.expert/explorer/testnet/account';

interface DashboardProps {
  wallet: string;
  userName: string;
  onNavigate: (view: string, dealId?: string) => void;
}

function SkeletonCard() {
  return (
    <div className="card-neo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
        <div className="skeleton" style={{ height: '24px', width: '80px' }} />
        <div className="skeleton" style={{ height: '20px', width: '180px' }} />
        <div className="skeleton" style={{ height: '14px', width: '120px' }} />
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div className="skeleton" style={{ height: '14px', width: '50px', marginLeft: 'auto' }} />
        <div className="skeleton" style={{ height: '22px', width: '90px' }} />
      </div>
    </div>
  );
}

export function Dashboard({ wallet, userName, onNavigate }: DashboardProps) {
  const deals = useQuery(api.deals.listMyDeals, { userAddress: wallet, contractId: import.meta.env.VITE_CONTRACT_ID || '' });
  const activity = useQuery(api.deals.getMyActivity, { userAddress: wallet, limit: 5 });
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [chainStatusByDealId, setChainStatusByDealId] = useState<Record<string, DealStatus>>({});
  const [chainAmountByDealId, setChainAmountByDealId] = useState<Record<string, string>>({});

  useEffect(() => {
    getXlmBalance(wallet)
      .then(setXlmBalance)
      .catch(() => setXlmBalance('—'));
  }, [wallet]);

  const isLoading = deals === undefined || activity === undefined;

  // Load authoritative status (and formatted amount) from chain for visible deals.
  useEffect(() => {
    if (!deals || deals.length === 0) return;
    let cancelled = false;

    (async () => {
      const results = await Promise.allSettled(
        deals.map(async (d) => {
          const dealIdNum = Number(d.dealId);
          const chainDeal = await getDeal(dealIdNum, wallet);
          return {
            dealId: d.dealId.toString(),
            status: chainDeal.status,
            amount: chainDeal.amount,
          };
        })
      );

      if (cancelled) return;

      const nextStatus: Record<string, DealStatus> = {};
      const nextAmount: Record<string, string> = {};
      for (const r of results) {
        if (r.status !== 'fulfilled') {
          continue;
        }
        nextStatus[r.value.dealId] = r.value.status;
        nextAmount[r.value.dealId] = r.value.amount;
      }
      setChainStatusByDealId(nextStatus);
      setChainAmountByDealId(nextAmount);
    })().catch(() => {
      // ignore: UI will fall back to skeleton/unknown if chain read fails
    });

    return () => {
      cancelled = true;
    };
  }, [deals, wallet]);

  const activeDeals = useMemo(() => {
    if (!deals) return [];
    return deals.filter((d) => {
      const s = chainStatusByDealId[d.dealId.toString()];
      return s === 'AwaitingDeposit' || s === 'Funded' || s === 'BuyerConfirmed' || s === 'SellerConfirmed';
    });
  }, [deals, chainStatusByDealId]);

  const totalLocked = useMemo(() => {
    if (!activeDeals.length) return 0;
    return activeDeals.reduce((sum, d) => {
      const status = chainStatusByDealId[d.dealId.toString()];
      if (!status || status === 'AwaitingDeposit') return sum;
      const amountStr = chainAmountByDealId[d.dealId.toString()];
      const amt = amountStr ? Number(amountStr) : Number(d.amountUsd);
      return sum + (Number.isFinite(amt) ? amt : 0);
    }, 0);
  }, [activeDeals, chainStatusByDealId, chainAmountByDealId]);

  return (
    <div className="animate-slide-up stagger-children" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

      {/* Page Header */}
      <section>
        <span className="text-meta">Overview</span>
        <h1 className="display-lg">Kumusta, {userName} 🐃</h1>
      </section>

      {/* Balance + Stats Row */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        {/* Balance Card */}
        <div className="card-neo-green" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span className="text-meta" style={{ color: 'rgba(255,255,255,0.8)' }}>Wallet Balance</span>
          {xlmBalance === null
            ? <div className="skeleton" style={{ height: '48px', width: '180px', marginTop: '0.25rem' }} />
            : <h2 className="display-lg" style={{ lineHeight: 1, color: 'var(--bg-white)' }}>
                {xlmBalance} <span className="text-h2" style={{ opacity: 0.7 }}>XLM</span>
              </h2>
          }
          <a
            href={`${EXPLORER_BASE}/${wallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-meta"
            style={{ marginTop: '0.25rem', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'rgba(255,255,255,0.7)' }}
          >
            <span className="material-icons-outlined" style={{ fontSize: '14px' }}>open_in_new</span>
            View on Explorer
          </a>
        </div>

        {/* Active Deals Stat */}
        <div className="card-neo" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span className="text-meta">Active Deals</span>
          {isLoading
            ? <div className="skeleton" style={{ height: '48px', width: '60px', marginTop: '0.25rem' }} />
            : <h2 className="display-lg" style={{ lineHeight: 1 }}>{activeDeals.length}</h2>
          }
          <span className="text-meta" style={{ opacity: 0.5 }}>In-flight</span>
        </div>

        {/* Total Locked Stat */}
        <div className="card-neo" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span className="text-meta">Total In Escrow</span>
          {isLoading
            ? <div className="skeleton" style={{ height: '48px', width: '140px', marginTop: '0.25rem' }} />
            : <h2 className="display-lg" style={{ lineHeight: 1 }}>
                {totalLocked.toFixed(2)} <span className="text-h2" style={{ opacity: 0.7 }}>XLM</span>
              </h2>
          }
          <span className="text-meta" style={{ opacity: 0.5 }}>Across active deals</span>
        </div>
      </section>

      {/* Quick Actions */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
        <div className="card-neo" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <h3 className="text-h2">Sell Livestock</h3>
            <p className="text-body" style={{ marginTop: '0.5rem' }}>List an animal for sale. Buyer deposits XLM into escrow.</p>
          </div>
          <button onClick={() => onNavigate('CREATE')} className="btn-neo btn-primary btn-full">
            New Listing +
          </button>
        </div>
        <div className="card-neo" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <h3 className="text-h2">Deal History</h3>
            <p className="text-body" style={{ marginTop: '0.5rem' }}>Full ledger of past and active livestock deals.</p>
          </div>
          <button onClick={() => onNavigate('HISTORY')} className="btn-neo btn-secondary btn-full">
            View History
          </button>
        </div>
      </section>

      {/* Active Deals */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
          <h2 className="text-h1">Active Deals</h2>
          {isLoading && <span className="text-meta animate-pulse">Syncing...</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : deals && deals.length > 0 ? (
            deals.map((deal) => (
              (() => {
                const chainStatus = chainStatusByDealId[deal.dealId.toString()];
                const displayStatus = (chainStatus || 'AwaitingDeposit') as DealStatus;
                const displayAmount = chainAmountByDealId[deal.dealId.toString()] || deal.amountUsd.toFixed(2);
                return (
              <div
                key={deal._id}
                className="card-neo"
                onClick={() => onNavigate('DETAIL', deal.dealId.toString())}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <StatusBadge status={displayStatus} />
                  <h3 className="text-h2" style={{ marginTop: '0.5rem' }}>
                    {deal.description || `Deal #AS-${deal.dealId}`}
                  </h3>
                  <p className="text-meta">
                    {deal.sellerAddress === wallet ? 'Buyer' : 'Seller'}: {(deal.sellerAddress === wallet ? deal.buyerAddress : deal.sellerAddress).slice(0, 8)}…{(deal.sellerAddress === wallet ? deal.buyerAddress : deal.sellerAddress).slice(-4)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="text-meta">Amount</span>
                  <p className="text-h2" style={{ fontWeight: 700 }}>{displayAmount} XLM</p>
                </div>
              </div>
                );
              })()
            ))
          ) : (
            <div className="card-neo-flat" style={{ textAlign: 'center', padding: '3rem', borderStyle: 'dashed' }}>
              <span className="material-icons-outlined" style={{ fontSize: '48px', opacity: 0.2 }}>pets</span>
              <p className="text-body" style={{ marginTop: '1rem', opacity: 0.5 }}>No active deals. List your first animal to get started.</p>
              <button onClick={() => onNavigate('CREATE')} className="btn-neo btn-primary" style={{ marginTop: '1.5rem' }}>
                New Listing +
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Recent Activity */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
          <h2 className="text-h1">Recent Activity</h2>
          <button onClick={() => onNavigate('HISTORY')} className="text-meta" style={{ color: 'var(--accent-blue)', cursor: 'pointer' }}>
            View all →
          </button>
        </div>
        <div className="card-neo-flat" style={{ padding: 0 }}>
          {isLoading ? (
            [0, 1, 2].map(i => (
              <div key={i} style={{ padding: '1.25rem 1.5rem', borderBottom: i < 2 ? '2px solid var(--text-main)' : 'none', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                  <div className="skeleton" style={{ height: '16px', width: '220px' }} />
                  <div className="skeleton" style={{ height: '12px', width: '100px' }} />
                </div>
                <div className="skeleton" style={{ height: '28px', width: '80px' }} />
              </div>
            ))
          ) : activity && activity.length > 0 ? (
            activity.map((item, index) => (
              <div key={item._id} style={{
                padding: '1.25rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: index !== activity.length - 1 ? '2px solid var(--text-main)' : 'none',
              }}>
                <div>
                  <h4 className="text-h3">{item.details}</h4>
                  <p className="text-meta" style={{ marginTop: '0.25rem' }}>
                    {new Date(item.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <span
                  className="text-meta"
                  style={{
                    padding: '0.25rem 0.75rem',
                    border: '2px solid var(--text-main)',
                    fontSize: '0.65rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.eventType.replace(/_/g, ' ')}
                </span>
              </div>
            ))
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.4 }}>
              <p className="text-meta">Activity will appear here once you create or interact with deals.</p>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
