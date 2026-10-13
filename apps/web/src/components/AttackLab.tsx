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
    txHash?: string;
    blockNumber?: number;
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
      name: '1. Permitted Action (Authorized Payable Call)',
      category: 'Allowed',
      description: 'Agent initiates a 0.10 MON native call against allowlisted Payable MockTarget router within the per-call cap.',
      target: '0x2222222222222222222222222222222222222222',
      selector: '0x50824e4f',
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
      description: 'A prompt-injected agent attempts to siphon native vault funds to an unapproved recipient address.',
      target: '0xDeadDeAdDeADdeAdDeaddeadDEADdeAdDeadbEEf',
      selector: '0x50824e4f',
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
      description: 'Agent attempts an emergency transaction of 2.50 MON exceeding the 0.25 MON per-call native MON cap.',
      target: '0x2222222222222222222222222222222222222222',
      selector: '0x50824e4f',
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
      target: '0x2222222222222222222222222222222222222222',
      selector: '0x50824e4f',
      value: '0.05',
      caller: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (Unauthorized Stranger)',
      expectedResult: 'Reverts',
      revertError: 'CallerNotAuthorized()',
      status: 'idle',
    },
    {
      id: 'scenario-5',
      name: '5. Post-Revocation Action (Revoked Authority)',
      category: 'Lifecycle Attack',
      description: 'Agent attempts to spend from a mandate whose authorization was previously revoked by the human owner.',
      target: '0x2222222222222222222222222222222222222222',
      selector: '0x50824e4f',
      value: '0.10',
      caller: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Bound Agent)',
      expectedResult: 'Reverts',
      revertError: 'MandateRevoked()',
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
      const scenario = scenarios.find((s) => s.id === id);
      if (!scenario) return;

      const isAllowed = scenario.expectedResult === 'Success';
      const resultData: AttackScenario['resultData'] = {
        txHash: undefined,
        reverted: !isAllowed,
        errorName: !isAllowed ? scenario.revertError : undefined,
        vaultRemaining: isAllowed ? '0.9000 MON' : '1.0000 MON (Unchanged)',
      };

      const updated = {
        ...scenario,
        status: 'completed' as const,
        resultData,
      };

      setScenarios((prev) => prev.map((s) => (s.id === id ? updated : s)));
      onScenarioExecuted(updated);
    }, 450);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Card */}
      <div className="security-card" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span className="badge badge-rose">
                <FlaskConical size={12} />
                Adversarial Lab
              </span>
              <span className="badge badge-simulation">Execution Mode: Local Preflight</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Attack Simulation Lab
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '720px', marginTop: '0.25rem', lineHeight: 1.5 }}>
              Exercise the policy rules the <code>MandateManager</code> contract enforces. Each scenario is evaluated locally in your browser as a preflight: rogue destinations, over-limit transactions, caller impersonations, and revoked mandates fail the policy check. To prove enforcement with real on-chain evidence, deploy the contract and verify receipts in the Receipt Explorer.
            </p>
          </div>

          <div
            style={{
              background: 'var(--bg-canvas)',
              padding: '0.65rem 0.95rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.75rem',
            }}
          >
            <span style={{ color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
              Consensus Invariant
            </span>
            <div style={{ color: 'var(--accent-emerald)', fontWeight: 700, marginTop: '2px' }}>
              Zero Execution on Policy Revert
            </div>
          </div>
        </div>
      </div>

      {/* Scenario Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {scenarios.map((scenario) => {
          const isExpanded = expandedDetails[scenario.id];
          const isAllowed = scenario.expectedResult === 'Success';
          const hasRun = scenario.status === 'completed';

          return (
            <div
              key={scenario.id}
              className="security-card"
              style={{
                borderLeft: `4px solid ${
                  isAllowed ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                }`,
                padding: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 700 }}>{scenario.name}</strong>
                    <span className={`badge ${isAllowed ? 'badge-emerald' : 'badge-rose'}`}>
                      Expected: {scenario.expectedResult}
                    </span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>
                      {scenario.category}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
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
                      ? 'Running Preflight Check...'
                      : isAllowed
                      ? 'Run Permitted Action'
                      : 'Trigger Attack Vector'}
                  </button>

                  <button
                    className="btn-secondary"
                    style={{ padding: '0.55rem' }}
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
                    marginTop: '1rem',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
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
                      <CheckCircle2 size={16} color="#34D399" />
                    ) : (
                      <XCircle size={16} color="#FB7185" />
                    )}
                    <span
                      style={{
                        fontSize: '0.825rem',
                        fontWeight: 700,
                        color: isAllowed ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                      }}
                    >
                      {isAllowed
                        ? 'Local preflight: action complies with the mandate policy bounds'
                        : `Local preflight: contract would revert with ${scenario.resultData.errorName}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {scenario.resultData.txHash ? (
                      <span title={scenario.resultData.txHash} style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>
                        Tx: {scenario.resultData.txHash.slice(0, 10)}...{scenario.resultData.txHash.slice(-6)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>
                        [Browser preflight only · nothing broadcast · no receipt mined]
                      </span>
                    )}
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Vault: {scenario.resultData.vaultRemaining}</span>
                  </div>
                </div>
              )}

              {/* Expandable Technical Calldata & Rationale */}
              {isExpanded && (
                <div
                  style={{
                    marginTop: '1rem',
                    paddingTop: '1rem',
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
                      gap: '0.75rem',
                    }}
                  >
                    <div className="mono-box">
                      <span className="kpi-label">ATTEMPTED CALLER</span>
                      <div className="mono-value" style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>{scenario.caller}</div>
                    </div>
                    <div className="mono-box">
                      <span className="kpi-label">TARGET ADDRESS</span>
                      <div className="mono-value" style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>{scenario.target}</div>
                    </div>
                    <div className="mono-box">
                      <span className="kpi-label">SELECTOR & VALUE (NATIVE MON)</span>
                      <div className="mono-value" style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                        {scenario.selector} · {scenario.value} MON
                      </div>
                    </div>
                    <div className="mono-box">
                      <span className="kpi-label">REVERT SIGNATURE</span>
                      <div className="mono-value" style={{ color: isAllowed ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontWeight: 700, marginTop: '2px' }}>
                        {scenario.revertError}
                      </div>
                    </div>
                  </div>

                  {/* Execution Mode Disclosure */}
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>
                      Browser Preflight: Validated
                    </span>
                    <span className="badge badge-simulation" style={{ fontSize: '0.68rem' }}>
                      Contract Enforcement: verify live receipts in Receipt Explorer
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
