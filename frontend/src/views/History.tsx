import { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { StatusBadge } from '../components/StatusBadge';
import type { DealStatus } from '../types';
import { getDeal } from '../lib/stellar';

interface HistoryProps {
  wallet: string;
  onViewDeal: (dealId: string) => void;
}

export function History({ wallet, onViewDeal }: HistoryProps) {
  const deals = useQuery(api.deals.listMyDeals, { userAddress: wallet, contractId: import.meta.env.VITE_CONTRACT_ID || '' });
  const activity = useQuery(api.deals.getMyActivity, { userAddress: wallet, limit: 50 });
  const [chainStatusByDealId, setChainStatusByDealId] = useState<Record<string, DealStatus>>({});
  const [chainAmountByDealId, setChainAmountByDealId] = useState<Record<string, string>>({});

  const isLoading = deals === undefined || activity === undefined;

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
      // ignore
    });

    return () => {
      cancelled = true;
    };
  }, [deals, wallet]);

  return (
    <div className="animate-slide-up stagger-children" style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

      <section>
        <span className="text-meta">Ledger</span>
        <h1 className="display-lg">Deal History</h1>
      </section>

      {/* All Deals */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
          <h2 className="text-h1">All Deals</h2>
          {isLoading && <span className="text-meta animate-pulse">Loading...</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {deals && deals.length > 0 ? (
            deals.map((deal) => (
              <div
                key={deal._id}
                className="card-neo"
                onClick={() => onViewDeal(deal.dealId.toString())}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <StatusBadge status={(chainStatusByDealId[deal.dealId.toString()] || 'AwaitingDeposit') as DealStatus} />
                  <h3 className="text-h2" style={{ marginTop: '0.5rem', textTransform: 'capitalize' }}>
                    {deal.description || `Deal #AS-${deal.dealId}`}
                  </h3>
                  <p className="text-meta">
                    {deal.sellerAddress === wallet ? 'Buyer' : 'Seller'}: {(deal.sellerAddress === wallet ? deal.buyerAddress : deal.sellerAddress).slice(0, 8)}...{(deal.sellerAddress === wallet ? deal.buyerAddress : deal.sellerAddress).slice(-4)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="text-h2" style={{ fontWeight: 700 }}>
                    {(chainAmountByDealId[deal.dealId.toString()] || deal.amountUsd.toFixed(2))} XLM
                  </p>
                </div>
              </div>
            ))
          ) : !isLoading ? (
            <div className="card-neo-flat" style={{ textAlign: 'center', padding: '3rem', borderStyle: 'dashed' }}>
              <span className="material-icons-outlined" style={{ fontSize: '48px', opacity: 0.2 }}>receipt_long</span>
              <p className="text-body" style={{ marginTop: '1rem', opacity: 0.5 }}>No deals yet.</p>
            </div>
          ) : null}
        </div>
      </section>

      {/* Activity Log */}
      <section>
        <h2 className="text-h1" style={{ marginBottom: '1.5rem' }}>Activity Log</h2>
        <div className="card-neo-flat" style={{ padding: 0 }}>
          {activity && activity.length > 0 ? (
            activity.map((item, index) => (
              <div
                key={item._id}
                style={{
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: index !== activity.length - 1 ? '2px solid var(--text-main)' : 'none',
                }}
              >
                <div>
                  <p className="text-h3">{item.details}</p>
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
          ) : !isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.4 }}>
              <p className="text-meta">No activity yet.</p>
            </div>
          ) : null}
        </div>
      </section>

    </div>
  );
}
