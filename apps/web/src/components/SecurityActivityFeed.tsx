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
                <Radio size={10} color="#b45309" />
                LOCAL SIMULATION EVENTS
              </span>
            ) : (
              <span className="badge badge-emerald">
                MONAD TESTNET (10143)
              </span>
            )}
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
            Security Activity Feed
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Chronological audit of passkey authorizations, executed transactions, blocked contract reverts, and revocations.
          </p>
        </div>

        {/* Filter Buttons */}
        <div
          style={{
            background: '#f1f5f9',
            padding: '0.25rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #e2e8f0',
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
                background: filter === t ? '#ffffff' : 'transparent',
                color: filter === t ? '#111827' : '#64748b',
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
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f3f4f6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.85rem', color: '#9ca3af' }}>
            <Activity size={24} />
          </div>
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
                      ? '#059669'
                      : isBlocked
                      ? '#dc2626'
                      : '#d97706'
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
                        ? '#ecfdf5'
                        : isBlocked
                        ? '#fef2f2'
                        : '#fffbeb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    {isExecuted && <CheckCircle2 size={18} color="#059669" />}
                    {isBlocked && <XCircle size={18} color="#dc2626" />}
                    {isRevoked && <Ban size={18} color="#d97706" />}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#111827', fontWeight: 700 }}>
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
                        {isExecuted ? 'Allowed' : isBlocked ? 'Contract Blocked' : 'Revoked'}
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

                    <p style={{ fontSize: '0.8rem', color: '#4b5563', marginTop: '0.25rem' }}>
                      {isExecuted && item.value && (
                        <>Executed {formatEther(item.value)} MON transfer to allowlisted target {item.target?.slice(0, 8)}...</>
                      )}
                      {isBlocked && (
                        <span style={{ color: '#dc2626', fontWeight: 500 }}>{item.reason || 'Smart contract halted policy violation'}</span>
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
                        fontSize: '0.75rem',
                        background: '#f8fafc',
                        padding: '0.25rem 0.6rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <span style={{ color: '#64748b' }}>
                        {item.txHash.slice(0, 8)}...{item.txHash.slice(-6)}
                      </span>
                      <button
                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                        onClick={() => copyHash(item.id, item.txHash!)}
                        title="Copy Tx Hash"
                        aria-label="Copy transaction hash"
                      >
                        {isCopied ? <Check size={13} color="#059669" /> : <Copy size={13} />}
                      </button>
                    </div>
                  )}

                  <span style={{ fontSize: '0.75rem', color: '#64748b', minWidth: '65px', textAlign: 'right' }}>
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
