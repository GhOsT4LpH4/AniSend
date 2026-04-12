import { useState, useEffect, useMemo } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import {
  formatApproxTimeFromLedgers,
  getDeal,
  getLatestLedgerSequence,
  deposit,
  confirmBuyer,
  confirmSeller,
  cancelDeal,
} from '../lib/stellar';
import type { DealData, DealStatus } from '../types';

import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const ANIMAL_EMOJI: Record<string, string> = {
  carabao: '🐃', cow: '🐄', goat: '🐐', pig: '🐷', chicken: '🐓', duck: '🦆',
};

// ---- Vertical timeline — supports either-order confirmation ----
// The contract allows buyer or seller to confirm first:
//   AwaitingDeposit → Funded → BuyerConfirmed OR SellerConfirmed → Completed
// We build the timeline dynamically based on the actual deal status.

function buildTimeline(currentStatus: DealStatus): { key: DealStatus; label: string }[] {
  const base = [
    { key: 'AwaitingDeposit' as DealStatus, label: 'Awaiting Deposit' },
    { key: 'Funded' as DealStatus,          label: 'Funded' },
  ];

  // Show confirmations in the order they actually happened
  if (currentStatus === 'BuyerConfirmed') {
    // Buyer confirmed first, waiting for seller
    base.push({ key: 'BuyerConfirmed' as DealStatus, label: 'Buyer Confirmed' });
    base.push({ key: 'SellerConfirmed' as DealStatus, label: 'Seller Confirms' });
  } else if (currentStatus === 'SellerConfirmed') {
    // Seller confirmed first, waiting for buyer
    base.push({ key: 'SellerConfirmed' as DealStatus, label: 'Seller Confirmed' });
    base.push({ key: 'BuyerConfirmed' as DealStatus, label: 'Buyer Confirms' });
  } else if (currentStatus === 'Completed') {
    // Both done — show both as completed
    base.push({ key: 'BuyerConfirmed' as DealStatus, label: 'Buyer Confirmed' });
    base.push({ key: 'SellerConfirmed' as DealStatus, label: 'Seller Confirmed' });
  } else {
    // Funded or earlier — show both as pending (either can go first)
    base.push({ key: 'BuyerConfirmed' as DealStatus, label: 'Buyer Confirms' });
    base.push({ key: 'SellerConfirmed' as DealStatus, label: 'Seller Confirms' });
  }

  base.push({ key: 'Completed' as DealStatus, label: 'Completed' });
  return base;
}

function stepState(
  step: DealStatus,
  currentStatus: DealStatus,
  isCancelled: boolean,
  timeline: { key: DealStatus; label: string }[],
) {
  if (isCancelled) return 'pending';
  const order = timeline.map(s => s.key);
  const stepIdx    = order.indexOf(step);
  const currentIdx = order.indexOf(currentStatus);
  if (currentIdx < 0) return 'pending';
  if (stepIdx < currentIdx)  return 'done';
  if (stepIdx === currentIdx) return 'current';
  return 'pending';
}

// ---- Copyable address pill ----
function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button
      onClick={copy}
      className="copyable-address"
      title={copied ? 'Copied!' : 'Click to copy full address'}
      aria-label={copied ? 'Address copied' : 'Copy address'}
    >
      <span>{address.slice(0, 8)}…{address.slice(-6)}</span>
      <span className="material-icons-outlined" style={{ fontSize: '13px', opacity: 0.6 }}>
        {copied ? 'check' : 'content_copy'}
      </span>
    </button>
  );
}

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
      .then((d) => { setDeal(d); setError(''); })
      .catch((err) => {
        setDeal(null);
        const msg = err instanceof Error ? err.message : String(err);
        // Detect unfunded account errors from Soroban/Horizon
        const isUnfunded = /not found|account.*not|resource.*not|insufficient|HostError|404/i.test(msg);
        if (isUnfunded) {
          setError('UNFUNDED_ACCOUNT');
        } else {
          setError(msg || 'Failed to load deal details from chain.');
        }
      })
      .finally(() => setLoading(false));
  }, [dealId, walletAddress]);

  useEffect(() => {
    getLatestLedgerSequence().then(setLatestLedger).catch(() => setLatestLedger(null));
  }, [dealId]);

  const handleAction = async (action: () => Promise<void>, newStatus: DealStatus, details: string) => {
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
      const updated = await getDeal(Number(dealId), walletAddress);
      setDeal(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      
      // Parse messy Soroban/Token contract errors and show clean user messages
      if (
        msg.includes('Error(Contract, #10)') || 
        msg.includes('resulting balance is not within the allowed range') ||
        msg.includes('insufficient')
      ) {
        setError('Insufficient XLM balance. Please ensure your account has enough funds to cover the deposit and network fees.');
      } else {
        // Fallback for other errors, truncating to prevent layout breakages
        setError(msg.length > 150 ? msg.substring(0, 150) + '...' : msg);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const isBuyer  = deal?.buyer  === walletAddress;
  const isSeller = deal?.seller === walletAddress;
  const role     = isSeller ? 'Seller' : isBuyer ? 'Buyer' : 'Viewer';
  const isCancelled = deal?.status === 'Cancelled';
  const animalEmoji = ANIMAL_EMOJI[deal?.description?.toLowerCase() || ''] || '🐾';

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

    // Seller can ONLY cancel before the buyer deposits
    if (isSeller && deal.status !== 'AwaitingDeposit') {
      return 'Seller cannot cancel after buyer has deposited.';
    }

    // Buyer cancel rules
    if (isBuyer) {
      // Before deposit: free cancel
      if (deal.status === 'AwaitingDeposit') return null;

      // After seller confirmed handoff: buyer MUST NOT cancel
      // (seller already delivered the animal — cancelling would be a scam)
      if (deal.status === 'SellerConfirmed') {
        return 'Cannot cancel — seller has already confirmed animal handoff. Please confirm receipt.';
      }

      // After buyer already confirmed: no cancel either
      if (deal.status === 'BuyerConfirmed') {
        return 'Cannot cancel — you already confirmed receipt. Awaiting seller confirmation.';
      }

      // Funded: buyer can only cancel after timelock expires
      if (deal.status === 'Funded') {
        if (!refundInfo) return 'Refund deadline info unavailable (try refresh).';
        if (!refundInfo.isExpired) return `Refund available in ~${refundInfo.remainingLabel}.`;
        return null; // deadline passed, allow cancel
      }
    }

    return null;
  }, [deal, isBuyer, isSeller, refundInfo]);

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
    const isUnfunded = error === 'UNFUNDED_ACCOUNT';
    const friendbotUrl = `https://friendbot.stellar.org?addr=${encodeURIComponent(walletAddress)}`;

    return (
      <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '560px', margin: '0 auto' }}>

        {isUnfunded ? (
          // ── Unfunded account — Friendbot prompt ──
          <>
            <div
              style={{
                border: '4px solid var(--accent-harvest)',
                background: 'var(--surface-container)',
                padding: '2rem',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: 'var(--shadow-neo)',
              }}
            >
              <span className="material-icons-outlined" style={{ fontSize: '48px', color: 'var(--accent-harvest)' }}>account_balance_wallet</span>
              <h2 className="text-h2">Account Not Funded</h2>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                Your Stellar account does not have any XLM yet. On Testnet, you can fund it for free using <strong style={{ color: 'var(--text-main)' }}>Friendbot</strong>.
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                After funding, come back and reload this page to view and interact with the deal.
              </p>
            </div>

            <a
              href={friendbotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-neo btn-primary btn-full"
              style={{ textDecoration: 'none', textAlign: 'center', padding: '1rem' }}
            >
              Fund Account via Friendbot →
            </a>

            <div
              style={{
                padding: '0.75rem 1rem',
                background: 'var(--bg-white)',
                border: '2px solid var(--surface-dim)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: 'var(--text-main)' }}>Your address:</strong>
              <br />
              <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                {walletAddress}
              </span>
            </div>
          </>
        ) : (
          // ── Generic deal not found ──
          <div className="card-neo-flat" style={{ textAlign: 'center', padding: '3rem' }}>
            <span className="material-icons-outlined" style={{ fontSize: '48px', opacity: 0.2 }}>search_off</span>
            <p className="text-h2" style={{ marginTop: '0.75rem' }}>Deal not found.</p>
            {error && (
              <p className="text-meta" style={{ color: 'var(--accent-clay)', marginTop: '0.5rem' }}>{error}</p>
            )}
          </div>
        )}

        <button onClick={onBack} className="btn-neo btn-secondary btn-full" style={{ marginTop: '0.5rem' }}>
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="animate-slide-up stagger-children" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

      {/* ── Header ── */}
      <section>
        <button onClick={onBack} className="text-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1rem' }}>
          ← Dashboard
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '2rem', lineHeight: 1 }}>{animalEmoji}</span>
              <h1 className="display-lg" style={{ textTransform: 'capitalize' }}>
                {deal.description || `Deal #AS-${deal.id}`}
              </h1>
            </div>
            <span className="text-meta" style={{ display: 'block' }}>
              Deal #{deal.id} · Your role:{' '}
              <strong style={{ color: 'var(--text-main)' }}>{role}</strong>
            </span>
          </div>
          <StatusBadge status={deal.status} />
        </div>
      </section>

      {/* ── Two-column: Timeline + Action Panel ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>

        {/* Left: Vertical Timeline + Deal Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Parties & Amount */}
          <div className="card-neo-flat" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
            <div>
              <span className="text-meta" style={{ display: 'block', marginBottom: '0.35rem' }}>Seller</span>
              <CopyableAddress address={deal.seller} />
            </div>
            <div>
              <span className="text-meta" style={{ display: 'block', marginBottom: '0.35rem' }}>Buyer</span>
              <CopyableAddress address={deal.buyer} />
            </div>
            <div>
              <span className="text-meta" style={{ display: 'block', marginBottom: '0.35rem' }}>Escrow Amount</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent-paddy-bright)', letterSpacing: '-0.02em' }}>
                {deal.amount} <span style={{ fontSize: '1rem', opacity: 0.65 }}>XLM</span>
              </span>
            </div>
          </div>

          {/* Vertical Timeline */}
          <div className="card-neo-flat" style={{ padding: '1.5rem' }}>
            <h3 className="text-h3" style={{ marginBottom: '1.25rem' }}>Transaction Flow</h3>
            <div className="deal-timeline" aria-label="Deal status timeline">
              {buildTimeline(deal.status).map(({ key, label }) => {
                const state = stepState(key, deal.status, isCancelled, buildTimeline(deal.status));
                return (
                  <div key={key} className="deal-timeline__step">
                    <div className={`deal-timeline__dot deal-timeline__dot--${state}${state === 'current' ? ' pulse-ring' : ''}`} />
                    <span className={`deal-timeline__label deal-timeline__label--${state}`}>
                      {label}
                      {state === 'current' && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.6rem', color: 'var(--accent-paddy-bright)', fontWeight: 700 }}>
                          ← now
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
              {isCancelled && (
                <div className="deal-timeline__step">
                  <div className="deal-timeline__dot" style={{ background: 'var(--accent-clay)', borderColor: 'var(--accent-clay)' }} />
                  <span className="deal-timeline__label" style={{ color: 'var(--accent-clay)' }}>Cancelled</span>
                </div>
              )}
            </div>
          </div>

          {/* Refund Timelock */}
          {refundInfo && (
            <div className="card-neo-flat" style={{ padding: '1.5rem' }}>
              <h3 className="text-h2" style={{ marginBottom: '0.75rem' }}>Refund Timelock</h3>
              <p className="text-body" style={{ opacity: 0.75, fontSize: '0.9rem' }}>
                After deposit, only the buyer can cancel and reclaim funds once the deadline passes.
              </p>
              <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span className="badge" style={{ background: 'var(--surface-container)', borderColor: 'var(--text-main)' }}>
                  Latest: #{latestLedger ?? '—'}
                </span>
                <span className="badge" style={{
                  background: refundInfo.isExpired ? 'var(--accent-paddy)' : 'var(--accent-harvest)',
                  color: 'var(--text-main)',
                  borderColor: 'var(--text-main)',
                }}>
                  {refundInfo.isExpired ? '✓ Refund available' : `Refund in ~${refundInfo.remainingLabel}`}
                </span>
                <span className="badge" style={{ background: 'var(--surface-container)', borderColor: 'var(--text-main)' }}>
                  Deadline: #{refundInfo.expiresLedger}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Action Panel */}
        <div className="card-neo" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignSelf: 'start' }}>
          <h2 className="text-h1">Actions</h2>

          {error && (
            <p className="text-meta" style={{ color: 'var(--accent-clay)' }} role="alert">{error}</p>
          )}

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                onClick={() => handleAction(
                  () => cancelDeal(walletAddress, Number(deal.id)),
                  'Cancelled',
                  `${role} cancelled the deal. Funds refunded to buyer.`
                )}
                disabled={actionLoading || !!cancelDisabledReason}
                className="btn-neo btn-danger btn-full"
                style={{
                  borderColor: 'var(--accent-clay)',
                  color: cancelDisabledReason ? 'var(--text-muted)' : 'var(--accent-clay)',
                  background: 'transparent',
                  whiteSpace: 'normal',
                  lineHeight: 1.3,
                }}
              >
                {actionLoading ? 'Cancelling...' : 'Cancel Deal'}
              </button>
              {cancelDisabledReason && (
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.4,
                    padding: '0.5rem 0.75rem',
                    background: 'var(--surface-container)',
                    border: '2px solid var(--surface-dim)',
                  }}
                  role="status"
                >
                  🔒 {cancelDisabledReason}
                </p>
              )}
            </div>
          )}

          {/* Completed */}
          {deal.status === 'Completed' && (
            <div style={{
              background: 'var(--accent-paddy)',
              border: '3px solid var(--accent-paddy)',
              boxShadow: 'var(--shadow-paddy), var(--glow-paddy)',
              padding: '1.5rem',
              textAlign: 'center',
              color: '#fff',
            }}>
              <span className="material-icons-outlined" style={{ fontSize: '40px' }}>check_circle</span>
              <h3 className="text-h2" style={{ marginTop: '0.5rem', color: '#fff' }}>Deal Completed</h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.5rem' }}>
                Both parties confirmed. {deal.amount} XLM released to the seller.
              </p>
            </div>
          )}

          {/* Cancelled */}
          {deal.status === 'Cancelled' && (
            <div className="card-neo-flat" style={{ textAlign: 'center', borderStyle: 'dashed', padding: '2rem' }}>
              <span className="material-icons-outlined" style={{ fontSize: '40px', opacity: 0.25 }}>block</span>
              <h3 className="text-h2" style={{ marginTop: '0.5rem', opacity: 0.55 }}>Deal Cancelled</h3>
              <p className="text-body" style={{ opacity: 0.45, marginTop: '0.5rem', fontSize: '0.9rem' }}>
                This deal has been cancelled. Funds were refunded to the buyer.
              </p>
            </div>
          )}

          {/* No actions available */}
          {!isBuyer && !isSeller && (
            <p className="text-meta" style={{ opacity: 0.5, textAlign: 'center' }}>
              You are viewing this deal as a third party.
            </p>
          )}
        </div>

      </section>

    </div>
  );
}
