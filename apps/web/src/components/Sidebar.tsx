'use client';

import React, { useState } from 'react';
import {
  LayoutDashboard,
  Route,
  FileText,
  Shield,
  SearchCode,
  ShieldCheck,
  BookOpen,
  Menu,
  X,
} from 'lucide-react';

export type NavTab =
  | 'overview'
  | 'policy-to-proof'
  | 'mandates'
  | 'copilot'
  | 'attack-lab'
  | 'inspector'
  | 'evidence'
  | 'activity'
  | 'docs';

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
}: SidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    {
      id: 'overview' as NavTab,
      label: 'Overview',
      icon: LayoutDashboard,
    },
    {
      id: 'policy-to-proof' as NavTab,
      label: 'Policy-to-Proof',
      icon: Route,
      badge: 'Interactive',
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
      id: 'evidence' as NavTab,
      label: 'Evidence & Proofs',
      icon: ShieldCheck,
      badge: 'Live',
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
      <div className="sidebar-brand-wrapper">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            cursor: 'pointer',
          }}
          onClick={() => {
            onSelectTab('overview');
            setIsMobileMenuOpen(false);
          }}
        >
          {/* Exact Shield Brand Logo with Monad Violet Identity */}
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#5944DB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              boxShadow: '0 2px 4px rgba(89, 68, 219, 0.25)',
              flexShrink: 0,
            }}
          >
            <Shield size={20} strokeWidth={2.5} fill="currentColor" fillOpacity={0.15} />
          </div>
          <span
            style={{
              fontWeight: 800,
              fontSize: '1.25rem',
              color: 'var(--text-primary)',
              letterSpacing: '-0.025em',
            }}
          >
            AgentTrust
          </span>
        </div>

        {/* Mobile menu toggle button */}
        <button
          type="button"
          className="sidebar-mobile-toggle"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          aria-label={isMobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Nav items & footer container */}
      <div className={`sidebar-nav-container ${isMobileMenuOpen ? 'open' : ''}`}>
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
                onClick={() => {
                  onSelectTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
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

        {/* Bottom Footer: Monad Identity & Brand Tagline */}
        <div
          className="sidebar-footer"
          style={{
            padding: '1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                flexShrink: 0,
                marginTop: '1px',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '2px',
                  border: '2px solid #FFFFFF',
                  transform: 'rotate(45deg)',
                }}
              />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
              Built for a safer<br />
              AI agent economy.
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
