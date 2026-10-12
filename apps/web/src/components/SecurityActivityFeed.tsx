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
                <Radio size={10} color="#f59e0b" />
                LOCAL SIMULATION EVENTS
              </span>
            ) : (
              <span className="badge badge-emerald">
                MONAD TESTNET (10143)
              </span>
            )}
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
            Security Activity Feed
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            Chronological audit of passkey authorizations, executed transactions, blocked contract reverts, and revocations.
          </p>
        </div>

        {/* Filter Buttons */}
        <div
          style={{
            background: 'var(--bg-input)',
            padding: '0.2rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: '0.2rem',
          }}
        >
          {(['all', 'executed', 'blocked', 'revoked'] as const).map((t) => (
            <button
              key={t}
              className="btn-secondary"
              style={{
                padding: '0.3rem 0.65rem',
                fontSize: '0.72rem',
                border: 'none',
                background: filter === t ? 'var(--bg-surface-elevated)' : 'transparent',
                color: filter === t ? '#fff' : 'var(--text-muted)',
                textTransform: 'capitalize',
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
          <Activity size={32} color="var(--text-muted)" />
          <div className="empty-state-title">No Activity Recorded</div>
          <p className="empty-state-desc">
            {networkMode === 'MONAD_TESTNET'
              ? 'No live on-chain Monad Testnet events recorded for this filter in the current session.'
              : `No events match the selected "${filter}" filter. Trigger a transaction in the Attack Lab to generate real-time sandbox proofs.`}
          </p>
        </div>
      )}

      {/* Activity Timeline */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {filtered.map((item) => {
            const isExecuted = item.type === 'executed';
            const isBlocked = item.type === 'blocked';
            const isRevoked = item.type === 'revoked';
            const isCopied = copiedId === item.id;
            const isRealOnChain = networkMode === 'MONAD_TESTNET' && !item.id.startsWith('sim-');

            return (
              <div
                key={item.id}
                className="security-card"
                style={{
                  padding: '0.85rem 1.15rem',
                  borderLeft: `3px solid ${
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
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', minWidth: '280px', flex: 1 }}>
                  <div
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: 'var(--radius-sm)',
                      background: isExecuted
                        ? 'var(--accent-emerald-subtle)'
                        : isBlocked
                        ? 'var(--accent-rose-subtle)'
                        : 'var(--accent-amber-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    {isExecuted && <CheckCircle2 size={16} color="var(--accent-emerald)" />}
                    {isBlocked && <XCircle size={16} color="var(--accent-rose)" />}
                    {isRevoked && <Ban size={16} color="var(--accent-amber)" />}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.875rem', color: '#fff' }}>
                        {isExecuted
                          ? `Approved Action · Mandate #${item.mandateId?.toString() || '0'}`
                          : isBlocked
                          ? `Security Revert · Mandate #${item.mandateId?.toString() || '0'}`
                          : `Mandate Revoked · #${item.mandateId?.toString() || '0'}`}
                      </strong>

                      <span
                        className={`badge ${
                          isExecuted ? 'badge-emerald' : isBlocked ? 'badge-rose' : 'badge-amber'
                        }`}
                        style={{ fontSize: '0.65rem' }}
                      >
                        {isExecuted ? 'Allowed' : isBlocked ? 'Contract Blocked' : 'Revoked'}
                      </span>

                      <span
                        className={`badge ${isRealOnChain ? 'badge-emerald' : 'badge-neutral'}`}
                        style={{ fontSize: '0.65rem' }}
                      >
                        {isRealOnChain
                          ? 'Monad Testnet'
                          : networkMode === 'LOCAL_SIMULATION'
                          ? 'Simulation'
                          : 'Reference Sample'}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      {isExecuted && item.value && (
                        <>Executed {formatEther(item.value)} MON transfer to allowlisted target {item.target?.slice(0, 8)}...</>
                      )}
                      {isBlocked && (
                        <span style={{ color: 'var(--accent-rose)' }}>{item.reason || 'Smart contract halted policy violation'}</span>
                      )}
                      {isRevoked && (
                        <>Human owner revoked passkey mandate authority on Monad contract</>
                      )}
                    </p>
                  </div>
                </div>

                {/* Tx Hash & Timestamp */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  {item.txHash && (
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        background: 'var(--bg-input)',
                        padding: '0.25rem 0.55rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>
                        {item.txHash.slice(0, 8)}...{item.txHash.slice(-6)}
                      </span>
                      <button
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                        onClick={() => copyHash(item.id, item.txHash!)}
                        title="Copy Tx Hash"
                        aria-label="Copy transaction hash"
                      >
                        {isCopied ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
                      </button>
                    </div>
                  )}

                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: '65px', textAlign: 'right' }}>
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
