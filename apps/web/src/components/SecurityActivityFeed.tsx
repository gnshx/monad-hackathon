'use client';

import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Ban,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  Filter,
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
      {/* Header & Filter Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-emerald">Real-Time Consensus</span>
            <span className="badge badge-neutral">Immutable Audit Trail</span>
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
            Live Security Activity Feed
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Chronological audit of passkey authorizations, executions, blocked policy violations, and revocations.
          </p>
        </div>

        <div style={{ background: 'var(--bg-input)', padding: '0.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', gap: '0.25rem' }}>
          {(['all', 'executed', 'blocked', 'revoked'] as const).map((t) => (
            <button
              key={t}
              className="btn-secondary"
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
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

      {/* Activity Timeline List */}
      {filtered.length === 0 ? (
        <div
          className="security-card"
          style={{
            textAlign: 'center',
            padding: '2.5rem 1.5rem',
            border: '1px dashed var(--border-subtle)',
          }}
        >
          <Activity size={32} color="var(--text-muted)" style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', marginBottom: '0.25rem' }}>
            No Activity Recorded
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {networkMode === 'MONAD_TESTNET'
              ? 'No live on-chain Monad Testnet events recorded for this filter in the current session.'
              : 'No matching activities found for this filter.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', minWidth: '280px' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
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
                    {isExecuted && <CheckCircle2 size={18} color="var(--accent-emerald)" />}
                    {isBlocked && <XCircle size={18} color="var(--accent-rose)" />}
                    {isRevoked && <Ban size={18} color="var(--accent-amber)" />}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#fff' }}>
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
                        style={{ fontSize: '0.68rem' }}
                      >
                        {isExecuted ? 'Allowed' : isBlocked ? 'Policy Blocked' : 'Revoked'}
                      </span>

                      <span
                        className={`badge ${isRealOnChain ? 'badge-monad' : 'badge-neutral'}`}
                        style={{ fontSize: '0.65rem' }}
                      >
                        {isRealOnChain
                          ? 'Monad Testnet'
                          : networkMode === 'LOCAL_SIMULATION'
                          ? 'Simulation'
                          : 'Reference Sample'}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      {isExecuted && item.value && (
                        <>Transferred {formatEther(item.value)} MON to target {item.target?.slice(0, 8)}... within budget</>
                      )}
                      {isBlocked && (
                        <span style={{ color: 'var(--accent-rose)' }}>{item.reason || 'Contract policy violation blocked on-chain'}</span>
                      )}
                      {isRevoked && (
                        <>Human owner revoked passkey mandate on contract</>
                      )}
                    </p>
                  </div>
                </div>

              {/* Tx Hash & Timestamp */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {item.txHash && (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      background: 'var(--bg-input)',
                      padding: '0.35rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)' }}>
                      {item.txHash.slice(0, 10)}...{item.txHash.slice(-8)}
                    </span>
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                      onClick={() => copyHash(item.id, item.txHash!)}
                      title="Copy Tx Hash"
                    >
                      {isCopied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                    </button>
                  </div>
                )}

                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '70px', textAlign: 'right' }}>
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
