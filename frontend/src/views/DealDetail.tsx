import { useState, useEffect, useMemo } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import { formatApproxTimeFromLedgers, getDeal, getLatestLedgerSequence, deposit, confirmBuyer, confirmSeller, cancelDeal } from '../lib/stellar';
import type { DealData, DealStatus } from '../types';

import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface DealDetailProps {
  dealId: string;
  walletAddress: string;
  onBack: () => void;
}

export function DealDetail({ dealId, walletAddress, onBack }: DealDetailProps) {
  const [deal, setDeal] = useState<DealData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [latestLedger, setLatestLedger] = useState<number | null>(null);

  const logDealEvent = useMutation(api.deals.logDealEvent);

  useEffect(() => {
    if (!dealId) return;
    setError('');
    setDeal(null);
    setLoading(true);
    getDeal(Number(dealId), walletAddress)
      .then((d) => {
        setDeal(d);
        setError('');
      })
      .catch(() => {
        setDeal(null);
        setError('Failed to load deal details from chain.');
      })
      .finally(() => setLoading(false));
  }, [dealId, walletAddress]);

  useEffect(() => {
    getLatestLedgerSequence()
      .then(setLatestLedger)
      .catch(() => setLatestLedger(null));
  }, [dealId]);

  const handleAction = async (
    action: () => Promise<void>,
    newStatus: DealStatus,
    details: string
  ) => {
    try {
      setActionLoading(true);
      setError('');
      await action();
      await logDealEvent({
        dealId: Number(dealId),
        userAddress: walletAddress,
        eventDetails: details,
        eventType: `DEAL_${newStatus.toUpperCase()}`,
      });
      // Reload deal
      const updated = await getDeal(Number(dealId), walletAddress);
      setDeal(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // IMPORTANT: hooks must not be called conditionally; compute derived values
  // before any early returns.
  const isBuyer = deal?.buyer === walletAddress;
  const isSeller = deal?.seller === walletAddress;
  const role = isSeller ? 'Seller' : isBuyer ? 'Buyer' : 'Viewer';

  const refundInfo = useMemo(() => {
    if (!deal?.expiresLedger || !latestLedger) return null;
    const remaining = deal.expiresLedger - latestLedger;
    return {
      expiresLedger: deal.expiresLedger,
      remainingLedgers: remaining,
      remainingLabel: formatApproxTimeFromLedgers(remaining),
      isExpired: remaining <= 0,
    };
  }, [deal?.expiresLedger, latestLedger]);

  const cancelDisabledReason = useMemo(() => {
    if (!deal) return null;
    if (!isBuyer) return null; // seller cancellation behavior is enforced by contract; UI can still allow "try"
    if (deal.status === 'AwaitingDeposit') return null;
    if (!refundInfo) return 'Refund deadline info unavailable (try refresh).';
    if (!refundInfo.isExpired) return `Refund available in ~${refundInfo.remainingLabel}.`;
    return null;
  }, [deal, isBuyer, refundInfo]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="skeleton" style={{ height: '32px', width: '200px' }} />
        <div className="skeleton" style={{ height: '200px', width: '100%' }} />
        <div className="skeleton" style={{ height: '150px', width: '100%' }} />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="card-neo-flat" style={{ textAlign: 'center', padding: '3rem' }}>
        <p className="text-h2">Deal not found.</p>
        <button onClick={onBack} className="btn-neo btn-secondary" style={{ marginTop: '1.5rem' }}>← Back</button>
      </div>
    );
  }

  return (
    <div className="animate-slide-up stagger-children" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

      {/* Header */}
      <section>
        <button onClick={onBack} className="text-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1rem' }}>
          ← Dashboard
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="display-lg" style={{ textTransform: 'capitalize' }}>
              {deal.description || `Deal #AS-${deal.id}`}
            </h1>
            <span className="text-meta" style={{ marginTop: '0.5rem', display: 'block' }}>Deal #{deal.id} · Your role: {role}</span>
          </div>
          <StatusBadge status={deal.status} />
        </div>
      </section>

      {/* Deal Info Cards */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
        <div className="card-neo">
          <span className="text-meta">Seller</span>
          <p className="text-mono" style={{ marginTop: '0.5rem', wordBreak: 'break-all' }}>{deal.seller}</p>
        </div>
        <div className="card-neo">
          <span className="text-meta">Buyer</span>
          <p className="text-mono" style={{ marginTop: '0.5rem', wordBreak: 'break-all' }}>{deal.buyer}</p>
        </div>
        <div className="card-neo-accent" style={{ backgroundColor: 'var(--accent-yellow)' }}>
          <span className="text-meta" style={{ color: 'var(--text-main)' }}>Escrow Amount</span>
          <h2 className="display-lg" style={{ lineHeight: 1, marginTop: '0.5rem' }}>
            {deal.amount} <span className="text-h2" style={{ opacity: 0.7 }}>XLM</span>
          </h2>
        </div>
      </section>

      {/* Deadline / Timelock */}
      {refundInfo && (
        <section className="card-neo-flat" style={{ padding: '2rem' }}>
          <h3 className="text-h2" style={{ marginBottom: '0.75rem' }}>Refund Timelock</h3>
          <p className="text-body" style={{ opacity: 0.8 }}>
            After deposit, only the buyer can cancel and reclaim funds once the deadline passes.
          </p>
          <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span className="badge" style={{ background: 'var(--surface-container)', borderColor: 'var(--text-main)' }}>
              Latest ledger: {latestLedger ?? '—'}
            </span>
            <span className="badge" style={{ background: refundInfo.isExpired ? 'var(--accent-green)' : 'var(--accent-yellow)', color: refundInfo.isExpired ? 'white' : 'var(--text-main)' }}>
              Refund {refundInfo.isExpired ? 'available now' : `in ~${refundInfo.remainingLabel}`}
            </span>
            <span className="badge" style={{ background: 'var(--surface-container)', borderColor: 'var(--text-main)' }}>
              Deadline ledger: {refundInfo.expiresLedger}
            </span>
          </div>
        </section>
      )}

      {/* Action Panel */}
      <section className="card-neo" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <h2 className="text-h1">Actions</h2>

        {error && <p className="text-meta" style={{ color: 'var(--accent-red)' }}>{error}</p>}

        {/* Buyer: Deposit */}
        {isBuyer && deal.status === 'AwaitingDeposit' && (
          <button
            onClick={() => handleAction(
              () => deposit(walletAddress, Number(deal.id)),
              'Funded',
              `Buyer deposited ${deal.amount} XLM into escrow.`
            )}
            disabled={actionLoading}
            className="btn-neo btn-primary btn-full"
          >
            {actionLoading ? 'Depositing...' : `Deposit ${deal.amount} XLM →`}
          </button>
        )}

        {/* Buyer: Confirm Receipt */}
        {isBuyer && (deal.status === 'Funded' || deal.status === 'SellerConfirmed') && (
          <button
            onClick={() => handleAction(
              () => confirmBuyer(walletAddress, Number(deal.id)),
              deal.status === 'SellerConfirmed' ? 'Completed' : 'BuyerConfirmed',
              'Buyer confirmed animal was received.'
            )}
            disabled={actionLoading}
            className="btn-neo btn-primary btn-full"
          >
            {actionLoading ? 'Confirming...' : '✅ I Received the Animal'}
          </button>
        )}

        {/* Seller: Confirm Handoff */}
        {isSeller && (deal.status === 'Funded' || deal.status === 'BuyerConfirmed') && (
          <button
            onClick={() => handleAction(
              () => confirmSeller(walletAddress, Number(deal.id)),
              deal.status === 'BuyerConfirmed' ? 'Completed' : 'SellerConfirmed',
              'Seller confirmed animal was handed over.'
            )}
            disabled={actionLoading}
            className="btn-neo btn-primary btn-full"
          >
            {actionLoading ? 'Confirming...' : '✅ I Handed Over the Animal'}
          </button>
        )}

        {/* Cancel */}
        {(isBuyer || isSeller) && deal.status !== 'Completed' && deal.status !== 'Cancelled' && (
          <button
            onClick={() => handleAction(
              () => cancelDeal(walletAddress, Number(deal.id)),
              'Cancelled',
              `${role} cancelled the deal. Funds refunded to buyer.`
            )}
            disabled={actionLoading || !!cancelDisabledReason}
            className="btn-neo btn-danger btn-full"
            title={cancelDisabledReason || undefined}
          >
            {actionLoading ? 'Cancelling...' : cancelDisabledReason ? `Cancel locked (${cancelDisabledReason})` : 'Cancel Deal'}
          </button>
        )}

        {/* Completed */}
        {deal.status === 'Completed' && (
          <div className="card-neo-accent" style={{ backgroundColor: 'var(--accent-green)', color: 'white', textAlign: 'center' }}>
            <span className="material-icons-outlined" style={{ fontSize: '48px' }}>check_circle</span>
            <h3 className="text-h2" style={{ marginTop: '0.5rem', color: 'white' }}>Deal Completed</h3>
            <p className="text-body" style={{ color: 'rgba(255,255,255,0.8)', marginTop: '0.5rem' }}>
              Both parties confirmed. {deal.amount} XLM has been released to the seller.
            </p>
          </div>
        )}

        {/* Cancelled */}
        {deal.status === 'Cancelled' && (
          <div className="card-neo-flat" style={{ textAlign: 'center', borderStyle: 'dashed', padding: '2rem' }}>
            <span className="material-icons-outlined" style={{ fontSize: '48px', opacity: 0.3 }}>block</span>
            <h3 className="text-h2" style={{ marginTop: '0.5rem', opacity: 0.6 }}>Deal Cancelled</h3>
            <p className="text-body" style={{ opacity: 0.5, marginTop: '0.5rem' }}>
              This deal has been cancelled. Funds were refunded to the buyer.
            </p>
          </div>
        )}
      </section>

      {/* Status Flow Diagram */}
      <section className="card-neo-flat" style={{ padding: '2rem' }}>
        <h3 className="text-h2" style={{ marginBottom: '1.5rem' }}>Transaction Flow</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          {(['AwaitingDeposit', 'Funded', 'BuyerConfirmed', 'Completed'] as DealStatus[]).map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                className="badge"
                style={{
                  background: deal.status === step || (['AwaitingDeposit', 'Funded', 'BuyerConfirmed', 'Completed'].indexOf(deal.status) >= i && deal.status !== 'Cancelled')
                    ? 'var(--accent-green)' : 'var(--surface-dim)',
                  color: deal.status === step || (['AwaitingDeposit', 'Funded', 'BuyerConfirmed', 'Completed'].indexOf(deal.status) >= i && deal.status !== 'Cancelled')
                    ? 'white' : 'var(--text-muted)',
                  fontSize: '0.65rem',
                }}
              >
                {step.replace(/([A-Z])/g, ' $1').trim()}
              </span>
              {i < 3 && <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>→</span>}
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
