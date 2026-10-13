'use client';

import React, { useEffect, useState } from 'react';
import {
  Fingerprint,
  Gavel,
  ScanSearch,
  ArrowRight,
  ShieldCheck,
  ShieldX,
  Bot,
  KeyRound,
  Cpu,
  BadgeCheck,
  Siren,
  Check,
  Minus,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { formatEther } from 'viem';
import { AGENT_MANDATES_ADDRESS, EXPLORER } from '../lib/agentMandates';
import type { NavTab } from './Sidebar';
import h from './Home.module.css';

/** Illustrative feed for the hero card. It loops the same decisions the contract makes in Judge Mode. */
const FEED = [
  { ok: true, what: 'doSomething() · 0.005 MON', why: 'Within per-call cap' },
  { ok: false, what: 'doSomething() · 0.50 MON', why: 'ExceedsPerCallLimit' },
  { ok: true, what: 'pay 10 USDC → api.weather', why: 'Within token budget' },
  { ok: false, what: 'transfer() → 0xdEaD…', why: 'PermissionDenied' },
  { ok: false, what: 'call from 0x91c4… (stranger)', why: 'NotAgent' },
  { ok: true, what: 'doSomething() · 0.004 MON', why: 'Within budget' },
];

function short(a: string, n = 4) {
  return a ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : '';
}

export function HomeView({ onNavigate }: { onNavigate: (tab: NavTab) => void }) {
  const [tick, setTick] = useState(0);
  const [relay, setRelay] = useState<{ enabled: boolean; balanceWei?: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1800);
    fetch('/api/relay')
      .then((r) => r.json())
      .then(setRelay)
      .catch(() => setRelay({ enabled: false }));
    return () => clearInterval(t);
  }, []);

  const visible = Array.from({ length: 4 }, (_, i) => ({ ...FEED[(tick + i) % FEED.length], key: tick + i })).reverse();
  const spentPct = 18 + ((tick * 7) % 46);

  return (
    <div className={h.wrap}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className={h.hero}>
        <div className={h.heroCopy}>
          <span className={h.kicker}>
            <span className={h.kickerDot} /> Live on Monad Testnet · P-256 precompile · ERC-8004
          </span>
          <h1 className={h.title}>
            Give your AI agent <span className={h.grad}>a budget</span>, not your keys.
          </h1>
          <p className={h.lede}>
            AgentTrust turns a Face ID tap into an on-chain spending mandate. The agent can only call what you allowed, up
            to the limits you set, until you revoke it. No wallet, no seed phrase, no gas.
          </p>
          <div className={h.ctas}>
            <button className="btn-primary" style={{ padding: '0.8rem 1.3rem', fontSize: '0.95rem' }} onClick={() => onNavigate('passkey')}>
              <Fingerprint size={18} /> Try it with your passkey
            </button>
            <button className="btn-secondary" style={{ padding: '0.8rem 1.2rem', fontSize: '0.95rem' }} onClick={() => onNavigate('judge')}>
              <Gavel size={17} /> Run Judge Mode
            </button>
          </div>
          <div className={h.trust}>
            <span><Check size={14} /> Owner needs no wallet</span>
            <span><Check size={14} /> Revoke in one tap</span>
            <span><Check size={14} /> Verifiable by anyone</span>
          </div>
        </div>

        {/* Mandate card visual */}
        <div className={h.visual} aria-hidden>
          <div className={h.glow} />
          <div className={h.mcard}>
            <div className={h.mcardTop}>
              <div className={h.mcardWho}>
                <span className={h.avatar}><Bot size={18} /></span>
                <div>
                  <div className={h.mcardName}>Research agent</div>
                  <div className={h.mcardSub}>ERC-8004 #2306 · 0x763F…3243</div>
                </div>
              </div>
              <span className={h.livePill}><span className={h.liveDot} /> ACTIVE</span>
            </div>

            <div className={h.limits}>
              <div><span>Per call</span><b>0.01 MON</b></div>
              <div><span>Budget</span><b>0.05 MON</b></div>
              <div><span>Expires</span><b>7 days</b></div>
            </div>

            <div className={h.meterRow}>
              <span>Spent</span>
              <span className={h.meterVal}>{spentPct}%</span>
            </div>
            <div className={h.meter}><div className={h.meterFill} style={{ width: `${spentPct}%` }} /></div>

            <div className={h.feedHead}>Agent calls, checked on-chain</div>
            <div className={h.feed}>
              {visible.map((f) => (
                <div key={f.key} className={`${h.feedRow} ${f.ok ? h.ok : h.no}`}>
                  {f.ok ? <ShieldCheck size={15} /> : <ShieldX size={15} />}
                  <span className={h.feedWhat}>{f.what}</span>
                  <span className={h.feedWhy}>{f.ok ? 'ALLOWED' : f.why}</span>
                </div>
              ))}
            </div>

            <div className={h.signedBy}>
              <Fingerprint size={14} /> Signed with a passkey · verified by Monad P-256 precompile
            </div>
          </div>
        </div>
      </section>

      {/* ── Proof strip ───────────────────────────────────────── */}
      <section className={h.strip}>
        <div className={h.stat}>
          <span className={h.statIcon}><Cpu size={17} /></span>
          <div><b>0x0100</b><span>RIP-7212 P-256 precompile verifies every passkey signature</span></div>
        </div>
        <div className={h.stat}>
          <span className={h.statIcon}><BadgeCheck size={17} /></span>
          <div><b>ERC-8004</b><span>Agent identity re-checked on every single execute()</span></div>
        </div>
        <div className={h.stat}>
          <span className={h.statIcon}><Siren size={17} /></span>
          <div><b>1 tap</b><span>Revoke one mandate, or every mandate a passkey issued</span></div>
        </div>
        <div className={h.stat}>
          <span className={h.statIcon}><Zap size={17} /></span>
          <div><b>0 gas</b><span>Any relayer submits; it can delay an action, never forge one</span></div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section>
        <div className={h.sectionHead}>
          <span className="page-eyebrow">How it works</span>
          <h2 className={h.h2}>Three moves. The chain does the rest.</h2>
        </div>
        <div className={h.how}>
          {[
            {
              n: '01',
              icon: <Fingerprint size={20} />,
              t: 'Sign a mandate with your passkey',
              d: 'Pick the contracts and functions, a per-call cap, a total budget and an expiry. One biometric prompt signs it, a relayer submits it.',
            },
            {
              n: '02',
              icon: <Bot size={20} />,
              t: 'The agent acts inside the box',
              d: 'Every call goes through AgentMandates. Wrong target, wrong function, over the cap, wrong agent or revoked: it reverts.',
            },
            {
              n: '03',
              icon: <ScanSearch size={20} />,
              t: 'Anyone can verify authority',
              d: 'APIs, merchants and protocols call checkAction() before serving an agent. A human either authorized it or they did not.',
            },
          ].map((s) => (
            <div key={s.n} className={h.howCard}>
              <div className={h.howTop}>
                <span className={h.howIcon}>{s.icon}</span>
                <span className={h.howNum}>{s.n}</span>
              </div>
              <div className={h.howTitle}>{s.t}</div>
              <p className={h.howText}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Comparison ───────────────────────────────────────── */}
      <section className={h.compareWrap}>
        <div className={h.sectionHead}>
          <span className="page-eyebrow">Why it matters</span>
          <h2 className={h.h2}>Agents today get the keys to the house.</h2>
          <p className={h.sectionSub}>
            Handing an agent a private key means a single prompt injection can drain everything. AgentTrust gives it a
            scoped, revocable, auditable allowance instead.
          </p>
        </div>
        <div className={h.tableScroll}>
          <table className={h.table}>
            <thead>
              <tr>
                <th />
                <th>Agent holds a hot key</th>
                <th className={h.us}>AgentTrust mandate</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Owner needs a wallet or seed phrase', 'Yes', 'No, a passkey', false],
                ['Spend limited per call and in total', 'No', 'Enforced on-chain', true],
                ['Only approved contracts and functions', 'No', 'Allowlist per mandate', true],
                ['Agent identity checked (ERC-8004)', 'No', 'On every execute()', true],
                ['Stop a rogue agent', 'Move funds, rotate key', 'One tap, one tx', true],
                ['Third parties can verify authority', 'No', 'checkAction() view', true],
              ].map(([k, a, b]) => (
                <tr key={k as string}>
                  <td>{k}</td>
                  <td className={h.them}><Minus size={13} /> {a}</td>
                  <td className={h.usCell}><Check size={14} /> {b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Paths ───────────────────────────────────────────── */}
      <section className={h.paths}>
        <button className={`${h.path} ${h.pathMain}`} onClick={() => onNavigate('judge')}>
          <span className={h.pathIcon}><Gavel size={20} /></span>
          <span className={h.pathTitle}>Judging? Start here</span>
          <span className={h.pathText}>One click runs six real transactions on Monad. Three go through, three are blocked by the contract, and each has an explorer link.</span>
          <span className={h.pathGo}>Run Judge Mode <ArrowRight size={15} /></span>
        </button>
        <button className={h.path} onClick={() => onNavigate('passkey')}>
          <span className={h.pathIcon}><KeyRound size={20} /></span>
          <span className={h.pathTitle}>Grant a real mandate</span>
          <span className={h.pathText}>Create a passkey on this device, sign a mandate and revoke it, all without a wallet.</span>
          <span className={h.pathGo}>Open console <ArrowRight size={15} /></span>
        </button>
        <button className={h.path} onClick={() => onNavigate('verify')}>
          <span className={h.pathIcon}><ScanSearch size={20} /></span>
          <span className={h.pathTitle}>Try to break it</span>
          <span className={h.pathText}>Throw overspends, rogue targets and impostor agents at a live mandate and watch the verdicts.</span>
          <span className={h.pathGo}>Verify an agent <ArrowRight size={15} /></span>
        </button>
      </section>

      {/* ── Live deployment ─────────────────────────────────── */}
      <section className={h.deploy}>
        <div className={h.deployItem}>
          <span className={h.deployLabel}>AgentMandates</span>
          {AGENT_MANDATES_ADDRESS ? (
            <a href={`${EXPLORER}/address/${AGENT_MANDATES_ADDRESS}`} target="_blank" rel="noreferrer" className={h.deployVal}>
              {short(AGENT_MANDATES_ADDRESS, 6)} <ExternalLink size={12} />
            </a>
          ) : (
            <span className={h.deployVal}>not configured</span>
          )}
        </div>
        <div className={h.deployItem}>
          <span className={h.deployLabel}>Network</span>
          <span className={h.deployVal}>Monad Testnet · 10143</span>
        </div>
        <div className={h.deployItem}>
          <span className={h.deployLabel}>Gas relayer</span>
          <span className={h.deployVal}>
            {relay === null
              ? 'checking…'
              : relay.enabled
              ? `online · ${Number(formatEther(BigInt(relay.balanceWei || '0'))).toLocaleString(undefined, { maximumFractionDigits: 3 })} MON`
              : 'off · any wallet can submit'}
          </span>
        </div>
        <div className={h.deployItem}>
          <span className={h.deployLabel}>Source</span>
          <a href="https://github.com/gnshx/monad-hackathon" target="_blank" rel="noreferrer" className={h.deployVal}>
            github.com/gnshx/monad-hackathon <ExternalLink size={12} />
          </a>
        </div>
      </section>
    </div>
  );
}
