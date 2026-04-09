import React, { useState } from 'react';
import { createDeal } from '../lib/stellar';
import { USDC_CONTRACT_ID } from '../lib/config';

// Convex Hooks
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface CreateDealProps {
  sellerAddress: string;
  onSuccess: (dealId: string) => void;
  onCancel: () => void;
}

const animalTypes = ['Carabao', 'Cow', 'Goat', 'Pig', 'Chicken', 'Duck'];

export function CreateDeal({ sellerAddress, onSuccess, onCancel }: CreateDealProps) {
  const [buyerAddress, setBuyerAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('carabao');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const syncDealInDB = useMutation(api.deals.syncDeal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerAddress || !amount) {
      setError('Please provide both a buyer address and an amount.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Please enter a valid amount.');
      }

      // 1. Blockchain Transaction (On-chain)
      const dealId = await createDeal(sellerAddress, {
        buyerAddress,
        tokenAddress: USDC_CONTRACT_ID,
        amountUSDC: parsedAmount,
        description,
      });

      // 2. Database Sync (Convex)
      await syncDealInDB({
        dealId: Number(dealId),
        sellerAddress: sellerAddress,
        buyerAddress: buyerAddress,
        amountUsd: parsedAmount,
        description: description,
        status: "AwaitingDeposit",
        invoiceRef: `${description} — ${buyerAddress.slice(0, 8)}...`,
        eventDetails: `Listed ${description} for ${parsedAmount} XLM.`,
      });

      onSuccess(dealId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create deal.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-slide-up stagger-children" style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

      <section>
        <button onClick={onCancel} className="text-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1rem' }}>
          ← Dashboard
        </button>
        <h1 className="display-lg">List Animal for Sale</h1>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>

        <form onSubmit={handleSubmit} className="card-neo" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <h2 className="text-h1">Deal Entry</h2>

          {/* Animal Type */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label className="input-label">Animal Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {animalTypes.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDescription(type.toLowerCase())}
                  className={`btn-neo btn-sm ${description === type.toLowerCase() ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Buyer Address */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label className="input-label">Buyer Stellar Address</label>
            <input
              type="text"
              placeholder="G...ABCD"
              value={buyerAddress}
              onChange={(e) => setBuyerAddress(e.target.value)}
              disabled={loading}
              className="input-neo-box"
              style={{ fontFamily: 'monospace' }}
            />
          </div>

          {/* Amount */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label className="input-label">Price (XLM)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700 }}>$</span>
              <input
                type="number"
                step="0.0000001"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                className="input-neo-box"
                style={{ paddingLeft: '32px', fontSize: '1.25rem' }}
              />
            </div>
          </div>

          {error && <p className="text-meta" style={{ color: 'var(--accent-red)' }}>{error}</p>}

          <button
            type="submit"
            disabled={loading || !amount || !buyerAddress}
            className="btn-neo btn-primary btn-full"
            style={{ padding: '1.25rem' }}
          >
            {loading ? 'Creating On-Chain...' : 'Create Listing →'}
          </button>
        </form>

        {/* Summary Card */}
        <div className="card-neo-accent" style={{ backgroundColor: 'var(--surface-container)' }}>
          <h2 className="text-h2">Deal Summary</h2>
          <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-body">Animal</span>
              <span className="text-h3" style={{ textTransform: 'capitalize' }}>{description}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-body">Sale Price</span>
              <span className="text-h3">{amount || '0.00'} XLM</span>
            </div>
            <hr style={{ border: 'none', borderTop: '2px solid var(--text-main)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-h3">Buyer Deposits</span>
              <span className="text-h2">{amount || '0.00'} XLM</span>
            </div>
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg)', border: '2px dashed var(--text-main)' }}>
              <p className="text-meta" style={{ opacity: 0.7 }}>
                ✅ Funds are held in smart contract escrow<br/>
                ✅ Released only when both parties confirm<br/>
                ✅ Either party can cancel for a full refund
              </p>
            </div>
          </div>
        </div>

      </section>
    </div>
  );
}
