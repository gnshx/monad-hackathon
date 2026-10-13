'use client';

import React, { useMemo, useState } from 'react';
import {
  ScanSearch,
  ShieldCheck,
  ShieldX,
  Play,
  Loader2,
  Bot,
  UserX,
  Flame,
  Crosshair,
  FunctionSquare,
  CheckCircle2,
  SlidersHorizontal,
  Info,
} from 'lucide-react';
import { encodeFunctionData, isAddress, isHex, parseEther, type Address, type Hex } from 'viem';
import { mandatesClient } from '../lib/agentMandates';
import { DEFAULT_MOCK_TARGET_ADDRESS } from '../lib/contracts';
import { PageHead } from './PageHead';
import s from './PasskeyConsole.module.css';
import v from './Verify.module.css';

const TARGET_ABI = [
  { type: 'function', name: 'doSomething', inputs: [{ name: 'v', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'payable' },
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

const DEMO_AGENT = (process.env.NEXT_PUBLIC_DEMO_AGENT || '') as Address;
const DEMO_TARGET = (process.env.NEXT_PUBLIC_DEMO_TARGET || DEFAULT_MOCK_TARGET_ADDRESS) as Address;
const DEAD: Address = '0x000000000000000000000000000000000000dEaD';
const STRANGER: Address = '0x91c4b2e3a7d0f6c1c9e58ab2fe1d3c4b5a6e7f80';
const CALL = encodeFunctionData({ abi: TARGET_ABI, functionName: 'doSomething', args: [1n] });

/** Plain-English meaning of every reason checkAction() can return. */
const REASONS: Record<string, string> = {
  NotAgent: 'The caller is not the agent this mandate was granted to.',
  AgentIdentityMismatch: 'The ERC-8004 identity no longer points at this agent wallet.',
  PermissionDenied: 'That contract or function is not on the allowlist the owner signed.',
  ExceedsPerCallLimit: 'The value is above the per-call cap the owner signed.',
  ExceedsBudget: 'This call would push total spend past the budget.',
  InsufficientBalance: 'The mandate vault does not hold enough to pay for this call.',
  MandateInactive: 'The mandate is revoked or expired.',
  MandateNotFound: 'No mandate exists with that ID.',
  TokenNotAllowed: 'That token has no budget on this mandate.',
  TargetIsVaultToken: 'Calling the vault token directly is never allowed.',
};

type Scenario = {
  id: string;
  title: string;
  desc: string;
  icon: React.ComponentType<any>;
  expect: 'allow' | 'deny';
  agent: Address;
  target: Address;
  data: Hex;
  value: string;
};

const SCENARIOS: Scenario[] = [
  { id: 'ok', title: 'Normal call', desc: 'Agent calls the allowed function, well under the cap', icon: Bot, expect: 'allow', agent: DEMO_AGENT, target: DEMO_TARGET, data: CALL, value: '0.001' },
  { id: 'overspend', title: 'Overspend', desc: 'Same call, but tries to send 1 MON', icon: Flame, expect: 'deny', agent: DEMO_AGENT, target: DEMO_TARGET, data: CALL, value: '1' },
  { id: 'rogue', title: 'Rogue target', desc: 'Prompt-injected agent sends funds to 0x…dEaD', icon: Crosshair, expect: 'deny', agent: DEMO_AGENT, target: DEAD, data: '0x', value: '0.001' },
  { id: 'fn', title: 'Wrong function', desc: 'Allowed contract, but a function nobody approved', icon: FunctionSquare, expect: 'deny', agent: DEMO_AGENT, target: DEMO_TARGET, data: encodeFunctionData({ abi: TARGET_ABI, functionName: 'transfer', args: [DEAD, 1n] }), value: '0' },
  { id: 'stranger', title: 'Impostor agent', desc: 'A different wallet tries to use the mandate', icon: UserX, expect: 'deny', agent: STRANGER, target: DEMO_TARGET, data: CALL, value: '0.001' },
];

type Result = { allowed: boolean; reason?: string; error?: string };

function short(a: string, n = 4) {
  return a.length > 2 * n + 2 ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : a;
}

export function VerifyLab() {
  const client = useMemo(() => mandatesClient(), []);
  const [mandateId, setMandateId] = useState(process.env.NEXT_PUBLIC_DEMO_MANDATE_ID || '1');
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [custom, setCustom] = useState({ agent: DEMO_AGENT as string, target: DEMO_TARGET as string, data: CALL as string, value: '0.001' });
  const [showCustom, setShowCustom] = useState(false);

  const check = async (agent: string, target: string, data: string, value: string): Promise<Result> => {
    try {
      if (!client) throw new Error('AgentMandates is not configured on this deployment');
      if (!isAddress(agent) || !isAddress(target) || !isHex(data)) throw new Error('Agent and target must be 0x addresses and calldata must be hex');
      return await client.checkAction(BigInt(mandateId || '0'), agent, target, data, parseEther(value || '0'));
    } catch (e: any) {
      return { allowed: false, error: e.shortMessage || e.message };
    }
  };

  const runOne = async (sc: Scenario) => {
    setRunning(sc.id);
    const r = await check(sc.agent, sc.target, sc.data, sc.value);
    setResults((x) => ({ ...x, [sc.id]: r }));
    setRunning(null);
  };

  const runAll = async () => {
    setResults({});
    for (const sc of SCENARIOS) {
      setRunning(sc.id);
      const r = await check(sc.agent, sc.target, sc.data, sc.value);
      setResults((x) => ({ ...x, [sc.id]: r }));
      await new Promise((res) => setTimeout(res, 250));
    }
    setRunning(null);
  };

  const runCustom = async () => {
    setRunning('custom');
    const r = await check(custom.agent, custom.target, custom.data, custom.value);
    setResults((x) => ({ ...x, custom: r }));
    setRunning(null);
  };

  const done = SCENARIOS.filter((sc) => results[sc.id] && !results[sc.id].error);
  const asExpected = done.filter((sc) => results[sc.id].allowed === (sc.expect === 'allow')).length;
  const blocked = done.filter((sc) => !results[sc.id].allowed).length;
  const setC = (k: keyof typeof custom) => (e: React.ChangeEvent<HTMLInputElement>) => setCustom((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className={s.wrap}>
      <PageHead
        eyebrow="Verify an agent"
        icon={<ScanSearch size={13} />}
        title="Did a human actually authorize this agent?"
        sub="Before an API, merchant or protocol serves an agent, it can ask the chain. checkAction() runs the exact checks execute() would, as a free read. Nothing is sent and nothing is spent."
        actions={
          <button className="btn-primary" onClick={runAll} disabled={!!running || !client}>
            {running && running !== 'custom' ? <Loader2 size={16} className="animate-spin" /> : <Play size={15} fill="currentColor" />}
            Run all {SCENARIOS.length} checks
          </button>
        }
      />

      <div className={v.bar}>
        <div className={v.barField}>
          <label>Mandate ID</label>
          <input className={s.input} value={mandateId} onChange={(e) => setMandateId(e.target.value)} inputMode="numeric" />
        </div>
        <div className={v.barInfo}>
          <span><Bot size={14} /> Agent <b className={s.mono}>{DEMO_AGENT ? short(DEMO_AGENT) : 'not set'}</b></span>
          <span><Crosshair size={14} /> Allowed contract <b className={s.mono}>{short(DEMO_TARGET)}</b></span>
        </div>
        {done.length > 0 && (
          <div className={v.score}>
            <span className={v.scoreBig}>{asExpected}/{done.length}</span>
            <span className={v.scoreText}>
              verdicts as expected
              <br />
              <b>{blocked}</b> blocked on-chain
            </span>
          </div>
        )}
      </div>

      <div className={v.grid}>
        {SCENARIOS.map((sc) => {
          const r = results[sc.id];
          const Icon = sc.icon;
          const state = running === sc.id ? 'run' : !r ? 'idle' : r.error ? 'err' : r.allowed ? 'ok' : 'no';
          return (
            <div key={sc.id} className={`${v.case} ${v[state]}`}>
              <div className={v.caseTop}>
                <span className={v.caseIcon}><Icon size={18} /></span>
                <span className={v.expect}>expect {sc.expect === 'allow' ? 'allowed' : 'blocked'}</span>
              </div>
              <div className={v.caseTitle}>{sc.title}</div>
              <div className={v.caseDesc}>{sc.desc}</div>
              <div className={v.caseCall}>
                {short(sc.agent || '0x', 3)} → {short(sc.target, 3)} · {sc.value} MON
              </div>

              <div className={v.verdict}>
                {state === 'idle' && (
                  <button className={`${s.btnGhost} ${s.btnSm}`} style={{ width: '100%' }} onClick={() => runOne(sc)} disabled={!!running || !client}>
                    <ScanSearch size={14} /> checkAction()
                  </button>
                )}
                {state === 'run' && (
                  <div className={v.vRun}><Loader2 size={16} className="animate-spin" /> Asking Monad…</div>
                )}
                {state === 'ok' && (
                  <div className={v.vOk}>
                    <ShieldCheck size={20} />
                    <div>
                      <b>ALLOWED</b>
                      <span>A live, passkey-signed mandate covers this call.</span>
                    </div>
                  </div>
                )}
                {state === 'no' && (
                  <div className={v.vNo}>
                    <ShieldX size={20} />
                    <div>
                      <b>BLOCKED</b>
                      <code className={v.reason}>{r!.reason}</code>
                      <span>{REASONS[r!.reason || ''] || 'The contract would revert this call.'}</span>
                    </div>
                  </div>
                )}
                {state === 'err' && <div className={v.vErr}>{r!.error}</div>}
              </div>
              {r && !r.error && (
                <button className={v.rerun} onClick={() => runOne(sc)} disabled={!!running}>
                  Run again
                </button>
              )}
            </div>
          );
        })}
      </div>

      <section className={s.card}>
        <button type="button" className={v.customHead} onClick={() => setShowCustom((x) => !x)} aria-expanded={showCustom}>
          <span className={s.cardTitle}>
            <SlidersHorizontal size={18} /> Check any call
          </span>
          <span className={v.customHint}>{showCustom ? 'Hide' : 'Agent, target, calldata, value'}</span>
        </button>
        {showCustom && (
          <div className={s.reveal}>
            <div className={s.fields}>
              <div className={`${s.field} ${s.full}`}>
                <label>Agent wallet</label>
                <input className={`${s.input} ${s.monoInput}`} value={custom.agent} onChange={setC('agent')} placeholder="0x…" />
              </div>
              <div className={`${s.field} ${s.full}`}>
                <label>Target</label>
                <input className={`${s.input} ${s.monoInput}`} value={custom.target} onChange={setC('target')} />
              </div>
              <div className={s.field}>
                <label>Calldata</label>
                <input className={`${s.input} ${s.monoInput}`} value={custom.data} onChange={setC('data')} />
              </div>
              <div className={s.field}>
                <label>Value (MON)</label>
                <input className={s.input} value={custom.value} onChange={setC('value')} inputMode="decimal" />
              </div>
            </div>
            <div className={s.btnRow}>
              <button className={s.btn} onClick={runCustom} disabled={!!running}>
                <ScanSearch size={15} /> checkAction()
              </button>
            </div>
            {results.custom &&
              (results.custom.error ? (
                <div className={s.noticeErr}>{results.custom.error}</div>
              ) : (
                <div className={results.custom.allowed ? s.verdictOk : s.verdictNo}>
                  {results.custom.allowed ? <CheckCircle2 size={18} /> : <ShieldX size={18} />}
                  {results.custom.allowed
                    ? 'Authorized by a live, passkey-signed mandate'
                    : `Not authorized: ${results.custom.reason}. ${REASONS[results.custom.reason || ''] || ''}`}
                </div>
              ))}
          </div>
        )}
      </section>

      <div className={v.footnote}>
        <Info size={14} />
        <span>
          These are reads against the deployed AgentMandates contract. In Judge Mode the same blocked calls are sent as real
          transactions so the reverts are on the explorer.
        </span>
      </div>
    </div>
  );
}
