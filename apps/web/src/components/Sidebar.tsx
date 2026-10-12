'use client';

import React from 'react';
import {
  ShieldCheck,
  LayoutDashboard,
  FileKey2,
  Sparkles,
  FlaskConical,
  SearchCode,
  Activity,
  Layers,
  ExternalLink,
  Wallet,
  CheckCircle2,
} from 'lucide-react';

export type NavTab = 'overview' | 'mandates' | 'copilot' | 'attack-lab' | 'inspector' | 'activity';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  activeMandatesCount: number;
  blockedCount: number;
  walletAddress: string | null;
  onConnectWallet: () => void;
  onOpenCreateModal: () => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  activeMandatesCount,
  blockedCount,
  walletAddress,
  onConnectWallet,
  onOpenCreateModal,
}: SidebarProps) {
  const navItems = [
    {
      id: 'overview' as NavTab,
      label: 'Security Console',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'mandates' as NavTab,
      label: 'Mandates & Ledger',
      icon: FileKey2,
      badge: activeMandatesCount.toString(),
    },
    {
      id: 'copilot' as NavTab,
      label: 'AI Policy Copilot',
      icon: Sparkles,
      badge: 'AI',
      badgeColor: 'monad',
    },
    {
      id: 'attack-lab' as NavTab,
      label: 'Attack Simulation Lab',
      icon: FlaskConical,
      badge: `${blockedCount} blocked`,
      badgeColor: 'rose',
    },
    {
      id: 'inspector' as NavTab,
      label: 'Trust & Receipt Explorer',
      icon: SearchCode,
      badge: 'SDK',
      badgeColor: 'emerald',
    },
    {
      id: 'activity' as NavTab,
      label: 'Security Activity',
      icon: Activity,
      badge: null,
    },
  ];

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #836ef9, #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(131, 110, 249, 0.35)',
            }}
          >
            <ShieldCheck size={22} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#fff' }}>
                AgentTrust
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  background: 'rgba(131, 110, 249, 0.18)',
                  color: '#c4b5fd',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  border: '1px solid rgba(131, 110, 249, 0.3)',
                }}
              >
                v2.0
              </span>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Passkey Mandates for AI Agents
            </p>
          </div>
        </div>

        {/* Network Indicator */}
        <div
          style={{
            marginTop: '1rem',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.4rem 0.65rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="status-dot emerald" />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Monad Testnet
            </span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            10143
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <nav style={{ padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', padding: '0 0.5rem 0.35rem' }}>
          Console Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <div
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <Icon size={18} className="nav-icon" />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-full)',
                    background:
                      item.badgeColor === 'rose'
                        ? 'var(--accent-rose-subtle)'
                        : item.badgeColor === 'emerald'
                        ? 'var(--accent-emerald-subtle)'
                        : item.badgeColor === 'monad'
                        ? 'var(--accent-monad-subtle)'
                        : 'rgba(255, 255, 255, 0.06)',
                    color:
                      item.badgeColor === 'rose'
                        ? 'var(--accent-rose)'
                        : item.badgeColor === 'emerald'
                        ? 'var(--accent-emerald)'
                        : item.badgeColor === 'monad'
                        ? '#c4b5fd'
                        : 'var(--text-secondary)',
                    border: `1px solid ${
                      item.badgeColor === 'rose'
                        ? 'var(--accent-rose-border)'
                        : item.badgeColor === 'emerald'
                        ? 'var(--accent-emerald-border)'
                        : item.badgeColor === 'monad'
                        ? 'var(--accent-monad-border)'
                        : 'var(--border-subtle)'
                    }`,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      {/* Quick Action & Wallet Footer */}
      <div style={{ padding: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <button
          className="btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={onOpenCreateModal}
        >
          <ShieldCheck size={16} />
          Create Passkey Mandate
        </button>

        {/* Wallet Widget */}
        <div
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '0.65rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
          onClick={onConnectWallet}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <Wallet size={16} color="var(--accent-monad)" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff' }}>
                {walletAddress ? 'Connected EOA' : 'Connect Wallet'}
              </div>
              {walletAddress && (
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </div>
              )}
            </div>
          </div>
          <CheckCircle2 size={14} color="var(--accent-emerald)" />
        </div>
      </div>
    </aside>
  );
}
