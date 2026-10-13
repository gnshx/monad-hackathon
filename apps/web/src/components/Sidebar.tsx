'use client';

import React, { useEffect, useState } from 'react';
import {
  Home,
  LayoutDashboard,
  Route,
  FileText,
  Shield,
  SearchCode,
  ShieldCheck,
  BookOpen,
  Fingerprint,
  Gavel,
  ScanSearch,
  Menu,
  X,
  ChevronDown,
  Play,
  Activity,
} from 'lucide-react';

export type NavTab =
  | 'home'
  | 'passkey'
  | 'judge'
  | 'verify'
  | 'overview'
  | 'policy-to-proof'
  | 'mandates'
  | 'copilot'
  | 'attack-lab'
  | 'inspector'
  | 'evidence'
  | 'activity'
  | 'docs';

export const NAV_TABS: NavTab[] = [
  'home', 'passkey', 'judge', 'verify', 'overview', 'policy-to-proof', 'mandates',
  'copilot', 'attack-lab', 'inspector', 'evidence', 'activity', 'docs',
];

export const LAB_TABS: NavTab[] = ['overview', 'policy-to-proof', 'mandates', 'copilot', 'attack-lab', 'inspector', 'evidence', 'activity'];

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

type Item = { id: NavTab; label: string; icon: React.ComponentType<any>; pill?: string | null; pillKind?: 'live' | 'brand' };

const PRODUCT: Item[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'passkey', label: 'Passkey Mandates', icon: Fingerprint, pill: 'Try it', pillKind: 'brand' },
  { id: 'judge', label: 'Judge Mode', icon: Gavel, pill: 'Live', pillKind: 'live' },
  { id: 'verify', label: 'Verify an Agent', icon: ScanSearch },
  { id: 'docs', label: 'Developers', icon: BookOpen },
];

export function Sidebar({ activeTab, onSelectTab, activeMandatesCount, blockedCount }: SidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Legacy v1 prototypes stay folded away unless the visitor opens them or lands on one (e.g. via /#attack-lab).
  const [labOpen, setLabOpen] = useState(false);
  useEffect(() => {
    if (LAB_TABS.includes(activeTab)) setLabOpen(true);
  }, [activeTab]);

  const lab: Item[] = [
    { id: 'overview', label: 'Policy Overview', icon: LayoutDashboard },
    { id: 'policy-to-proof', label: 'Policy-to-Proof', icon: Route },
    { id: 'mandates', label: 'Wallet Mandates', icon: FileText, pill: activeMandatesCount > 0 ? String(activeMandatesCount) : null },
    { id: 'attack-lab', label: 'Attack Lab', icon: Shield, pill: blockedCount > 0 ? String(blockedCount) : null },
    { id: 'inspector', label: 'Receipts', icon: SearchCode },
    { id: 'evidence', label: 'Evidence & Proofs', icon: ShieldCheck },
    { id: 'activity', label: 'Security Activity', icon: Activity },
  ];

  const go = (id: NavTab) => {
    onSelectTab(id);
    setIsMobileMenuOpen(false);
  };

  const renderItem = (item: Item) => {
    const Icon = item.icon;
    const isActive =
      activeTab === item.id ||
      (item.id === 'mandates' && activeTab === 'copilot');
    return (
      <button
        key={item.id}
        className={`nav-item ${isActive ? 'active' : ''}`}
        onClick={() => go(item.id)}
        aria-current={isActive ? 'page' : undefined}
      >
        <span className="nav-left">
          <Icon size={17} className="nav-icon" style={{ flexShrink: 0 }} />
          <span>{item.label}</span>
        </span>
        {item.pill && <span className={`nav-pill ${item.pillKind || ''}`}>{item.pill}</span>}
      </button>
    );
  };

  return (
    <aside className="sidebar" aria-label="AgentTrust navigation">
      <div className="sidebar-brand-wrapper">
        <button className="brand" onClick={() => go('home')} aria-label="AgentTrust home">
          <span className="brand-mark">
            <Shield size={19} strokeWidth={2.4} fill="currentColor" fillOpacity={0.18} />
          </span>
          <span>
            <span className="brand-name">AgentTrust</span>
            <span className="brand-sub">Passkey mandates on Monad</span>
          </span>
        </button>

        <button
          type="button"
          className="sidebar-mobile-toggle"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <div className={`sidebar-nav-container ${isMobileMenuOpen ? 'open' : ''}`}>
        <nav className="nav-scroll">
          <div className="nav-group-label">Product</div>
          {PRODUCT.map(renderItem)}

          <button
            className="nav-group-label"
            onClick={() => setLabOpen((v) => !v)}
            aria-expanded={labOpen}
            title="Older v1 wallet-mandate prototypes, kept for reference. Some views are simulated."
          >
            <span>Legacy v1 prototypes (Lab)</span>
            <ChevronDown size={13} style={{ transform: labOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
          </button>
          {labOpen && lab.map(renderItem)}
        </nav>

        {activeTab !== 'judge' && (
          <div className="sidebar-cta">
            <div className="sidebar-cta-title">Judging AgentTrust?</div>
            <div className="sidebar-cta-text">Six live Monad transactions, one click. No wallet, no MON.</div>
            <button className="btn-primary" onClick={() => go('judge')}>
              <Play size={13} fill="currentColor" /> Run Judge Mode
            </button>
          </div>
        )}

        <div className="sidebar-footer">
          <span className="net-dot" />
          <span>Monad Testnet · chain 10143</span>
        </div>
      </div>
    </aside>
  );
}
