import React, { useState } from 'react';
import { createDeal } from '../lib/stellar';
import { XLM_TOKEN_CONTRACT_ID } from '../lib/config';

// Convex Hooks
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface CreateDealProps {
  sellerAddress: string;
  onSuccess: (dealId: string) => void;
  onCancel: () => void;
}

const animalTypes = [
  { key: 'carabao', label: 'Carabao', emoji: '🐃' },
  { key: 'cow',     label: 'Cow',     emoji: '🐄' },
  { key: 'goat',    label: 'Goat',    emoji: '🐐' },
  { key: 'pig',     label: 'Pig',     emoji: '🐷' },
  { key: 'chicken', label: 'Chicken', emoji: '🐓' },
  { key: 'duck',    label: 'Duck',    emoji: '🦆' },
];

export function CreateDeal({ sellerAddress, onSuccess, onCancel }: CreateDealProps) {
  const [buyerAddress, setBuyerAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('carabao');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const syncDealInDB = useMutation(api.deals.syncDeal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // ── Client-side validations (mirrors contract rules) ──

    const trimmedBuyer = buyerAddress.trim();

    if (!trimmedBuyer) {
      setError('Buyer address is required.');
      return;
    }

    // Stellar public keys: start with G, exactly 56 uppercase alphanumeric chars
    if (!/^G[A-Z2-7]{55}$/.test(trimmedBuyer)) {
      setError('Invalid Stellar address. Must start with "G" and be 56 characters long.');
      return;
    }

    // Contract error #5 — SameParty: seller and buyer cannot be the same
    if (trimmedBuyer === sellerAddress) {
      setError('You cannot create a deal with yourself as the buyer.');
      return;
    }

    if (!amount) {
      setError('Please enter a sale price.');
      return;
    }

    const parsedAmount = parseFloat(amount);

    // Contract error #4 — InvalidAmount: must be > 0
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    // Guard against accidental huge amounts (UI-only safety net)
    if (parsedAmount > 100_000_000) {
      setError('Amount seems too large. Please double-check the price.');
      return;
    }

    try {
      setLoading(true);

      const dealId = await createDeal(sellerAddress, {
        buyerAddress: trimmedBuyer,
        tokenAddress: XLM_TOKEN_CONTRACT_ID,
        amountXLM: parsedAmount,
        description,
      });

      await syncDealInDB({
        dealId: Number(dealId),
        contractId: import.meta.env.VITE_CONTRACT_ID || '',
        sellerAddress,
        buyerAddress: trimmedBuyer,
        amountUsd: parsedAmount,
        description,
        invoiceRef: `${description} — ${trimmedBuyer.slice(0, 8)}...`,
        eventDetails: `Listed ${description} for ${parsedAmount} XLM.`,
      });

      onSuccess(dealId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create deal.');
    } finally {
      setLoading(false);
    }
  };

  const selectedAnimal = animalTypes.find(a => a.key === description) || animalTypes[0];

  return (
    <div className="animate-slide-up stagger-children" style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

      <section>
        <button onClick={onCancel} className="text-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1rem' }}>
          ← Dashboard
        </button>
        <h1 className="display-lg">List Animal for Sale</h1>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>

        <form onSubmit={handleSubmit} className="card-neo" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <h2 className="text-h1">Deal Entry</h2>

          {/* ── Animal Type — Visual Tile Picker ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label className="input-label">Animal Type</label>
            <div className="animal-tile-grid" role="group" aria-label="Select animal type">
              {animalTypes.map(animal => (
                <button
                  key={animal.key}
                  type="button"
                  onClick={() => setDescription(animal.key)}
                  className="animal-tile"
                  data-selected={description === animal.key}
                  aria-pressed={description === animal.key}
                >
                  <span className="animal-tile__emoji">{animal.emoji}</span>
                  <span className="animal-tile__label">{animal.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Buyer Address ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label className="input-label" htmlFor="buyer-address">Buyer Stellar Address</label>
            <input
              id="buyer-address"
              type="text"
              placeholder="G...ABCD"
              value={buyerAddress}
              onChange={(e) => setBuyerAddress(e.target.value)}
              disabled={loading}
              className="input-neo-box"
              style={{ fontFamily: 'monospace' }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* ── Amount ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label className="input-label" htmlFor="deal-amount">Price (XLM)</label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}>
                ✦
              </span>
              <input
                id="deal-amount"
                type="number"
                step="0.0000001"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                className="input-neo-box"
                style={{ paddingLeft: '36px', fontSize: '1.25rem' }}
                min="0"
              />
            </div>
          </div>

          {error && (
            <p className="text-meta" style={{ color: 'var(--accent-clay)' }} role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !amount || !buyerAddress}
            className="btn-neo btn-primary btn-full"
            style={{ padding: '1.25rem' }}
          >
            {loading ? 'Creating On-Chain...' : `List ${selectedAnimal.emoji} for Sale →`}
          </button>
        </form>

        {/* ── Summary Card ── */}
        <div className="card-neo-accent" style={{ backgroundColor: 'var(--surface-container)' }}>
          <h2 className="text-h2">Deal Summary</h2>
          <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-body">Animal</span>
              <span className="text-h3" style={{ textTransform: 'capitalize' }}>
                {selectedAnimal.emoji} {selectedAnimal.label}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-body">Sale Price</span>
              <span className="text-h3">{amount || '0.00'} XLM</span>
            </div>
            <hr style={{ border: 'none', borderTop: '2px solid var(--text-main)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-h3">Buyer Deposits</span>
              <span className="text-h2" style={{ color: 'var(--accent-paddy-bright)' }}>{amount || '0.00'} XLM</span>
            </div>

            {/* Escrow guarantees */}
            <div style={{ marginTop: '0.5rem', padding: '1rem', background: 'var(--bg)', border: '2px dashed var(--surface-dim)' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--accent-paddy-bright)', marginRight: '0.4rem' }}>✓</span>
                Funds held in smart contract escrow<br />
                <span style={{ color: 'var(--accent-paddy-bright)', marginRight: '0.4rem' }}>✓</span>
                Released only when both parties confirm<br />
                <span style={{ color: 'var(--accent-paddy-bright)', marginRight: '0.4rem' }}>✓</span>
                Either party can cancel for a full refund
              </p>
            </div>

          </div>
        </div>

      </section>
    </div>
  );
}
