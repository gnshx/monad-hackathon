'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  AlertTriangle,
} from 'lucide-react';
import { encodeFunctionData, formatEther, isAddress, isHex, parseEther, type Address, type Hex } from 'viem';
import { ANY_SELECTOR } from '@agenttrust/sdk';
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
const TRANSFER_CALL = encodeFunctionData({ abi: TARGET_ABI, functionName: 'transfer', args: [DEAD, 1n] });
const sel = (data: Hex) => data.slice(0, 10).toLowerCase();

/** Names for selectors the demo target knows; anything else is shown as its 4-byte selector. */
const KNOWN_FNS: Record<string, string> = { [sel(CALL)]: 'doSomething()', [sel(TRANSFER_CALL)]: 'transfer()' };
const fnLabel = (selector: string) => KNOWN_FNS[selector.toLowerCase()] || selector;

/** Calls the 'Wrong function' card tries, in order, until one is not on the mandate's allowlist. */
const OFF_LIST_CALLS: Hex[] = [TRANSFER_CALL, CALL, `0x12345678${'0'.repeat(64)}`];

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

/** The mandate under test, as read from chain (or the demo defaults when the read fails). */
type Subject = {
  agent: Address;
  target: Address;
  okValue: string;
  /** isActive() result; null when the mandate could not be read. */
  live: boolean | null;
  /** False when the chain says no mandate has this ID. */
  found: boolean;
  source: 'chain' | 'demo';
  /** Selectors the owner signed for `target`; empty when unknown. */
  selectors: Hex[];
  /** The owner signed ANY_SELECTOR for `target`, so every function on it is allowed. */
  anyFn: boolean;
};

function buildScenarios(sub: Subject): Scenario[] {
  const { agent, target, okValue } = sub;
  const signed = sub.selectors.filter((x) => x !== ANY_SELECTOR).map((x) => x.toLowerCase());
  // 'Normal call' uses a function the owner actually signed. checkAction() only reads the first 4 bytes.
  const okSel = sub.anyFn ? undefined : signed[0];
  const okData: Hex = !okSel || okSel === sel(CALL) ? CALL : (`${okSel}${'0'.repeat(64)}` as Hex);
  const okDesc = okSel
    ? `Agent calls ${fnLabel(okSel)}, the function the owner signed, inside every limit`
    : sub.anyFn
    ? 'Agent calls doSomething() on the allowed contract, inside every limit'
    : 'Agent calls the allowed function, inside every limit';
  // 'Wrong function' uses a function the owner did not sign for this contract.
  const offData = OFF_LIST_CALLS.find((d) => !signed.includes(sel(d))) || OFF_LIST_CALLS[OFF_LIST_CALLS.length - 1];
  // A missing, revoked or expired mandate refuses every call.
  const usable = sub.found && sub.live !== false;
  const allowIfUsable = usable ? 'allow' : 'deny';
  const fnCase: Scenario = sub.anyFn
    ? { id: 'fn', title: 'Any function', desc: `The owner signed any function on this contract, so ${fnLabel(sel(offData))} is allowed too`, icon: FunctionSquare, expect: allowIfUsable, agent, target, data: offData, value: '0' }
    : { id: 'fn', title: 'Wrong function', desc: `Allowed contract, but ${fnLabel(sel(offData))}, a function the owner did not sign`, icon: FunctionSquare, expect: 'deny', agent, target, data: offData, value: '0' };
  return [
    { id: 'ok', title: 'Normal call', desc: okDesc, icon: Bot, expect: allowIfUsable, agent, target, data: okData, value: okValue },
    { id: 'overspend', title: 'Overspend', desc: 'Same call, but tries to send 1 MON', icon: Flame, expect: 'deny', agent, target, data: okData, value: '1' },
    { id: 'rogue', title: 'Rogue target', desc: 'Prompt-injected agent sends funds to 0x…dEaD', icon: Crosshair, expect: 'deny', agent, target: DEAD, data: '0x', value: '0.001' },
    fnCase,
    { id: 'stranger', title: 'Impostor agent', desc: 'A different wallet tries to use the mandate', icon: UserX, expect: 'deny', agent: STRANGER, target, data: okData, value: '0' },
  ];
}

export const LAST_MANDATE_KEY = 'agenttrust.lastMandate';

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
  const [subject, setSubject] = useState<Subject>({
    agent: DEMO_AGENT,
    target: DEMO_TARGET,
    okValue: '0',
    live: null,
    found: true,
    source: 'demo',
    selectors: [],
    anyFn: false,
  });

  // Prefer the mandate this browser just granted on the Passkey page.
  useEffect(() => {
    try {
      const last = JSON.parse(localStorage.getItem(LAST_MANDATE_KEY) || 'null');
      if (last?.id) setMandateId(String(last.id));
    } catch {}
  }, []);

  // Read the mandate under test so the scenarios use its real agent, target and limits.
  useEffect(() => {
    if (!client || !/^\d+$/.test(mandateId)) return;
    let stale = false;
    (async () => {
      try {
        const id = BigInt(mandateId);
        const [m, perms, active] = await Promise.all([client.getMandate(id), client.getPermissions(id), client.isActive(id)]);
        if (stale) return;
        // getMandate() returns an all-zero struct for an ID that was never created.
        const found = !/^0x0*$/i.test(m.ownerKey);
        const perm = perms.find((p) => p.selector !== ANY_SELECTOR) || perms[0];
        const target = (perm?.target || DEMO_TARGET) as Address;
        const selectors = perms.filter((p) => p.target.toLowerCase() === target.toLowerCase()).map((p) => p.selector);
        let ok = m.maxPerCall;
        if (m.budget - m.spent < ok) ok = m.budget - m.spent;
        if (m.balance < ok) ok = m.balance;
        ok = ok / 2n;
        setSubject({
          agent: m.agent,
          target,
          okValue: formatEther(ok),
          live: active,
          found,
          source: 'chain',
          selectors,
          anyFn: selectors.includes(ANY_SELECTOR),
        });
        setResults({});
      } catch {
        if (!stale) setSubject((x) => ({ ...x, live: null, found: true, source: 'demo' }));
      }
    })();
    return () => {
      stale = true;
    };
  }, [client, mandateId]);

  const SCENARIOS = useMemo(() => buildScenarios(subject), [subject]);

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
          <span><Bot size={14} /> Agent <b className={s.mono}>{subject.found && subject.agent ? short(subject.agent) : 'not set'}</b></span>
          <span><Crosshair size={14} /> Allowed contract <b className={s.mono}>{subject.found ? short(subject.target) : 'none'}</b></span>
          {!subject.found ? (
            <span className={v.liveNo}>Mandate does not exist</span>
          ) : (
            subject.live !== null && (
              <span className={subject.live ? v.liveOk : v.liveNo}>{subject.live ? 'Mandate active' : 'Mandate revoked or expired'}</span>
            )
          )}
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

      {!subject.found ? (
        <div className={s.notice} style={{ marginTop: 0 }}>
          <AlertTriangle size={16} />
          <span>
            There is no mandate #{mandateId} on this contract, so every check returns <code>MandateNotFound</code>. Grant one on{' '}
            <a href="#passkey">Passkey Mandates</a> and it will show up here automatically.
          </span>
        </div>
      ) : (
        subject.live === false && (
          <div className={s.notice} style={{ marginTop: 0 }}>
            <AlertTriangle size={16} />
            <span>
              Mandate #{mandateId} is revoked or expired. The contract now refuses every call from its agent with{' '}
              <code>MandateInactive</code>. The impostor check still says <code>NotAgent</code>, because the agent check runs
              first. Grant a fresh one on <a href="#passkey">Passkey Mandates</a> and it will show up here automatically.
            </span>
          </div>
        )
      )}

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
          These are free reads against the deployed AgentMandates contract. Judge Mode sends an overspend, a rogue target and a
          call after revoke as real transactions, so those reverts are on the explorer.
        </span>
      </div>
    </div>
  );
}
