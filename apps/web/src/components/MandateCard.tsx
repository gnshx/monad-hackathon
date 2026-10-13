'use client';

import React from 'react';
import { ShieldCheck, ShieldAlert, Clock, ArrowRight, Trash2 } from 'lucide-react';
import { formatEther } from 'viem';

export interface MandateItem {
  id: bigint;
  owner: string;
  agentAddress?: string;
  agentId: bigint;
  maxValuePerTx: bigint;
  maxTotalValue: bigint;
  spentValue: bigint;
  balance?: bigint;
  expiresAt: bigint;
  nonce: bigint;
  revoked: boolean;
  targets: Array<{ target: string; selector: string }>;
}

interface MandateCardProps {
  mandate: MandateItem;
  onRevoke: (id: bigint) => void;
  isRevoking: boolean;
}

export function MandateCard({ mandate, onRevoke, isRevoking }: MandateCardProps) {
  const isExpired =
    mandate.expiresAt !== 0n &&
    BigInt(Math.floor(Date.now() / 1000)) > mandate.expiresAt;

  const isActive = !mandate.revoked && !isExpired;

  const totalEth = Number(formatEther(mandate.maxTotalValue));
  const spentEth = Number(formatEther(mandate.spentValue));
  const percentSpent =
    totalEth > 0 ? Math.min(100, Math.round((spentEth / totalEth) * 100)) : 0;

  const expiryDateString =
    mandate.expiresAt === 0n
      ? 'Never (Permanent)'
      : new Date(Number(mandate.expiresAt) * 1000).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

  return (
    <div className="security-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Mandate #{mandate.id.toString()}
          </span>
          <span className="badge badge-monad" style={{ fontSize: '0.72rem' }}>
            Agent #{mandate.agentId.toString()}
          </span>
        </div>

        <div>
          {mandate.revoked ? (
            <span className="badge badge-revoked">
              <ShieldAlert size={12} /> Revoked
            </span>
          ) : isExpired ? (
            <span className="badge badge-amber">
              <Clock size={12} /> Expired
            </span>
          ) : (
            <span className="badge badge-active">
              <ShieldCheck size={12} /> Active
            </span>
          )}
        </div>
      </div>

      {/* Spending Progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.45rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Cumulative Budget Used</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {spentEth.toFixed(4)} / {totalEth.toFixed(4)} MON ({percentSpent}%)
          </span>
        </div>
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${percentSpent}%` }} />
        </div>
      </div>

      {/* Constraints Grid */}
      {/* Constraints Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          background: 'var(--bg-canvas)',
          padding: '0.85rem 1rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Per-Action Cap (Native MON)
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
            {formatEther(mandate.maxValuePerTx)} MON
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Expires</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
            {expiryDateString}
          </div>
        </div>
      </div>

      {/* Permissions / Allowed Targets */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          Allowlisted Operations ({mandate.targets.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {mandate.targets.map((t, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.785rem',
                background: 'var(--bg-canvas)',
                padding: '0.45rem 0.65rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span className="mono-value" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {t.target.slice(0, 8)}...{t.target.slice(-6)}
              </span>
              <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <ArrowRight size={12} />
                <span className="mono-value" style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
                  {t.selector}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Revocation Footer */}
      {isActive && (
        <button
          onClick={() => onRevoke(mandate.id)}
          disabled={isRevoking}
          className="btn-danger"
          style={{ width: '100%', fontSize: '0.825rem', padding: '0.55rem', marginTop: 'auto' }}
        >
          <Trash2 size={14} />
          {isRevoking ? 'Revoking on Monad...' : 'Revoke Passkey Mandate'}
        </button>
      )}
    </div>
  );
}
