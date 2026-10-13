'use client';

import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Ban,
  Copy,
  Check,
  Radio,
} from 'lucide-react';
import { formatEther } from 'viem';
import type { ActivityItem } from './ActivityFeed';

interface SecurityActivityFeedProps {
  activities: ActivityItem[];
  networkMode?: 'LOCAL_SIMULATION' | 'MONAD_TESTNET';
}

export function SecurityActivityFeed({ activities, networkMode = 'MONAD_TESTNET' }: SecurityActivityFeedProps) {
  const [filter, setFilter] = useState<'all' | 'executed' | 'blocked' | 'revoked'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = activities.filter((a) => {
    if (filter === 'executed') return a.type === 'executed';
    if (filter === 'blocked') return a.type === 'blocked';
    if (filter === 'revoked') return a.type === 'revoked';
    return true;
  });

  const copyHash = (id: string, hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-neutral">Audit Trail</span>
            {networkMode === 'LOCAL_SIMULATION' ? (
              <span className="badge badge-simulation">
                <Radio size={10} color="#FBBF24" />
                LOCAL SIMULATION EVENTS
              </span>
            ) : (
              <span className="badge badge-emerald">
                MONAD TESTNET (10143)
              </span>
            )}
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Security Activity Feed
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Chronological audit of passkey authorizations, executed transactions, blocked contract reverts, and revocations.
          </p>
        </div>

        {/* Filter Buttons */}
        <div
          style={{
            background: 'var(--bg-canvas)',
            padding: '0.25rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: '0.2rem',
          }}
        >
          {(['all', 'executed', 'blocked', 'revoked'] as const).map((t) => (
            <button
              key={t}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: filter === t ? 'var(--bg-surface)' : 'transparent',
                color: filter === t ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: filter === t ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'all 0.12s ease',
              }}
              onClick={() => setFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-canvas)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.85rem', color: 'var(--text-muted)' }}>
            <Activity size={24} />
          </div>
          <div className="empty-state-title">No Activity Recorded</div>
          <p className="empty-state-desc">
            {networkMode === 'MONAD_TESTNET'
              ? 'No Monad Testnet events from this browser session match this filter.'
              : `No events match the selected "${filter}" filter. Run Attack Lab scenarios or create a sandbox mandate to add simulated events.`}
          </p>
        </div>
      )}

      {/* Activity Timeline */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map((item) => {
            const isExecuted = item.type === 'executed';
            const isBlocked = item.type === 'blocked';
            const isRevoked = item.type === 'revoked';
            const isCreated = item.type === 'created';
            const isCopied = copiedId === item.id;
            const isRealOnChain = networkMode === 'MONAD_TESTNET' && !item.id.startsWith('sim-');

            return (
              <div
                key={item.id}
                className="security-card"
                style={{
                  padding: '1rem 1.25rem',
                  borderLeft: `4px solid ${
                    isExecuted
                      ? 'var(--accent-emerald)'
                      : isBlocked
                      ? 'var(--accent-rose)'
                      : 'var(--accent-amber)'
                  }`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', minWidth: '280px', flex: 1 }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius-sm)',
                      background: isExecuted
                        ? 'var(--bg-emerald-pill)'
                        : isBlocked
                        ? 'var(--bg-rose-pill)'
                        : 'var(--bg-amber-pill)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    {isExecuted && <CheckCircle2 size={18} color="var(--accent-emerald)" />}
                    {isBlocked && <XCircle size={18} color="var(--accent-rose)" />}
                    {isRevoked && <Ban size={18} color="var(--accent-amber)" />}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                        {isExecuted
                          ? `Approved Action · Mandate #${item.mandateId?.toString() || '0'}`
                          : isBlocked
                          ? `Security Revert · Mandate #${item.mandateId?.toString() || '0'}`
                          : isCreated
                          ? `Mandate Created · #${item.mandateId?.toString() || '0'}`
                          : `Mandate Revoked · #${item.mandateId?.toString() || '0'}`}
                      </strong>

                      <span
                        className={`badge ${
                          isExecuted ? 'badge-emerald' : isBlocked ? 'badge-rose' : 'badge-amber'
                        }`}
                        style={{ fontSize: '0.68rem' }}
                      >
                        {isExecuted ? 'Allowed' : isBlocked ? (isRealOnChain ? 'Contract Blocked' : 'Blocked (simulated)') : isCreated ? 'Created' : 'Revoked'}
                      </span>

                      <span
                        className={`badge ${isRealOnChain ? 'badge-emerald' : 'badge-neutral'}`}
                        style={{ fontSize: '0.68rem' }}
                      >
                        {isRealOnChain
                          ? 'Monad Testnet'
                          : networkMode === 'LOCAL_SIMULATION'
                          ? 'Simulation'
                          : 'Reference Sample'}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      {isExecuted && item.value && (
                        <>
                          {isRealOnChain ? 'Executed' : 'Simulated'} {formatEther(item.value)} MON call to allowlisted target {item.target?.slice(0, 8)}...
                        </>
                      )}
                      {isBlocked && (
                        <span style={{ color: 'var(--accent-rose)', fontWeight: 500 }}>{item.reason || 'Smart contract halted policy violation'}</span>
                      )}
                      {isCreated && (
                        <>Mandate created with {formatEther(item.value ?? 0n)} MON deposited into its vault. No agent action yet.</>
                      )}
                      {isRevoked && (
                        <>{isRealOnChain ? 'Owner revoked the mandate on the Monad contract' : 'Owner revoked the mandate in the local sandbox'}</>
                      )}
                    </p>
                  </div>
                </div>

                {/* Tx Hash & Timestamp */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  {item.txHash && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        background: 'var(--bg-canvas)',
                        padding: '0.25rem 0.6rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <span className="mono-value" style={{ color: 'var(--text-secondary)' }}>
                        {item.txHash.slice(0, 8)}...{item.txHash.slice(-6)}
                      </span>
                      <button
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
                        onClick={() => copyHash(item.id, item.txHash!)}
                        title="Copy Tx Hash"
                        aria-label="Copy transaction hash"
                      >
                        {isCopied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                      </button>
                    </div>
                  )}

                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '65px', textAlign: 'right' }}>
                    {item.timestamp}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
