'use client';

import React, { useState } from 'react';
import {
  FileKey2,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Coins,
  Ban,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { formatEther } from 'viem';
import type { MandateItem } from './MandateCard';

interface MandateListProps {
  mandates: MandateItem[];
  onRevoke: (id: bigint) => void;
  onOpenCreate: () => void;
  isRevokingId: bigint | null;
}

export function MandateList({
  mandates,
  onRevoke,
  onOpenCreate,
  isRevokingId,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header and Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-monad">On-Chain Ledger</span>
            <span className="badge badge-emerald">Isolated Vaults</span>
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
            Mandate Policies & Ledger
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Hardware Passkey-authorized mandates governing AI agent execution boundaries on Monad.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: 'var(--bg-input)', padding: '0.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', gap: '0.25rem' }}>
            {(['all', 'active', 'revoked'] as const).map((t) => (
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

          <button className="btn-primary" onClick={onOpenCreate}>
            <Plus size={16} />
            Create Mandate
          </button>
        </div>
      </div>

      {/* Mandate Ledger Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
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
                borderLeft: `4px solid ${
                  mandate.revoked ? 'var(--accent-rose)' : 'var(--accent-emerald)'
                }`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1rem',
              }}
            >
              <div>
                {/* Card Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                        Mandate #{mandate.id.toString()}
                      </span>
                      <span className={`badge ${mandate.revoked ? 'badge-rose' : 'badge-emerald'}`}>
                        {mandate.revoked ? 'Revoked' : 'Active'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Owner: {mandate.owner.slice(0, 6)}...{mandate.owner.slice(-4)}
                    </div>
                  </div>

                  {!mandate.revoked && (
                    <button
                      className="btn-danger"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.72rem' }}
                      onClick={() => onRevoke(mandate.id)}
                      disabled={isRevoking}
                    >
                      <Ban size={12} />
                      {isRevoking ? 'Revoking...' : 'Revoke'}
                    </button>
                  )}
                </div>

                {/* Bound Agent Info */}
                <div style={{ background: 'var(--bg-input)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', marginBottom: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      BOUND AGENT IDENTITY
                    </span>
                    <span className="badge badge-monad" style={{ fontSize: '0.65rem' }}>
                      Agent ID #{mandate.agentId.toString()}
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
                        {copiedId === mandate.id.toString() ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Budget Meter */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cumulative Spending</span>
                    <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fff' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div style={{ background: 'var(--bg-input)', padding: '0.5rem 0.65rem', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>ISOLATED VAULT</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>
                      {formatEther(mandate.balance || 0n)} MON
                    </span>
                  </div>
                  <div style={{ background: 'var(--bg-input)', padding: '0.5rem 0.65rem', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>PER-TX LIMIT</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                      {formatEther(mandate.maxValuePerTx)} MON
                    </span>
                  </div>
                </div>

                {/* Allowed Targets Table */}
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>
                    ALLOWED TARGETS & SELECTORS ({mandate.targets.length})
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {mandate.targets.map((t, i) => (
                      <div
                        key={i}
                        style={{
                          background: 'var(--bg-input)',
                          padding: '0.35rem 0.65rem',
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
                        <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>
                          {t.selector === '0x00000000' ? 'Wildcard' : t.selector}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Clock size={12} />
                  {mandate.expiresAt === 0n ? 'Permanent' : 'Expires in policy window'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>Nonce #{mandate.nonce.toString()}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
