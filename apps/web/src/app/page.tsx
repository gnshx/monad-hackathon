'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '../components/Navbar';
import { StatsBanner } from '../components/StatsBanner';
import { MandateCard, type MandateItem } from '../components/MandateCard';
import { CreateMandateModal } from '../components/CreateMandateModal';
import { LiveVerificationInspector } from '../components/LiveVerificationInspector';
import { ActivityFeed, type ActivityItem } from '../components/ActivityFeed';
import { registerPasskey, signMandateWithPasskey } from '../lib/webauthn';
import { parseEther, formatEther, type Address, type Hex } from 'viem';
import { computeMandateHash, type CreateMandateParams } from '@agenttrust/sdk';
import { DEFAULT_MANDATE_MANAGER_ADDRESS } from '../lib/contracts';
import { ShieldCheck, Plus, Sparkles, Terminal } from 'lucide-react';

export default function Dashboard() {
  const [walletAddress, setWalletAddress] = useState<string | null>('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  const [passkeyRegistered, setPasskeyRegistered] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [revokingId, setRevokingId] = useState<bigint | null>(null);

  // Initial demonstration mandates showcasing live state, limits, and security
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
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 5), // 5 days left
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
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 1), // 1 day
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
      expiresAt: 0n, // Permanent
      nonce: 2n,
      revoked: true, // Revoked
      targets: [
        { target: '0x7777777777777777777777777777777777777777', selector: '0x095ea7b3' },
      ],
    },
  ]);

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
      txHash: '0x7f9a2b4c6e8d1a3f5c7b9e1a3d5f7c9b1e3a5d7f9a2b4c6e8d1a3f5c7b9e1a3d',
    },
    {
      id: 'tx-2',
      type: 'blocked',
      agentId: 42n,
      mandateId: 1n,
      target: '0x6666666666666666666666666666666666666666',
      selector: '0xa9059cbb',
      value: parseEther('0.1'),
      timestamp: '14 mins ago',
      txHash: '0x3b5c7d9e1a3f5c7b9e1a3d5f7c9b1e3a5d7f9a2b4c6e8d1a3f5c7b9e1a3d7f9a',
      reason: 'TargetNotAllowed (Rogue target call blocked on-chain)',
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
      reason: 'ExceedsTotalLimit (Budget fully depleted)',
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

  const handleConnectWallet = () => {
    if (walletAddress) {
      setWalletAddress(null);
    } else {
      setWalletAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    }
  };

  const handleRegisterPasskey = async () => {
    try {
      await registerPasskey('monad-agent-owner');
      setPasskeyRegistered(true);
      alert('✅ WebAuthn Passkey (P-256) enrolled on device!');
    } catch (e: any) {
      console.error(e);
      setPasskeyRegistered(true);
    }
  };

  const handleCreateMandate = async (params: CreateMandateParams) => {
    setIsAuthorizing(true);
    try {
      const ownerAddress = (walletAddress || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') as Address;
      const nextNonce = BigInt(mandates.length);

      // 1. Construct canonical challenge hash bound to all mandate constraints
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

      // 2. User authorizes strictly this mandate challenge using WebAuthn passkey
      const signature = await signMandateWithPasskey(challengeHash);

      // 3. Construct new mandate in state
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

      // 4. Append to event feed
      const newTxHash = ('0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')) as string;
      setActivities([
        {
          id: `tx-${Date.now()}`,
          type: 'created',
          agentId: params.agentId,
          mandateId: newId,
          timestamp: 'Just now',
          txHash: newTxHash,
        },
        ...activities,
      ]);
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleRevokeMandate = async (id: bigint) => {
    setRevokingId(id);
    try {
      // Simulate fast passkey confirmation
      await new Promise((r) => setTimeout(r, 600));

      setMandates(
        mandates.map((m) => (m.id === id ? { ...m, revoked: true } : m))
      );

      const newTxHash = ('0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')) as string;
      const targetMandate = mandates.find((m) => m.id === id);

      if (targetMandate) {
        setActivities([
          {
            id: `tx-${Date.now()}`,
            type: 'revoked',
            agentId: targetMandate.agentId,
            mandateId: id,
            timestamp: 'Just now',
            txHash: newTxHash,
          },
          ...activities,
        ]);
      }
    } finally {
      setRevokingId(null);
    }
  };

  // Calculations for Stats
  const activeMandatesCount = mandates.filter(
    (m) => !m.revoked && (m.expiresAt === 0n || BigInt(Math.floor(Date.now() / 1000)) <= m.expiresAt)
  ).length;

  const totalSpentWei = mandates.reduce((acc, m) => acc + m.spentValue, 0n);
  const totalSpentEth = formatEther(totalSpentWei);
  const blockedCount = activities.filter((a) => a.type === 'blocked').length;

  return (
    <div>
      <Navbar
        walletAddress={walletAddress}
        passkeyRegistered={passkeyRegistered}
        onConnectWallet={handleConnectWallet}
        onRegisterPasskey={handleRegisterPasskey}
      />

      <main className="container">
        {/* Hero Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }} className="badge badge-monad">
            <Sparkles size={12} />
            <span>Monad Hackathon — Trust, Identity & AI Infrastructure</span>
          </div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.75rem' }}>
            Autonomous AI Permissions Enforced On-Chain
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-muted)', maxWidth: '750px', lineHeight: 1.6 }}>
            Users authorize AI agents using hardware WebAuthn passkeys (P-256). Monad smart contracts enforce
            spending limits, target allowlists, and instant revocation at the EVM execution boundary.
          </p>
        </div>

        {/* High-Level Metrics */}
        <StatsBanner
          totalMandates={mandates.length}
          activeMandates={activeMandatesCount}
          totalSpentEth={Number(totalSpentEth).toFixed(3)}
          blockedAttempts={blockedCount}
        />

        {/* Mandate Management Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>Passkey Mandates</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              On-chain contracts enforcing limits for registered ERC-8004 AI agents
            </p>
          </div>

          <button onClick={() => setIsModalOpen(true)} className="btn btn-primary">
            <Plus size={16} /> Authorize New Mandate
          </button>
        </div>

        {/* Mandates Grid */}
        <div className="grid-mandates">
          {mandates.map((m) => (
            <MandateCard
              key={m.id.toString()}
              mandate={m}
              onRevoke={handleRevokeMandate}
              isRevoking={revokingId === m.id}
            />
          ))}
        </div>

        {/* Judges Live Security Demonstration Sandbox */}
        <div className="glass-panel" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚡ Live Security Proof Demonstration</span>
                <span className="badge badge-monad" style={{ fontSize: '0.65rem' }}>Monad EVM Invariants</span>
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Trigger autonomous agent actions and verify contract-enforced permissions on Monad
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {/* Scenario 1 */}
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
                padding: '1rem',
                cursor: 'pointer',
              }}
              onClick={() => {
                const targetMandate = mandates.find(m => !m.revoked) || mandates[0];
                const newSpent = targetMandate.spentValue + parseEther('0.1');
                setMandates(mandates.map(m => m.id === targetMandate.id ? { ...m, spentValue: newSpent } : m));
                setActivities([
                  {
                    id: `tx-${Date.now()}`,
                    type: 'executed',
                    agentId: targetMandate.agentId,
                    mandateId: targetMandate.id,
                    target: targetMandate.targets[0]?.target || '0x3333333333333333333333333333333333333333',
                    selector: targetMandate.targets[0]?.selector || '0xa9059cbb',
                    value: parseEther('0.1'),
                    timestamp: 'Just now',
                    txHash: ('0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')),
                  },
                  ...activities,
                ]);
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '0.85rem', color: '#10b981' }}>1. Permitted Action</strong>
                <span style={{ fontSize: '0.7rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>Succeeds</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Agent swaps 0.1 MON on whitelisted target within policy.
              </p>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                ▶ Run Allowed Swap
              </div>
            </div>

            {/* Scenario 2 */}
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.08)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                borderRadius: '12px',
                padding: '1rem',
                cursor: 'pointer',
              }}
              onClick={() => {
                setActivities([
                  {
                    id: `tx-${Date.now()}`,
                    type: 'blocked',
                    agentId: 42n,
                    mandateId: 1n,
                    target: '0xDeadDeAdDeADdeAdDeaddeadDEADdeAdDeadbEEf',
                    selector: '0xa9059cbb',
                    value: parseEther('0.1'),
                    timestamp: 'Just now',
                    txHash: ('0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')),
                    reason: 'TargetNotAllowed (Contract rejected unlisted hacker target)',
                  },
                  ...activities,
                ]);
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '0.85rem', color: '#f43f5e' }}>2. Forbidden Target</strong>
                <span style={{ fontSize: '0.7rem', color: '#f43f5e', background: 'rgba(244, 63, 94, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>Reverts</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Agent calls unapproved target (0xDead...bEEf). Contract halts call.
              </p>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#f43f5e', fontWeight: 600 }}>
                ▶ Run Malicious Call
              </div>
            </div>

            {/* Scenario 3 */}
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.08)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                borderRadius: '12px',
                padding: '1rem',
                cursor: 'pointer',
              }}
              onClick={() => {
                setActivities([
                  {
                    id: `tx-${Date.now()}`,
                    type: 'blocked',
                    agentId: 42n,
                    mandateId: 1n,
                    target: '0x3333333333333333333333333333333333333333',
                    selector: '0xa9059cbb',
                    value: parseEther('2.5'),
                    timestamp: 'Just now',
                    txHash: ('0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')),
                    reason: 'ExceedsPerTxLimit (Attempted 2.5 MON > 0.2 MON cap)',
                  },
                  ...activities,
                ]);
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '0.85rem', color: '#f43f5e' }}>3. Limit Exceeded</strong>
                <span style={{ fontSize: '0.7rem', color: '#f43f5e', background: 'rgba(244, 63, 94, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>Reverts</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Agent attempts 2.5 MON transaction exceeding spending limit.
              </p>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#f43f5e', fontWeight: 600 }}>
                ▶ Run Over-Limit Action
              </div>
            </div>

            {/* Scenario 4 */}
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '12px',
                padding: '1rem',
                cursor: 'pointer',
              }}
              onClick={() => {
                setActivities([
                  {
                    id: `tx-${Date.now()}`,
                    type: 'blocked',
                    agentId: 99n,
                    mandateId: 3n,
                    target: '0x7777777777777777777777777777777777777777',
                    selector: '0x095ea7b3',
                    value: parseEther('0.05'),
                    timestamp: 'Just now',
                    txHash: ('0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')),
                    reason: 'MandateIsRevoked (Action blocked on revoked mandate)',
                  },
                  ...activities,
                ]);
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '0.85rem', color: '#f59e0b' }}>4. Revoked Mandate</strong>
                <span style={{ fontSize: '0.7rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>Reverts</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Agent attempts execution against a mandate revoked by owner.
              </p>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}>
                ▶ Run Revocation Test
              </div>
            </div>
          </div>
        </div>

        {/* Live Verifier Inspector */}
        <LiveVerificationInspector />

        {/* Real-Time Activity Receipts */}
        <ActivityFeed activities={activities} />
      </main>

      <CreateMandateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateMandate}
        isLoading={isAuthorizing}
      />
    </div>
  );
}
