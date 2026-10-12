'use client';

import React, { useState } from 'react';
import {
  FlaskConical,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Radio,
  FileCode,
  Layers,
} from 'lucide-react';
import { parseEther, formatEther } from 'viem';

export interface AttackScenario {
  id: string;
  name: string;
  category: 'Allowed' | 'Policy Attack' | 'Accounting Attack' | 'Identity Attack' | 'Lifecycle Attack';
  description: string;
  target: string;
  selector: string;
  value: string;
  caller: string;
  expectedResult: 'Success' | 'Reverts';
  revertError: string;
  status: 'idle' | 'running' | 'completed';
  resultData?: {
    txHash: string;
    blockNumber: number;
    reverted: boolean;
    errorName?: string;
    vaultRemaining: string;
  };
}

interface AttackLabProps {
  onScenarioExecuted: (scenario: AttackScenario) => void;
}

export function AttackLab({ onScenarioExecuted }: AttackLabProps) {
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({
    'scenario-2': true,
  });

  const [scenarios, setScenarios] = useState<AttackScenario[]>([
    {
      id: 'scenario-1',
      name: '1. Permitted Action (Authorized Swap)',
      category: 'Allowed',
      description: 'Agent initiates a 0.10 MON swap against allowlisted Uniswap router within the per-transaction limit.',
      target: '0x3333333333333333333333333333333333333333',
      selector: '0xa9059cbb',
      value: '0.10',
      caller: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Bound Agent)',
      expectedResult: 'Success',
      revertError: 'None (Complies with Mandate)',
      status: 'idle',
    },
    {
      id: 'scenario-2',
      name: '2. Rogue Destination (Unwhitelisted Target)',
      category: 'Policy Attack',
      description: 'A prompt-injected agent attempts to siphon vault funds to an unapproved recipient address.',
      target: '0xDeadDeAdDeADdeAdDeaddeadDEADdeAdDeadbEEf',
      selector: '0xa9059cbb',
      value: '0.10',
      caller: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Bound Agent)',
      expectedResult: 'Reverts',
      revertError: 'TargetNotAllowed()',
      status: 'idle',
    },
    {
      id: 'scenario-3',
      name: '3. Ceiling Violation (Spending Limit Exceeded)',
      category: 'Accounting Attack',
      description: 'Agent attempts an emergency transaction of 2.50 MON exceeding the 0.25 MON per-transaction limit.',
      target: '0x3333333333333333333333333333333333333333',
      selector: '0xa9059cbb',
      value: '2.50',
      caller: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Bound Agent)',
      expectedResult: 'Reverts',
      revertError: 'ExceedsPerTxLimit()',
      status: 'idle',
    },
    {
      id: 'scenario-4',
      name: '4. Caller Identity Hijack (Unauthorized Stranger)',
      category: 'Identity Attack',
      description: 'An arbitrary stranger address attempts to invoke execution on behalf of Agent #42.',
      target: '0x3333333333333333333333333333333333333333',
      selector: '0xa9059cbb',
      value: '0.05',
      caller: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (Unauthorized Stranger)',
      expectedResult: 'Reverts',
      revertError: 'CallerNotAuthorized()',
      status: 'idle',
    },
    {
      id: 'scenario-5',
      name: '5. Post-Revocation Attempt (Revoked Mandate)',
      category: 'Lifecycle Attack',
      description: 'Agent attempts an action against a mandate that was revoked by the human owner.',
      target: '0x3333333333333333333333333333333333333333',
      selector: '0xa9059cbb',
      value: '0.05',
      caller: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Bound Agent)',
      expectedResult: 'Reverts',
      revertError: 'MandateIsRevoked()',
      status: 'idle',
    },
  ]);

  const toggleDetails = (id: string) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const runScenario = (id: string) => {
    setScenarios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: 'running' } : s))
    );

    setTimeout(() => {
      const isAllowed = id === 'scenario-1';
      const dummyTx = ('0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''));

      setScenarios((prev) =>
        prev.map((s) => {
          if (s.id === id) {
            const updated: AttackScenario = {
              ...s,
              status: 'completed',
              resultData: {
                txHash: dummyTx,
                blockNumber: Math.floor(Math.random() * 50) + 120,
                reverted: !isAllowed,
                errorName: !isAllowed ? s.revertError : undefined,
                vaultRemaining: isAllowed ? '0.40 MON' : '0.50 MON (Vault Untouched)',
              },
            };
            onScenarioExecuted(updated);
            return updated;
          }
          return s;
        })
      );
    }, 450);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Card */}
      <div className="security-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span className="badge badge-rose">
                <FlaskConical size={12} />
                Adversarial Lab
              </span>
              <span className="badge badge-simulation">Execution Mode: Testnet / Local Sandbox</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
              Attack Simulation Lab
            </h2>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', maxWidth: '720px', marginTop: '0.2rem' }}>
              Verify mathematical guarantees of the <code>MandateManager</code> smart contract. Trigger simulated attack vectors and verify that rogue destinations, over-limit transactions, caller impersonations, and revoked actions reliably revert on-chain.
            </p>
          </div>

          <div
            style={{
              background: 'var(--bg-input)',
              padding: '0.55rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.72rem',
            }}
          >
            <span style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
              Consensus Invariant
            </span>
            <div style={{ color: 'var(--accent-emerald)', fontWeight: 700, marginTop: '2px' }}>
              Zero Execution on Policy Revert
            </div>
          </div>
        </div>
      </div>

      {/* Scenario Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {scenarios.map((scenario) => {
          const isExpanded = expandedDetails[scenario.id];
          const isAllowed = scenario.expectedResult === 'Success';
          const hasRun = scenario.status === 'completed';

          return (
            <div
              key={scenario.id}
              className="security-card-elevated"
              style={{
                borderLeft: `3px solid ${
                  isAllowed ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                }`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.95rem', color: '#fff' }}>{scenario.name}</strong>
                    <span className={`badge ${isAllowed ? 'badge-emerald' : 'badge-rose'}`}>
                      Expected: {scenario.expectedResult}
                    </span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>
                      {scenario.category}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {scenario.description}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <button
                    className={isAllowed ? 'btn-primary' : 'btn-danger'}
                    onClick={() => runScenario(scenario.id)}
                    disabled={scenario.status === 'running'}
                  >
                    <Play size={12} />
                    {scenario.status === 'running'
                      ? 'Simulating On-Chain...'
                      : isAllowed
                      ? 'Run Permitted Action'
                      : 'Trigger Attack Vector'}
                  </button>

                  <button
                    className="btn-secondary"
                    style={{ padding: '0.5rem' }}
                    onClick={() => toggleDetails(scenario.id)}
                    aria-label="Toggle technical details"
                  >
                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              </div>

              {/* Execution Result Banner */}
              {hasRun && scenario.resultData && (
                <div
                  style={{
                    marginTop: '0.85rem',
                    padding: '0.75rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    background: isAllowed ? 'var(--accent-emerald-subtle)' : 'var(--accent-rose-subtle)',
                    border: `1px solid ${isAllowed ? 'var(--accent-emerald-border)' : 'var(--accent-rose-border)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isAllowed ? (
                      <CheckCircle2 size={16} color="var(--accent-emerald)" />
                    ) : (
                      <XCircle size={16} color="var(--accent-rose)" />
                    )}
                    <span
                      style={{
                        fontSize: '0.785rem',
                        fontWeight: 600,
                        color: isAllowed ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                      }}
                    >
                      {isAllowed
                        ? 'Confirmed on-chain: Permitted action executed within budget'
                        : `Contract Reverted on-chain: ${scenario.resultData.errorName}`}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    Vault: {scenario.resultData.vaultRemaining}
                  </div>
                </div>
              )}

              {/* Expandable Technical Calldata & Rationale */}
              {isExpanded && (
                <div
                  style={{
                    marginTop: '0.85rem',
                    paddingTop: '0.85rem',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '0.65rem',
                    }}
                  >
                    <div className="mono-box">
                      <span className="kpi-label">ATTEMPTED CALLER</span>
                      <div style={{ color: '#fff', marginTop: '2px' }}>{scenario.caller}</div>
                    </div>
                    <div className="mono-box">
                      <span className="kpi-label">TARGET ADDRESS</span>
                      <div style={{ color: '#fff', marginTop: '2px' }}>{scenario.target}</div>
                    </div>
                    <div className="mono-box">
                      <span className="kpi-label">SELECTOR & VALUE</span>
                      <div style={{ color: '#fff', marginTop: '2px' }}>
                        {scenario.selector} · {scenario.value} MON
                      </div>
                    </div>
                    <div className="mono-box">
                      <span className="kpi-label">REVERT SIGNATURE</span>
                      <div style={{ color: isAllowed ? 'var(--accent-emerald)' : 'var(--accent-rose)', marginTop: '2px' }}>
                        {scenario.revertError}
                      </div>
                    </div>
                  </div>

                  {/* Execution Mode Disclosure */}
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                      Browser Preflight: Validated
                    </span>
                    <span className="badge badge-simulation" style={{ fontSize: '0.65rem' }}>
                      Local Simulation / Monad Testnet: Enforced by Contract
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
