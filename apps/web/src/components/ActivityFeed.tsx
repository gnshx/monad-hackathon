'use client';

import React from 'react';
import { Activity, ShieldCheck, ShieldAlert, ArrowUpRight, Zap, Ban } from 'lucide-react';
import { formatEther } from 'viem';

export interface ActivityItem {
  id: string;
  type: 'executed' | 'created' | 'revoked' | 'blocked';
  agentId: bigint;
  mandateId: bigint;
  target?: string;
  selector?: string;
  value?: bigint;
  timestamp: string;
  txHash: string;
  reason?: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className="glass-panel" style={{ padding: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
        <div style={{ background: 'rgba(131, 56, 236, 0.15)', padding: '0.4rem', borderRadius: '8px' }}>
          <Activity size={20} color="#a78bfa" />
        </div>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>On-Chain Mandate Event Receipts</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Real-time execution receipts and security enforcement logs from Monad
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {activities.map((act) => (
          <div
            key={act.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.9rem 1.1rem',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div>
                {act.type === 'executed' ? (
                  <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '0.4rem', borderRadius: '8px' }}>
                    <ShieldCheck size={18} color="#10b981" />
                  </div>
                ) : act.type === 'blocked' ? (
                  <div style={{ background: 'rgba(244, 63, 94, 0.15)', padding: '0.4rem', borderRadius: '8px' }}>
                    <Ban size={18} color="#f43f5e" />
                  </div>
                ) : act.type === 'revoked' ? (
                  <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '0.4rem', borderRadius: '8px' }}>
                    <ShieldAlert size={18} color="#f59e0b" />
                  </div>
                ) : (
                  <div style={{ background: 'rgba(131, 56, 236, 0.15)', padding: '0.4rem', borderRadius: '8px' }}>
                    <Zap size={18} color="#a78bfa" />
                  </div>
                )}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontWeight: 600 }}>
                    {act.type === 'executed'
                      ? 'Action Executed within Mandate'
                      : act.type === 'blocked'
                      ? 'Action Blocked by On-Chain Policy'
                      : act.type === 'revoked'
                      ? 'Mandate Revoked by Owner'
                      : 'New Mandate Authorized'}
                  </span>
                  <span className="badge badge-monad" style={{ fontSize: '0.65rem' }}>
                    Agent #{act.agentId.toString()}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>#{act.mandateId.toString()}</span>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem' }}>
                  {act.target && (
                    <span>
                      Target: <span className="hash-pill">{act.target.slice(0, 6)}...{act.target.slice(-4)}</span>
                    </span>
                  )}
                  {act.value !== undefined && (
                    <span>
                      Value: <strong style={{ color: '#e2e8f0' }}>{formatEther(act.value)} MON</strong>
                    </span>
                  )}
                  {act.reason && <span style={{ color: '#fda4af' }}>{act.reason}</span>}
                  <span>{act.timestamp}</span>
                </div>
              </div>
            </div>

            <a
              href={`https://testnet.monadexplorer.com/tx/${act.txHash}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
                color: 'var(--accent-cyan)',
                textDecoration: 'none',
                fontSize: '0.75rem',
              }}
            >
              <span className="hash-pill">{act.txHash.slice(0, 8)}...</span>
              <ArrowUpRight size={14} />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
