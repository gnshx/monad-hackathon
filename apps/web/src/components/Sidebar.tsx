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
  Wallet,
  CheckCircle2,
  Plus,
  Radio,
  AlertTriangle,
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
  networkMode?: 'LOCAL_SIMULATION' | 'MONAD_TESTNET';
  onToggleNetworkMode?: (mode: 'LOCAL_SIMULATION' | 'MONAD_TESTNET') => void;
  chainId?: number | null;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  activeMandatesCount,
  blockedCount,
  walletAddress,
  onConnectWallet,
  onOpenCreateModal,
  networkMode = 'MONAD_TESTNET',
  onToggleNetworkMode,
  chainId,
}: SidebarProps) {
  const isTestnet = networkMode === 'MONAD_TESTNET';

  const navItems = [
    {
      id: 'overview' as NavTab,
      label: 'Security Overview',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'mandates' as NavTab,
      label: 'Mandates & Ledger',
      icon: FileKey2,
      badge: activeMandatesCount.toString(),
      badgeColor: 'emerald',
    },
    {
      id: 'copilot' as NavTab,
      label: 'AI Policy Copilot',
      icon: Sparkles,
      badge: 'Composer',
      badgeColor: 'neutral',
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
      label: 'Receipt Explorer',
      icon: SearchCode,
      badge: 'SDK',
      badgeColor: 'neutral',
    },
    {
      id: 'activity' as NavTab,
      label: 'Security Activity',
      icon: Activity,
      badge: null,
    },
  ];

  return (
    <aside className="sidebar" aria-label="Security Console Navigation">
      {/* Persistent Mode Indicator - Top Bar */}
      <div
        style={{
          padding: '0.5rem 1.25rem',
          background: isTestnet ? 'rgba(131, 110, 249, 0.1)' : 'rgba(245, 158, 11, 0.1)',
          borderBottom: `1px solid ${isTestnet ? 'rgba(131, 110, 249, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        role="status"
        aria-live="polite"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`status-dot ${isTestnet ? 'emerald' : 'amber'}`} style={{ width: '7px', height: '7px' }} />
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: isTestnet ? '#c4b5fd' : '#fbbf24',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {isTestnet ? 'MONAD TESTNET (10143)' : 'LOCAL SIMULATION (31337)'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {isTestnet ? (
            <span
              style={{
                fontSize: '0.65rem',
                color: 'var(--accent-emerald)',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
              }}
            >
              Chain 10143
            </span>
          ) : (
            <span
              style={{
                fontSize: '0.65rem',
                color: 'var(--accent-amber)',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <AlertTriangle size={11} />
              Offline Sandbox
            </span>
          )}
        </div>
      </div>

      {/* Brand Header */}
      <div style={{ padding: '1.25rem 1.25rem 1rem', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              background: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#042f1a',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={20} strokeWidth={2.2} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.02em', color: '#fff' }}>
                AgentTrust
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-default)',
                  padding: '1px 4px',
                  borderRadius: 'var(--radius-xs)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                v2.0
              </span>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Scoped Mandate Security Console
            </p>
          </div>
        </div>

        {/* Network Engine & Simulation Switcher */}
        <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            <span>Network Engine</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{isTestnet ? 'Chain 10143' : 'Chain 31337'}</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '4px',
              background: 'var(--bg-input)',
              padding: '3px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <button
              onClick={() => onToggleNetworkMode && onToggleNetworkMode('LOCAL_SIMULATION')}
              style={{
                padding: '0.35rem 0.2rem',
                fontSize: '0.68rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                cursor: 'pointer',
                background: !isTestnet ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                color: !isTestnet ? '#fbbf24' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
            >
              <Radio size={11} color={!isTestnet ? '#fbbf24' : 'currentColor'} />
              Simulation
            </button>
            <button
              onClick={() => onToggleNetworkMode && onToggleNetworkMode('MONAD_TESTNET')}
              style={{
                padding: '0.35rem 0.2rem',
                fontSize: '0.68rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                cursor: 'pointer',
                background: isTestnet ? 'var(--accent-monad)' : 'transparent',
                color: isTestnet ? '#fff' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
            >
              <span className={`status-dot ${isTestnet ? 'emerald' : 'slate'}`} style={{ width: '6px', height: '6px' }} />
              Testnet
            </button>
          </div>

          {!isTestnet && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.2rem 0.45rem',
                marginTop: '2px',
              }}
            >
              <Radio size={11} color="#f59e0b" />
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: '#f59e0b',
                  letterSpacing: '0.04em',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                LOCAL SIMULATION ACTIVE
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <nav
        style={{
          padding: '0.85rem 0.65rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          flex: 1,
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            fontSize: '0.68rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            padding: '0.25rem 0.5rem 0.35rem',
          }}
        >
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
              style={{ width: '100%', textAlign: 'left', background: isActive ? 'var(--bg-surface-elevated)' : 'transparent' }}
            >
              <Icon size={16} className="nav-icon" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span
                  className={`badge ${
                    item.badgeColor === 'rose'
                      ? 'badge-rose'
                      : item.badgeColor === 'emerald'
                      ? 'badge-emerald'
                      : 'badge-neutral'
                  }`}
                  style={{ fontSize: '0.65rem', padding: '1px 5px' }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Primary Action and Wallet Footer */}
      <div
        style={{
          padding: '1rem',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
        }}
      >
        {/* Required label: "Create mandate" */}
        <button
          className="btn-primary"
          style={{ width: '100%', padding: '0.6rem 0.85rem' }}
          onClick={onOpenCreateModal}
          id="btn-sidebar-create-mandate"
        >
          <Plus size={15} strokeWidth={2.5} />
          Create mandate
        </button>

        {/* Connected Wallet Control */}
        <div
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '0.55rem 0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
          onClick={onConnectWallet}
          title={walletAddress ? 'Click to disconnect' : 'Click to connect wallet'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <Wallet size={15} color={walletAddress ? 'var(--accent-emerald)' : 'var(--text-muted)'} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: walletAddress ? '#fff' : 'var(--text-secondary)' }}>
                {walletAddress ? (isTestnet ? 'Injected Wallet' : 'Simulated Wallet') : 'Connect Wallet'}
              </div>
              {walletAddress ? (
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </div>
              ) : (
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  Read-only view
                </div>
              )}
            </div>
          </div>
          <span
            className={`status-dot ${walletAddress ? 'emerald' : 'slate'}`}
            style={{ width: '6px', height: '6px' }}
          />
        </div>
      </div>
    </aside>
  );
}
