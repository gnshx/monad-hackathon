'use client';

import React from 'react';
import {
  LayoutDashboard,
  FileText,
  Shield,
  SearchCode,
  BookOpen,
  Sparkles,
  Activity,
  Plus,
  Radio,
  ExternalLink,
} from 'lucide-react';

export type NavTab = 'overview' | 'mandates' | 'copilot' | 'attack-lab' | 'inspector' | 'activity' | 'docs';

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
      label: 'Overview',
      icon: LayoutDashboard,
    },
    {
      id: 'mandates' as NavTab,
      label: 'Mandates',
      icon: FileText,
      badge: activeMandatesCount > 0 ? activeMandatesCount.toString() : null,
    },
    {
      id: 'attack-lab' as NavTab,
      label: 'Attack Lab',
      icon: Shield,
      badge: blockedCount > 0 ? `${blockedCount}` : null,
    },
    {
      id: 'inspector' as NavTab,
      label: 'Receipts',
      icon: SearchCode,
    },
    {
      id: 'docs' as NavTab,
      label: 'Docs',
      icon: BookOpen,
    },
  ];

  return (
    <aside className="sidebar" aria-label="Security Console Navigation">
      {/* Brand Header */}
      <div style={{ padding: '1.5rem 1.25rem 1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            cursor: 'pointer',
          }}
          onClick={() => onSelectTab('overview')}
        >
          {/* Exact Shield Brand Logo */}
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 4px rgba(79, 70, 229, 0.25)',
              flexShrink: 0,
            }}
          >
            <Shield size={20} strokeWidth={2.5} fill="currentColor" fillOpacity={0.15} />
          </div>
          <span
            style={{
              fontWeight: 800,
              fontSize: '1.25rem',
              color: '#111827',
              letterSpacing: '-0.025em',
            }}
          >
            AgentTrust
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav
        style={{
          padding: '0.5rem 0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
          flex: 1,
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeTab === item.id ||
            (item.id === 'mandates' && activeTab === 'copilot') ||
            (item.id === 'inspector' && activeTab === 'activity');

          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Icon size={18} className="nav-icon" style={{ flexShrink: 0 }} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className="badge badge-monad"
                  style={{
                    fontSize: '0.68rem',
                    padding: '1px 6px',
                    borderRadius: '9999px',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Footer: Monad Badge & Brand Note */}
      <div
        style={{
          padding: '1.25rem',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* Monad Economy Tagline */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
          {/* Monad Icon Mark */}
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              flexShrink: 0,
              marginTop: '1px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '2px',
                border: '2px solid #ffffff',
                transform: 'rotate(45deg)',
              }}
            />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.35 }}>
            Built for a safer<br />
            AI agent economy.
          </div>
        </div>
      </div>
    </aside>
  );
}
