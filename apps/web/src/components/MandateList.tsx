'use client';

import React, { useState } from 'react';
import {
  FileKey2,
  ShieldCheck,
  Clock,
  Ban,
  Copy,
  Check,
  Plus,
  Radio,
  AlertTriangle,
} from 'lucide-react';
import { formatEther } from 'viem';
import type { MandateItem } from './MandateCard';

interface MandateListProps {
  mandates: MandateItem[];
  onRevoke: (id: bigint) => void;
  onOpenCreate: () => void;
  onExploreDemo?: () => void;
  isRevokingId: bigint | null;
  networkMode?: 'LOCAL_SIMULATION' | 'MONAD_TESTNET';
}

export function MandateList({
  mandates,
  onRevoke,
  onOpenCreate,
  onExploreDemo,
  isRevokingId,
  networkMode = 'MONAD_TESTNET',
}: MandateListProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'revoked'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = mandates.filter((m) => {
    if (filter === 'active') return !m.revoked;
    if (filter === 'revoked') return m.revoked;
    return true;
  });

  const copyAddress = (idStr: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(idStr);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header and Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-neutral">On-Chain Ledger</span>
            {networkMode === 'LOCAL_SIMULATION' ? (
              <span className="badge badge-simulation">
                <Radio size={10} color="#b45309" />
                LOCAL SIMULATION DATA
              </span>
            ) : (
              <span className="badge badge-emerald">
                MONAD TESTNET (10143)
              </span>
            )}
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
            Mandate Policies & Ledger
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Passkey-authorized policies governing AI agent execution boundaries and isolated vaults on Monad.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Segmented Filter Control */}
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
            {(['all', 'active', 'revoked'] as const).map((t) => (
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

          <button className="btn-primary" onClick={onOpenCreate} id="btn-mandatelist-create">
            <Plus size={15} />
            Create mandate
          </button>
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              background: '#f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              marginBottom: '0.75rem',
            }}
          >
            <FileKey2 size={26} />
          </div>
          <div className="empty-state-title">No Mandates Found</div>
          <p className="empty-state-desc">
            {networkMode === 'MONAD_TESTNET'
              ? 'No on-chain mandates found for this wallet on Monad Testnet.'
              : filter === 'active'
              ? 'No active mandates currently in effect in local simulation.'
              : filter === 'revoked'
              ? 'No revoked mandates in the simulation history.'
              : 'No mandates configured. Click "Create mandate" to establish passkey-enforced limits.'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="btn-primary"
              onClick={onOpenCreate}
            >
              <Plus size={15} />
              Create mandate
            </button>
            {onExploreDemo && (
              <button
                className="btn-secondary"
                onClick={onExploreDemo}
              >
                Explore sample mandate
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mandate Ledger Grid */}
      {filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {filtered.map((mandate) => {
            const spentRatio =
              mandate.maxTotalValue > 0n
                ? Number((mandate.spentValue * 100n) / mandate.maxTotalValue)
                : 0;

            const isRevoking = isRevokingId === mandate.id;

            return (
              <div
                key={mandate.id.toString()}
                className="security-card"
                style={{
                  borderLeft: `4px solid ${
                    mandate.revoked ? '#dc2626' : '#059669'
                  }`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '1.5rem',
                }}
              >
                <div>
                  {/* Card Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', fontFamily: 'var(--font-mono)' }}>
                          Mandate #{mandate.id.toString()}
                        </span>
                        <span className={`badge ${mandate.revoked ? 'badge-rose' : 'badge-emerald'}`}>
                          {mandate.revoked ? 'Revoked' : 'Active'}
                        </span>
                        {networkMode === 'LOCAL_SIMULATION' && (
                          <span className="badge badge-simulation" style={{ fontSize: '0.65rem' }}>
                            Simulated
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                        Owner: {mandate.owner.slice(0, 6)}...{mandate.owner.slice(-4)}
                      </div>
                    </div>

                    {!mandate.revoked && (
                      <button
                        className="btn-danger"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                        onClick={() => onRevoke(mandate.id)}
                        disabled={isRevoking}
                        title="Revoke passkey authority on-chain"
                      >
                        <Ban size={12} />
                        {isRevoking ? 'Revoking...' : 'Revoke'}
                      </button>
                    )}
                  </div>

                  {/* Bound Agent Identity */}
                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid #e2e8f0',
                      marginBottom: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                        BOUND AGENT
                      </span>
                      <span className="badge badge-monad" style={{ fontSize: '0.68rem' }}>
                        Agent #{mandate.agentId.toString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.785rem', fontWeight: 600, color: '#1e293b' }}>
                        {mandate.agentAddress
                          ? `${mandate.agentAddress.slice(0, 10)}...${mandate.agentAddress.slice(-8)}`
                          : 'Any Authorized Agent'}
                      </span>
                      {mandate.agentAddress && (
                        <button
                          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px' }}
                          onClick={() => copyAddress(mandate.id.toString(), mandate.agentAddress!)}
                          title="Copy Address"
                        >
                          {copiedId === mandate.id.toString() ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Budget Progress Meter */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Cumulative Spending</span>
                      <span style={{ fontSize: '0.825rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#111827' }}>
                        {formatEther(mandate.spentValue)} / {formatEther(mandate.maxTotalValue)} MON
                      </span>
                    </div>
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${Math.min(100, spentRatio)}%`,
                          background:
                            spentRatio > 80
                              ? '#dc2626'
                              : spentRatio > 50
                              ? '#d97706'
                              : '#4f46e5',
                        }}
                      />
                    </div>
                  </div>

                  {/* Vault & Per-Tx Caps Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ background: '#f8fafc', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', fontWeight: 600 }}>ISOLATED VAULT</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                        {formatEther(mandate.balance || 0n)} MON
                      </span>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', fontWeight: 600 }}>PER-TX LIMIT</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', fontFamily: 'var(--font-mono)' }}>
                        {formatEther(mandate.maxValuePerTx)} MON
                      </span>
                    </div>
                  </div>

                  {/* Allowed Targets & Selectors */}
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>
                      ALLOWLISTED TARGETS ({mandate.targets.length})
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {mandate.targets.map((t, i) => (
                        <div
                          key={i}
                          style={{
                            background: '#f8fafc',
                            padding: '0.35rem 0.65rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.75rem',
                          }}
                        >
                          <span style={{ color: '#334155', fontWeight: 500 }}>
                            {t.target.slice(0, 8)}...{t.target.slice(-6)}
                          </span>
                          <span className={`badge ${t.selector === '0x00000000' ? 'badge-amber' : 'badge-monad'}`} style={{ fontSize: '0.68rem' }}>
                            {t.selector === '0x00000000' ? 'Wildcard' : t.selector}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div
                  style={{
                    borderTop: '1px solid #e2e8f0',
                    paddingTop: '0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.725rem',
                    color: '#64748b',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Clock size={12} />
                    {mandate.expiresAt === 0n ? 'Permanent' : 'Expires on policy schedule'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>Nonce #{mandate.nonce.toString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
