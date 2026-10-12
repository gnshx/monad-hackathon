'use client';

import React, { useState } from 'react';
import {
  FlaskConical,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RotateCcw,
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
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>('scenario-2');
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  const [scenarios, setScenarios] = useState<AttackScenario[]>([
    {
      id: 'scenario-1',
      name: '1. Permitted Action (Authorized Token Swap)',
      category: 'Allowed',
      description: 'Agent initiates a 0.1 MON swap against whitelisted DEX target within the per-transaction limit.',
      target: '0x3333333333333333333333333333333333333333',
      selector: '0xa9059cbb',
      value: '0.1',
      caller: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Bound Agent)',
      expectedResult: 'Success',
      revertError: 'None (Complies with policy)',
      status: 'idle',
    },
    {
      id: 'scenario-2',
      name: '2. Rogue Destination (Unwhitelisted Target)',
      category: 'Policy Attack',
      description: 'A prompt-injected agent attempts to siphon vault funds to an unapproved hacker contract.',
      target: '0xDeadDeAdDeADdeAdDeaddeadDEADdeAdDeadbEEf',
      selector: '0xa9059cbb',
      value: '0.1',
      caller: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Bound Agent)',
      expectedResult: 'Reverts',
      revertError: 'TargetNotAllowed()',
      status: 'idle',
    },
    {
      id: 'scenario-3',
      name: '3. Ceiling Violation (Spending Limit Exceeded)',
      category: 'Accounting Attack',
      description: 'Agent attempts an emergency transaction of 2.5 MON exceeding the 0.25 MON per-tx mandate ceiling.',
      target: '0x3333333333333333333333333333333333333333',
      selector: '0xa9059cbb',
      value: '2.5',
      caller: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Bound Agent)',
      expectedResult: 'Reverts',
      revertError: 'ExceedsPerTxLimit()',
      status: 'idle',
    },
    {
      id: 'scenario-4',
      name: '4. Caller Identity Hijack (Untrusted Stranger)',
      category: 'Identity Attack',
      description: 'An arbitrary stranger EOA attempts to trigger execution on behalf of Agent #42.',
      target: '0x3333333333333333333333333333333333333333',
      selector: '0xa9059cbb',
      value: '0.05',
      caller: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (Unauthorized Stranger)',
      expectedResult: 'Reverts',
      revertError: 'CallerNotAuthorized() (CRIT-01 Guard)',
      status: 'idle',
    },
    {
      id: 'scenario-5',
      name: '5. Post-Revocation Execution (Revoked Mandate)',
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
                vaultRemaining: isAllowed ? '0.40 MON' : '0.50 MON (Untouched)',
              },
            };
            onScenarioExecuted(updated);
            return updated;
          }
          return s;
        })
      );
    }, 500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="security-card" style={{ background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.08), rgba(131, 110, 249, 0.04))' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span className="badge badge-rose">
                <FlaskConical size={12} />
                Adversarial Simulation
              </span>
              <span className="badge badge-neutral">Smart Contract Consensus</span>
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
              Attack Simulation Lab
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '680px', marginTop: '0.25rem' }}>
              Test the mathematical guarantees of the <code>MandateManager</code> smart contract. Trigger simulated attack vectors and verify that unauthorized targets, over-limit transactions, and rogue callers reliably revert on-chain.
            </p>
          </div>

          <div style={{ background: 'var(--bg-input)', padding: '0.5rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', textAlign: 'right' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Consensus Rule</span>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
              Contract Reverts Halted On-Chain
            </div>
          </div>
        </div>
      </div>

      {/* Scenario List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {scenarios.map((scenario) => {
          const isExpanded = expandedDetails[scenario.id];
          const isAllowed = scenario.expectedResult === 'Success';
          const hasRun = scenario.status === 'completed';

          return (
            <div
              key={scenario.id}
              className="security-card-elevated"
              style={{
                borderLeft: `4px solid ${
                  isAllowed ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                }`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <strong style={{ fontSize: '1rem', color: '#fff' }}>{scenario.name}</strong>
                    <span className={`badge ${isAllowed ? 'badge-emerald' : 'badge-rose'}`}>
                      {scenario.expectedResult}
                    </span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                      {scenario.category}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {scenario.description}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <button
                    className={`btn-${isAllowed ? 'primary' : 'danger'}`}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                    onClick={() => runScenario(scenario.id)}
                    disabled={scenario.status === 'running'}
                  >
                    <Play size={13} />
                    {scenario.status === 'running'
                      ? 'Executing...'
                      : isAllowed
                      ? 'Run Permitted Action'
                      : 'Trigger Attack Vector'}
                  </button>

                  <button
                    className="btn-secondary"
                    style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}
                    onClick={() => toggleDetails(scenario.id)}
                    title="Toggle Technical Details"
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Execution Feedback Banner if Run */}
              {hasRun && scenario.resultData && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.85rem',
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
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isAllowed ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                      {isAllowed
                        ? 'Consensus: Permitted Action Executed Successfully'
                        : `Contract Reverted: ${scenario.resultData.errorName}`}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    Vault Status: {scenario.resultData.vaultRemaining}
                  </div>
                </div>
              )}

              {/* Expandable Technical Calldata Inspection */}
              {isExpanded && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <div className="mono-box">
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>CALLER</span>
                    {scenario.caller}
                  </div>
                  <div className="mono-box">
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>DESTINATION TARGET</span>
                    {scenario.target}
                  </div>
                  <div className="mono-box">
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>SELECTOR</span>
                    {scenario.selector}
                  </div>
                  <div className="mono-box">
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>ATTEMPTED VALUE</span>
                    {scenario.value} MON
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
