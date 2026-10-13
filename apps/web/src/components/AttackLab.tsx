'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  Play,
  ChevronDown,
  ChevronUp,
  Info,
  Plus,
} from 'lucide-react';
import { parseEther, formatEther } from 'viem';
import type { MandateItem } from './MandateCard';
import { DO_SOMETHING_SELECTOR } from '../lib/contracts';

/** Revert errors MandateManager.execute() can raise for the checks modelled here (see contracts/src/MandateManager.sol). */
export type V1ExecuteError =
  | 'MandateIsRevoked()'
  | 'MandateExpired()'
  | 'UnauthorizedAgent()'
  | 'TargetNotAllowed()'
  | 'ExceedsPerTxLimit()'
  | 'ExceedsTotalLimit()'
  | 'InsufficientMandateBalance()';

export interface ScenarioAction {
  caller: string;
  callerLabel: string;
  target: string;
  selector: string;
  value: bigint;
}

/**
 * A JavaScript copy of the checks in MandateManager.execute(), in the contract's order.
 * Assumes the agent passes its own agentId and the right execution nonce, and attaches no msg.value.
 * Returns the error the contract would revert with, or null when the call would be allowed.
 */
export function evaluateV1Execute(m: MandateItem, a: ScenarioAction, nowSec: number): V1ExecuteError | null {
  if (m.revoked) return 'MandateIsRevoked()';
  if (m.expiresAt !== 0n && BigInt(nowSec) > m.expiresAt) return 'MandateExpired()';
  const caller = a.caller.toLowerCase();
  if (caller !== (m.agentAddress ?? '').toLowerCase() && caller !== m.owner.toLowerCase()) return 'UnauthorizedAgent()';
  const allowed = m.targets.some(
    (t) =>
      t.target.toLowerCase() === a.target.toLowerCase() &&
      (t.selector === '0x00000000' || t.selector.toLowerCase() === a.selector.toLowerCase())
  );
  if (!allowed) return 'TargetNotAllowed()';
  if (a.value > m.maxValuePerTx) return 'ExceedsPerTxLimit()';
  if (m.spentValue + a.value > m.maxTotalValue) return 'ExceedsTotalLimit()';
  if ((m.balance ?? 0n) < a.value) return 'InsufficientMandateBalance()';
  return null;
}

export interface ScenarioOutcome {
  scenarioId: string;
  scenarioName: string;
  action: ScenarioAction;
  mandateId: bigint;
  agentId: bigint;
  /** null when the call would be allowed */
  error: V1ExecuteError | null;
  /** true when the check ran against a revoked copy rather than a stored sandbox mandate */
  againstCopy: boolean;
}

interface ScenarioTemplate {
  id: string;
  name: string;
  category: 'Allowed' | 'Policy Attack' | 'Accounting Attack' | 'Identity Attack' | 'Lifecycle Attack';
  description: string;
  expectedError: V1ExecuteError | null;
}

const STRANGER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const ROGUE_TARGET = '0x000000000000000000000000000000000000dEaD';

const SCENARIOS: ScenarioTemplate[] = [
  {
    id: 'scenario-1',
    name: '1. Permitted action (allowlisted call within the cap)',
    category: 'Allowed',
    description: "The bound agent calls the mandate's first allowlisted target and selector with a value inside the per-call cap.",
    expectedError: null,
  },
  {
    id: 'scenario-2',
    name: '2. Rogue destination (target not on the allowlist)',
    category: 'Policy Attack',
    description: 'A prompt-injected agent tries to send vault funds to an address the mandate never allowlisted.',
    expectedError: 'TargetNotAllowed()',
  },
  {
    id: 'scenario-3',
    name: '3. Ceiling violation (over the per-call cap)',
    category: 'Accounting Attack',
    description: "The agent asks for 0.01 MON more than the mandate's per-call cap.",
    expectedError: 'ExceedsPerTxLimit()',
  },
  {
    id: 'scenario-4',
    name: '4. Caller hijack (unauthorized stranger)',
    category: 'Identity Attack',
    description: 'An address that is neither the bound agent nor the owner tries to execute against the mandate.',
    expectedError: 'UnauthorizedAgent()',
  },
  {
    id: 'scenario-5',
    name: '5. Post-revocation action (revoked mandate)',
    category: 'Lifecycle Attack',
    description: 'The agent tries to spend from a mandate after the owner revoked it.',
    expectedError: 'MandateIsRevoked()',
  },
];

function buildAction(id: string, m: MandateItem): ScenarioAction {
  const first = m.targets[0] ?? { target: ROGUE_TARGET, selector: DO_SOMETHING_SELECTOR };
  const selector = first.selector === '0x00000000' ? DO_SOMETHING_SELECTOR : first.selector;
  const agent = m.agentAddress ?? m.owner;
  const safeValue = m.maxValuePerTx < parseEther('0.1') ? m.maxValuePerTx : parseEther('0.1');
  const base: ScenarioAction = { caller: agent, callerLabel: 'Bound agent', target: first.target, selector, value: safeValue };
  switch (id) {
    case 'scenario-2':
      return { ...base, target: ROGUE_TARGET };
    case 'scenario-3':
      return { ...base, value: m.maxValuePerTx + parseEther('0.01') };
    case 'scenario-4':
      return { ...base, caller: STRANGER, callerLabel: 'Unauthorized stranger' };
    default:
      return base;
  }
}

type CardResult = { outcome: ScenarioOutcome; vaultAfter: bigint; note?: string };

interface AttackLabProps {
  networkMode: 'LOCAL_SIMULATION' | 'MONAD_TESTNET';
  /** First active sandbox mandate, the one scenarios 1 to 4 run against. */
  activeMandate: MandateItem | null;
  /** A revoked sandbox mandate, if one exists, for scenario 5. */
  revokedMandate: MandateItem | null;
  onScenarioExecuted: (outcome: ScenarioOutcome) => void;
  onSwitchToSimulation: () => void;
  onCreateMandate: () => void;
}

export function AttackLab({
  networkMode,
  activeMandate,
  revokedMandate,
  onScenarioExecuted,
  onSwitchToSimulation,
  onCreateMandate,
}: AttackLabProps) {
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, CardResult>>({});

  // Evaluate against the latest sandbox state when the short delay ends, not the state at click time.
  const latest = useRef({ activeMandate, revokedMandate });
  useEffect(() => {
    latest.current = { activeMandate, revokedMandate };
  }, [activeMandate, revokedMandate]);

  // Results describe a specific sandbox state; drop them when the mode changes.
  useEffect(() => {
    setResults({});
  }, [networkMode]);

  const canRun = networkMode === 'LOCAL_SIMULATION' && !!activeMandate;

  const runScenario = (template: ScenarioTemplate) => {
    if (!canRun) return;
    setRunning((prev) => ({ ...prev, [template.id]: true }));

    setTimeout(() => {
      setRunning((prev) => ({ ...prev, [template.id]: false }));
      const { activeMandate: active, revokedMandate: revoked } = latest.current;
      if (!active) return;

      let checked: MandateItem = active;
      let againstCopy = false;
      let note: string | undefined;
      if (template.id === 'scenario-5') {
        if (revoked) {
          checked = revoked;
        } else {
          checked = { ...active, revoked: true };
          againstCopy = true;
          note = `No sandbox mandate is revoked yet, so this ran against a revoked copy of mandate #${active.id}. Revoke one in Wallet Mandates to test it directly.`;
        }
      }

      const action = buildAction(template.id, checked);
      const error = evaluateV1Execute(checked, action, Math.floor(Date.now() / 1000));
      const outcome: ScenarioOutcome = {
        scenarioId: template.id,
        scenarioName: template.name,
        action,
        mandateId: checked.id,
        agentId: checked.agentId,
        error,
        againstCopy,
      };
      const balance = checked.balance ?? 0n;
      setResults((prev) => ({
        ...prev,
        [template.id]: { outcome, vaultAfter: error === null ? balance - action.value : balance, note },
      }));
      onScenarioExecuted(outcome);
    }, 350);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Card */}
      <div className="security-card" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <span className="badge badge-rose">
                <FlaskConical size={12} />
                Adversarial Lab
              </span>
              <span className="badge badge-simulation">Simulated in your browser</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Attack Simulation Lab
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '720px', marginTop: '0.25rem', lineHeight: 1.5 }}>
              Each scenario builds a call against your sandbox mandate and runs it through a JavaScript copy of the checks in{' '}
              <code>MandateManager.execute()</code>, in the contract&apos;s order. Nothing is sent to any chain. Real reverts for the
              same checks, recorded on Monad Testnet, are linked on the Evidence &amp; Proofs page.
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
              Sandbox mandate under test
            </span>
            <div style={{ color: activeMandate ? 'var(--accent-emerald)' : 'var(--text-muted)', fontWeight: 700, marginTop: '2px' }}>
              {networkMode !== 'LOCAL_SIMULATION'
                ? 'None (Monad Testnet mode)'
                : activeMandate
                ? `Mandate #${activeMandate.id} · Agent #${activeMandate.agentId}`
                : 'None yet'}
            </div>
          </div>
        </div>

        {!canRun && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-amber-subtle)',
              border: '1px solid var(--accent-amber-border)',
              color: 'var(--accent-amber)',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
              flexWrap: 'wrap',
            }}
          >
            <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1, minWidth: '220px' }}>
              {networkMode !== 'LOCAL_SIMULATION'
                ? 'The Attack Lab only runs in Local Simulation, against a sandbox mandate you create in this browser.'
                : 'Create a sandbox mandate first. The scenarios use its agent, allowlist, caps and vault balance.'}
            </div>
            {networkMode !== 'LOCAL_SIMULATION' ? (
              <button className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} onClick={onSwitchToSimulation}>
                Switch to Local Simulation
              </button>
            ) : (
              <button className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} onClick={onCreateMandate}>
                <Plus size={13} /> Create sandbox mandate
              </button>
            )}
          </div>
        )}
      </div>

      {/* Scenario Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {SCENARIOS.map((scenario) => {
          const isExpanded = expandedDetails[scenario.id];
          const expectAllowed = scenario.expectedError === null;
          const result = results[scenario.id];
          const isRunning = !!running[scenario.id];
          const previewMandate =
            scenario.id === 'scenario-5' ? revokedMandate ?? activeMandate : activeMandate;
          const preview = canRun && previewMandate ? buildAction(scenario.id, previewMandate) : null;
          const resultAllowed = result ? result.outcome.error === null : false;
          const matched = result ? result.outcome.error === scenario.expectedError : true;

          return (
            <div
              key={scenario.id}
              className="security-card"
              style={{
                borderLeft: `4px solid ${expectAllowed ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
                padding: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 'min(280px, 100%)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 700 }}>{scenario.name}</strong>
                    <span className={`badge ${expectAllowed ? 'badge-emerald' : 'badge-rose'}`}>
                      Expected: {expectAllowed ? 'Allowed' : scenario.expectedError}
                    </span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>
                      {scenario.category}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{scenario.description}</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <button
                    className={expectAllowed ? 'btn-primary' : 'btn-danger'}
                    onClick={() => runScenario(scenario)}
                    disabled={!canRun || isRunning}
                    title={canRun ? undefined : 'Switch to Local Simulation and create a sandbox mandate first'}
                  >
                    <Play size={12} />
                    {isRunning ? 'Checking...' : expectAllowed ? 'Run permitted action' : 'Trigger attack'}
                  </button>

                  <button
                    className="btn-secondary"
                    style={{ padding: '0.55rem' }}
                    onClick={() => setExpandedDetails((prev) => ({ ...prev, [scenario.id]: !prev[scenario.id] }))}
                    aria-label="Toggle technical details"
                  >
                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              </div>

              {/* Result Banner: computed from the sandbox mandate, labelled as simulated */}
              {result && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    background: resultAllowed ? 'var(--accent-emerald-subtle)' : 'var(--accent-rose-subtle)',
                    border: `1px solid ${resultAllowed ? 'var(--accent-emerald-border)' : 'var(--accent-rose-border)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {resultAllowed ? <CheckCircle2 size={16} color="#34D399" /> : <XCircle size={16} color="#FB7185" />}
                      <span
                        style={{
                          fontSize: '0.825rem',
                          fontWeight: 700,
                          color: resultAllowed ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                        }}
                      >
                        {resultAllowed
                          ? `Simulated: allowed by mandate #${result.outcome.mandateId}'s rules`
                          : `Simulated: the contract would revert with ${result.outcome.error}`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span>[checked in your browser · nothing sent · no tx]</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        Sandbox vault: {formatEther(result.vaultAfter)} MON{resultAllowed ? '' : ' (unchanged)'}
                      </span>
                    </div>
                  </div>
                  {!matched && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Your sandbox mandate&apos;s current state gives a different result than this scenario usually shows
                      ({scenario.expectedError ?? 'allowed'}). The check above is the one that applies.
                    </div>
                  )}
                  {result.note && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{result.note}</div>}
                </div>
              )}

              {/* Expandable technical details */}
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
                  {preview ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
                        gap: '0.75rem',
                      }}
                    >
                      <div className="mono-box">
                        <span className="kpi-label">ATTEMPTED CALLER</span>
                        <div className="mono-value" style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                          {preview.caller} ({preview.callerLabel})
                        </div>
                      </div>
                      <div className="mono-box">
                        <span className="kpi-label">TARGET ADDRESS</span>
                        <div className="mono-value" style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                          {preview.target}
                        </div>
                      </div>
                      <div className="mono-box">
                        <span className="kpi-label">SELECTOR & VALUE (NATIVE MON)</span>
                        <div className="mono-value" style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                          {preview.selector} · {formatEther(preview.value)} MON
                        </div>
                      </div>
                      <div className="mono-box">
                        <span className="kpi-label">EXPECTED REVERT</span>
                        <div
                          className="mono-value"
                          style={{ color: expectAllowed ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontWeight: 700, marginTop: '2px' }}
                        >
                          {scenario.expectedError ?? 'None (within the mandate)'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      The caller, target, selector and value come from your sandbox mandate once you create one in Local
                      Simulation. Expected revert: {scenario.expectedError ?? 'none (within the mandate)'}.
                    </div>
                  )}

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className="badge badge-simulation" style={{ fontSize: '0.68rem' }}>
                      Browser simulation, not an on-chain result
                    </span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>
                      Recorded testnet reverts: Evidence &amp; Proofs
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
