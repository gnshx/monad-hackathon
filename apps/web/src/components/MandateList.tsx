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
  isRevokingId: bigint | null;
  networkMode?: 'LOCAL_SIMULATION' | 'MONAD_TESTNET';
}

export function MandateList({
  mandates,
  onRevoke,
  onOpenCreate,
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
                <Radio size={10} color="#f59e0b" />
                LOCAL SIMULATION DATA
              </span>
            ) : (
              <span className="badge badge-emerald">
                MONAD TESTNET (10143)
              </span>
            )}
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
            Mandate Policies & Ledger
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            Passkey-authorized policies governing AI agent execution boundaries and isolated vaults on Monad.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Segmented Filter Control */}
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
            {(['all', 'active', 'revoked'] as const).map((t) => (
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

          <button className="btn-primary" onClick={onOpenCreate} id="btn-mandatelist-create">
            <Plus size={15} />
            Create mandate
          </button>
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <FileKey2 size={32} color="var(--text-muted)" />
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
          <button
            className="btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={onOpenCreate}
          >
            <Plus size={14} />
            Create mandate
          </button>
        </div>
      )}

      {/* Mandate Ledger Grid */}
      {filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
          {filtered.map((mandate) => {
            const spentRatio =
              mandate.maxTotalValue > 0n
                ? Number((mandate.spentValue * 100n) / mandate.maxTotalValue)
                : 0;

            const isRevoking = isRevokingId === mandate.id;

            return (
              <div
                key={mandate.id.toString()}
                className="security-card-elevated"
                style={{
                  borderLeft: `3px solid ${
                    mandate.revoked ? 'var(--accent-rose)' : 'var(--accent-emerald)'
                  }`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.85rem',
                }}
              >
                <div>
                  {/* Card Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono)' }}>
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
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Owner: {mandate.owner.slice(0, 6)}...{mandate.owner.slice(-4)}
                      </div>
                    </div>

                    {!mandate.revoked && (
                      <button
                        className="btn-danger"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem' }}
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
                      background: 'var(--bg-input)',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        BOUND AGENT
                      </span>
                      <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                        ID #{mandate.agentId.toString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#fff' }}>
                        {mandate.agentAddress
                          ? `${mandate.agentAddress.slice(0, 10)}...${mandate.agentAddress.slice(-8)}`
                          : 'Any Authorized Agent'}
                      </span>
                      {mandate.agentAddress && (
                        <button
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                          onClick={() => copyAddress(mandate.id.toString(), mandate.agentAddress!)}
                          title="Copy Address"
                        >
                          {copiedId === mandate.id.toString() ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Budget Progress Meter */}
                  <div style={{ marginBottom: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Cumulative Spending</span>
                      <span style={{ fontSize: '0.785rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#fff' }}>
                        {formatEther(mandate.spentValue)} / {formatEther(mandate.maxTotalValue)} MON
                      </span>
                    </div>
                    <div className="budget-meter">
                      <div
                        className="budget-meter-fill"
                        style={{
                          width: `${Math.min(100, spentRatio)}%`,
                          background:
                            spentRatio > 80
                              ? 'var(--accent-rose)'
                              : spentRatio > 50
                              ? 'var(--accent-amber)'
                              : 'var(--accent-emerald)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Vault & Per-Tx Caps Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginBottom: '0.85rem' }}>
                    <div style={{ background: 'var(--bg-input)', padding: '0.45rem 0.6rem', borderRadius: 'var(--radius-sm)' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>ISOLATED VAULT</span>
                      <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>
                        {formatEther(mandate.balance || 0n)} MON
                      </span>
                    </div>
                    <div style={{ background: 'var(--bg-input)', padding: '0.45rem 0.6rem', borderRadius: 'var(--radius-sm)' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>PER-TX LIMIT</span>
                      <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                        {formatEther(mandate.maxValuePerTx)} MON
                      </span>
                    </div>
                  </div>

                  {/* Allowed Targets & Selectors */}
                  <div>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                      ALLOWLISTED TARGETS ({mandate.targets.length})
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {mandate.targets.map((t, i) => (
                        <div
                          key={i}
                          style={{
                            background: 'var(--bg-input)',
                            padding: '0.3rem 0.55rem',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.72rem',
                          }}
                        >
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {t.target.slice(0, 8)}...{t.target.slice(-6)}
                          </span>
                          <span className={`badge ${t.selector === '0x00000000' ? 'badge-amber' : 'badge-neutral'}`} style={{ fontSize: '0.65rem' }}>
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
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: '0.65rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.7rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Clock size={11} />
                    {mandate.expiresAt === 0n ? 'Permanent' : 'Expires on policy schedule'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>Nonce #{mandate.nonce.toString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
