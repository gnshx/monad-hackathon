'use client';

import React, { useState } from 'react';
import { Sidebar, type NavTab } from '../components/Sidebar';
import { MandateList } from '../components/MandateList';
import { AiPolicyCopilot } from '../components/AiPolicyCopilot';
import { AttackLab, type AttackScenario } from '../components/AttackLab';
import { ReceiptInspector } from '../components/ReceiptInspector';
import { SecurityActivityFeed } from '../components/SecurityActivityFeed';
import { CreateMandateModal } from '../components/CreateMandateModal';
import type { MandateItem } from '../components/MandateCard';
import type { ActivityItem } from '../components/ActivityFeed';
import { registerPasskey, signMandateWithPasskey } from '../lib/webauthn';
import { parseEther, formatEther, type Address, type Hex } from 'viem';
import { computeMandateHash, type CreateMandateParams } from '@agenttrust/sdk';
import { DEFAULT_MANDATE_MANAGER_ADDRESS } from '../lib/contracts';
import {
  ShieldCheck,
  Plus,
  Sparkles,
  FlaskConical,
  SearchCode,
  FileKey2,
  Activity,
  Layers,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Lock,
  Wallet,
} from 'lucide-react';

export default function SecurityConsoleDashboard() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [walletAddress, setWalletAddress] = useState<string | null>(
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
  );
  const [passkeyRegistered, setPasskeyRegistered] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [revokingId, setRevokingId] = useState<bigint | null>(null);
  const [copilotDraft, setCopilotDraft] = useState<Partial<CreateMandateParams> | null>(null);

  // Active Mandates State
  const [mandates, setMandates] = useState<MandateItem[]>([
    {
      id: 1n,
      owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      agentAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      agentId: 42n,
      maxValuePerTx: parseEther('0.25'),
      maxTotalValue: parseEther('2.5'),
      spentValue: parseEther('0.625'),
      balance: parseEther('1.875'),
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 5),
      nonce: 0n,
      revoked: false,
      targets: [
        { target: '0x3333333333333333333333333333333333333333', selector: '0xa9059cbb' },
        { target: '0x4444444444444444444444444444444444444444', selector: '0x00000000' },
      ],
    },
    {
      id: 2n,
      owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      agentAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      agentId: 108n,
      maxValuePerTx: parseEther('0.05'),
      maxTotalValue: parseEther('0.5'),
      spentValue: parseEther('0.5'),
      balance: 0n,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 1),
      nonce: 1n,
      revoked: false,
      targets: [
        { target: '0x5555555555555555555555555555555555555555', selector: '0x23b872dd' },
      ],
    },
    {
      id: 3n,
      owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      agentAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      agentId: 99n,
      maxValuePerTx: parseEther('1.0'),
      maxTotalValue: parseEther('5.0'),
      spentValue: parseEther('0.1'),
      balance: parseEther('0.9'),
      expiresAt: 0n,
      nonce: 2n,
      revoked: true,
      targets: [
        { target: '0x7777777777777777777777777777777777777777', selector: '0x095ea7b3' },
      ],
    },
  ]);

  // Security Activities Timeline State
  const [activities, setActivities] = useState<ActivityItem[]>([
    {
      id: 'tx-1',
      type: 'executed',
      agentId: 42n,
      mandateId: 1n,
      target: '0x3333333333333333333333333333333333333333',
      selector: '0xa9059cbb',
      value: parseEther('0.15'),
      timestamp: '2 mins ago',
      txHash: '0x414aaa1a791b3fbcf049fca29a188b23bef3914603fe8965ad0e5c32bcf95f06',
    },
    {
      id: 'tx-2',
      type: 'blocked',
      agentId: 42n,
      mandateId: 1n,
      target: '0xDeadDeAdDeADdeAdDeaddeadDEADdeAdDeadbEEf',
      selector: '0xa9059cbb',
      value: parseEther('0.1'),
      timestamp: '14 mins ago',
      txHash: '0x3b5c7d9e1a3f5c7b9e1a3d5f7c9b1e3a5d7f9a2b4c6e8d1a3f5c7b9e1a3d7f9a',
      reason: 'TargetNotAllowed (Contract blocked unauthorized target 0xDead...bEEf)',
    },
    {
      id: 'tx-3',
      type: 'blocked',
      agentId: 108n,
      mandateId: 2n,
      target: '0x5555555555555555555555555555555555555555',
      selector: '0x23b872dd',
      value: parseEther('0.1'),
      timestamp: '1 hour ago',
      txHash: '0x1a3d5f7c9b1e3a5d7f9a2b4c6e8d1a3f5c7b9e1a3d7f9a2b4c6e8d1a3f5c7b9e',
      reason: 'ExceedsTotalLimit (Cumulative budget fully depleted)',
    },
    {
      id: 'tx-4',
      type: 'revoked',
      agentId: 99n,
      mandateId: 3n,
      timestamp: '3 hours ago',
      txHash: '0x9e1a3d5f7c9b1e3a5d7f9a2b4c6e8d1a3f5c7b9e1a3d7f9a2b4c6e8d1a3f5c7b',
    },
  ]);

  const activeMandates = mandates.filter((m) => !m.revoked);
  const totalVaultSecured = mandates.reduce((acc, m) => acc + (m.balance || 0n), 0n);
  const blockedActionsCount = activities.filter((a) => a.type === 'blocked').length;

  const handleConnectWallet = () => {
    if (walletAddress) {
      setWalletAddress(null);
    } else {
      setWalletAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    }
  };

  const handleRevoke = async (id: bigint) => {
    setRevokingId(id);
    const targetMandate = mandates.find((m) => m.id === id);
    setTimeout(() => {
      setMandates(
        mandates.map((m) => (m.id === id ? { ...m, revoked: true } : m))
      );
      setActivities([
        {
          id: `tx-${Date.now()}`,
          type: 'revoked',
          agentId: targetMandate?.agentId ?? 42n,
          mandateId: id,
          timestamp: 'Just now',
          txHash: ('0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')),
        },
        ...activities,
      ]);
      setRevokingId(null);
    }, 500);
  };

  const handleCreateMandate = async (params: CreateMandateParams) => {
    setIsAuthorizing(true);
    try {
      const ownerAddress = (walletAddress || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') as Address;
      const nextNonce = BigInt(mandates.length);

      // 1. Canonical challenge hash bound to Monad chainId and mandate constraints
      const challengeHash = computeMandateHash({
        chainId: 10143,
        mandateManagerAddress: DEFAULT_MANDATE_MANAGER_ADDRESS,
        owner: ownerAddress,
        agentAddress: params.agentAddress,
        agentId: params.agentId,
        targets: params.targets,
        maxValuePerTx: params.maxValuePerTx,
        maxTotalValue: params.maxTotalValue,
        expiresAt: params.expiresAt,
        nonce: nextNonce,
      });

      // 2. Hardware passkey authorization
      const sigData = await signMandateWithPasskey(challengeHash);

      // 3. Update local state
      const newId = BigInt(mandates.length + 1);
      const newMandate: MandateItem = {
        id: newId,
        owner: ownerAddress,
        agentAddress: params.agentAddress,
        agentId: params.agentId,
        maxValuePerTx: params.maxValuePerTx,
        maxTotalValue: params.maxTotalValue,
        spentValue: 0n,
        balance: params.depositValue ?? 0n,
        expiresAt: params.expiresAt,
        nonce: nextNonce,
        revoked: false,
        targets: params.targets.map((t) => ({ target: t.target, selector: t.selector })),
      };

      setMandates([newMandate, ...mandates]);

      const newTx = ('0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''));
      setActivities([
        {
          id: `tx-${Date.now()}`,
          type: 'executed',
          agentId: params.agentId,
          mandateId: newId,
          target: params.targets[0].target,
          selector: params.targets[0].selector,
          value: params.depositValue ?? 0n,
          timestamp: 'Just now',
          txHash: newTx,
        },
        ...activities,
      ]);
    } finally {
      setIsAuthorizing(false);
      setIsModalOpen(false);
      setCopilotDraft(null);
    }
  };

  const handleCopilotDraftApproved = (draftParams: CreateMandateParams) => {
    setCopilotDraft(draftParams);
    setIsModalOpen(true);
  };

  const handleScenarioRun = (scenario: AttackScenario) => {
    if (scenario.expectedResult === 'Success') {
      const targetMandate = mandates.find((m) => !m.revoked) || mandates[0];
      const newSpent = targetMandate.spentValue + parseEther('0.1');
      setMandates(
        mandates.map((m) => (m.id === targetMandate.id ? { ...m, spentValue: newSpent } : m))
      );
      setActivities([
        {
          id: `tx-${Date.now()}`,
          type: 'executed',
          agentId: targetMandate.agentId,
          mandateId: targetMandate.id,
          target: scenario.target,
          selector: scenario.selector,
          value: parseEther(scenario.value),
          timestamp: 'Just now',
          txHash: scenario.resultData?.txHash || '0x414aaa1a791b3fbcf049fca29a188b23bef3914603fe8965ad0e5c32bcf95f06',
        },
        ...activities,
      ]);
    } else {
      setActivities([
        {
          id: `tx-${Date.now()}`,
          type: 'blocked',
          agentId: 42n,
          mandateId: 1n,
          target: scenario.target,
          selector: scenario.selector,
          value: parseEther(scenario.value),
          timestamp: 'Just now',
          txHash: scenario.resultData?.txHash || ('0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')),
          reason: `${scenario.revertError} (Contract halted unauthorized action on-chain)`,
        },
        ...activities,
      ]);
    }
  };

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeMandatesCount={activeMandates.length}
        blockedCount={blockedActionsCount}
        walletAddress={walletAddress}
        onConnectWallet={handleConnectWallet}
        onOpenCreateModal={() => {
          setCopilotDraft(null);
          setIsModalOpen(true);
        }}
      />

      {/* Main Content Area */}
      <div className="main-content">
        {/* Top Sticky Header */}
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Console</span>
            <span style={{ color: 'var(--border-default)' }}>/</span>
            <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>
              {activeTab === 'overview'
                ? 'Security Overview'
                : activeTab === 'copilot'
                ? 'AI Policy Copilot'
                : activeTab === 'attack-lab'
                ? 'Attack Simulation Lab'
                : activeTab === 'inspector'
                ? 'Trust & Receipt Explorer'
                : activeTab === 'mandates'
                ? 'Mandates Ledger'
                : 'Security Activity'}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-input)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <span className="status-dot emerald" />
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Monad Precompile 0x100 Active
              </span>
            </div>

            <button
              className="btn-primary"
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
              onClick={() => {
                setCopilotDraft(null);
                setIsModalOpen(true);
              }}
            >
              <Plus size={15} />
              New Mandate
            </button>
          </div>
        </header>

        {/* Tab Views */}
        <main className="page-container">
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              {/* Executive KPI Banner */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div className="kpi-card emerald">
                  <div className="kpi-label">
                    <span>Active Mandates</span>
                    <ShieldCheck size={16} color="var(--accent-emerald)" />
                  </div>
                  <div className="kpi-value">{activeMandates.length.toString().padStart(2, '0')}</div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Passkey Authorized Policies</span>
                </div>

                <div className="kpi-card emerald">
                  <div className="kpi-label">
                    <span>Secured Vault Balance</span>
                    <Lock size={16} color="var(--accent-emerald)" />
                  </div>
                  <div className="kpi-value">{formatEther(totalVaultSecured)} MON</div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Isolated Per-Mandate Balances</span>
                </div>

                <div className="kpi-card rose">
                  <div className="kpi-label">
                    <span>Attacks Blocked</span>
                    <AlertTriangle size={16} color="var(--accent-rose)" />
                  </div>
                  <div className="kpi-value">{blockedActionsCount.toString().padStart(2, '0')}</div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Smart Contract Reverts</span>
                </div>

                <div className="kpi-card amber">
                  <div className="kpi-label">
                    <span>Receipt Verifier</span>
                    <SearchCode size={16} color="var(--accent-amber)" />
                  </div>
                  <div className="kpi-value" style={{ fontSize: '1.25rem', color: 'var(--accent-emerald)' }}>
                    READY
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Zero-Backend Portable SDK</span>
                </div>
              </div>

              {/* Quick Feature Spotlight Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {/* AI Copilot Teaser Card */}
                <div
                  className="security-card"
                  style={{
                    background: 'linear-gradient(135deg, rgba(131, 110, 249, 0.08), rgba(14, 17, 24, 0.95))',
                    border: '1px solid var(--accent-monad-border)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setActiveTab('copilot')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <Sparkles size={18} color="var(--accent-monad)" />
                    <strong style={{ fontSize: '1rem', color: '#fff' }}>AI Policy Copilot</strong>
                    <span className="badge badge-monad" style={{ fontSize: '0.65rem' }}>New Feature</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Describe required permissions in plain English. The Copilot compiles deterministic target allowlists and spending limits for passkey authorization.
                  </p>
                  <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--accent-monad)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    Draft Scoped Mandate with AI <ArrowRight size={14} />
                  </div>
                </div>

                {/* Attack Lab Teaser Card */}
                <div
                  className="security-card"
                  style={{
                    background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.08), rgba(14, 17, 24, 0.95))',
                    border: '1px solid var(--accent-rose-border)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setActiveTab('attack-lab')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <FlaskConical size={18} color="var(--accent-rose)" />
                    <strong style={{ fontSize: '1rem', color: '#fff' }}>Attack Simulation Lab</strong>
                    <span className="badge badge-rose" style={{ fontSize: '0.65rem' }}>Live Proof</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Execute live security stress tests against unwhitelisted targets, excess spending, caller impersonation, and revoked mandates.
                  </p>
                  <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--accent-rose)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    Enter Attack Lab <ArrowRight size={14} />
                  </div>
                </div>
              </div>

              {/* Active Mandate Highlights & Recent Activity Split */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Active Mandate Highlights</h3>
                    <button
                      className="btn-secondary"
                      style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                      onClick={() => setActiveTab('mandates')}
                    >
                      View All ({mandates.length})
                    </button>
                  </div>
                  <MandateList
                    mandates={activeMandates.slice(0, 2)}
                    onRevoke={handleRevoke}
                    onOpenCreate={() => setIsModalOpen(true)}
                    isRevokingId={revokingId}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Recent Security Events</h3>
                    <button
                      className="btn-secondary"
                      style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                      onClick={() => setActiveTab('activity')}
                    >
                      Full Audit Trail
                    </button>
                  </div>
                  <SecurityActivityFeed activities={activities.slice(0, 4)} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mandates' && (
            <MandateList
              mandates={mandates}
              onRevoke={handleRevoke}
              onOpenCreate={() => setIsModalOpen(true)}
              isRevokingId={revokingId}
            />
          )}

          {activeTab === 'copilot' && (
            <AiPolicyCopilot onDraftApproved={handleCopilotDraftApproved} />
          )}

          {activeTab === 'attack-lab' && (
            <AttackLab onScenarioExecuted={handleScenarioRun} />
          )}

          {activeTab === 'inspector' && (
            <ReceiptInspector />
          )}

          {activeTab === 'activity' && (
            <SecurityActivityFeed activities={activities} />
          )}
        </main>
      </div>

      {/* Modal Dialog for Passkey Mandate Creation */}
      <CreateMandateModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setCopilotDraft(null);
        }}
        onSubmit={handleCreateMandate}
        isLoading={isAuthorizing}
        initialParams={copilotDraft}
      />
    </div>
  );
}
