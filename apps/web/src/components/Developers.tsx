'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  Code2,
  Copy,
  Check,
  Fingerprint,
  Server,
  ShieldCheck,
  Bot,
  ScanSearch,
  ArrowRight,
  ExternalLink,
  Github,
  FileText,
} from 'lucide-react';
import { AGENT_MANDATES_ADDRESS, EXPLORER } from '../lib/agentMandates';
import { DEFAULT_ERC8004_REGISTRY, DEFAULT_MANDATE_MANAGER_ADDRESS } from '../lib/contracts';
import { PageHead } from './PageHead';
import s from './PasskeyConsole.module.css';
import d from './Developers.module.css';

const REPO = 'https://github.com/gnshx/monad-hackathon';

const SNIPPETS: Record<'mcp' | 'sdk' | 'sol', { label: string; code: string; note: React.ReactNode }> = {
  mcp: {
    label: 'MCP (Claude, Cursor)',
    code: `{
  "mcpServers": {
    "agenttrust": {
      "command": "node",
      "args": ["/absolute/path/to/monad-hackathon/packages/mcp/dist/index.js"],
      "env": {
        "AGENTTRUST_CONTRACT": "${AGENT_MANDATES_ADDRESS || '0x…'}",
        "AGENTTRUST_MANDATE_ID": "<your mandate id>",
        "AGENT_PRIVATE_KEY": "0x… (the agent's hot key)"
      }
    }
  }
}`,
    note: (
      <>
        The MCP server is not on npm. Clone <code>github.com/gnshx/monad-hackathon</code>, run{' '}
        <code>npm install &amp;&amp; npm run build:mcp</code>, and point <code>args</code> at that path. Use the ID of a mandate
        you granted to this agent wallet on Passkey Mandates. The agent gets mandate_status, check_action, execute_action and
        pay_token tools. Even a prompt-injected model can only spend what the passkey approved.
      </>
    ),
  },
  sdk: {
    label: 'TypeScript',
    code: `// @agenttrust/sdk is packages/sdk in this repo, not the npm package of that name.
// git clone https://github.com/gnshx/monad-hackathon && npm install && npm run build:sdk
import { AgentMandates } from '@agenttrust/sdk';

const mandates = new AgentMandates(address, publicClient, agentWallet);

// Same rules as the contract; returns e.g. { allowed: false, reason: 'ExceedsBudget' }
await mandates.checkAction(mandateId, agent, target, data, value);

// Executes through the contract; throws MandateDeniedError before spending gas
await mandates.execute(mandateId, target, data, value);`,
    note: (
      <>
        The SDK is not published on npm, and <code>npm install @agenttrust/sdk</code> fetches an unrelated package. Use it from a
        clone of this repo. Owner side: createChallenge() → signWithBrowserPasskey() → encode.createMandate() → any relayer.
      </>
    ),
  },
  sol: {
    label: 'Solidity',
    code: `interface IAgentMandates {
  function checkAction(uint256 mandateId, address agent, address target,
                       bytes calldata data, uint256 value)
    external view returns (bool allowed, bytes4 reason);
}

// In your protocol: only serve agent calls a human authorized.
// AgentMandates.execute() has already checked the allowlist, per-call cap,
// budget, expiry and ERC-8004 identity, and paid from the vault, before it
// calls you. Inside that call msg.sender is AgentMandates, not the agent.
require(msg.sender == address(mandates), "route through AgentMandates.execute");`,
    note: (
      <>
        Composable: any contract on Monad can accept agent traffic only when it arrives through a live human mandate.
        checkAction() takes the agent address explicitly, so use it as a free pre-flight from an app, a relayer or another
        contract. It does not spend budget, so it is not a gate on msg.sender inside your protocol.
      </>
    ),
  },
};

const FLOW = [
  { icon: Fingerprint, title: 'Owner passkey', text: 'WebAuthn assertion over the mandate terms, chain ID, contract and nonce' },
  { icon: Server, title: 'Any relayer', text: 'Submits and pays gas. Holds no authority, cannot alter terms' },
  { icon: ShieldCheck, title: 'AgentMandates', text: 'P-256 precompile verifies the passkey, stores limits, holds the vault' },
  { icon: Bot, title: 'Agent execute()', text: 'ERC-8004 identity, allowlist, per-call cap, budget, expiry checked every call' },
  { icon: ScanSearch, title: 'checkAction()', text: 'Free view any app or contract can call before serving the agent' },
];

/** Check order in AgentMandates.sol: checkAction()/execute() and checkPayment()/payToken(). */
const CHECKS: [string, string[]][] = [
  ['Mandate exists', ['MandateNotFound']],
  ['Caller is the mandated agent', ['NotAgent']],
  ['Mandate not revoked or expired', ['MandateInactive']],
  ['ERC-8004 identity still resolves to that agent', ['AgentIdentityMismatch']],
  ['execute(): target is not a vault token. payToken(): token has a budget on this mandate', ['TargetIsVaultToken', 'TokenNotAllowed']],
  ['Target + function on the signed allowlist (payToken: payee signed for any function)', ['PermissionDenied']],
  ['Value within the per-call cap', ['ExceedsPerCallLimit']],
  ['Total spend within budget', ['ExceedsBudget']],
  ['Vault holds enough to pay', ['InsufficientBalance']],
];

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={d.copy}
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      aria-label="Copy"
    >
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? 'Copied' : 'Copy'}
    </button>
  );
}

export function Developers() {
  const [tab, setTab] = useState<keyof typeof SNIPPETS>('mcp');
  const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;
  const contracts: [string, string, string][] = [
    ['AgentMandates (passkey-native)', AGENT_MANDATES_ADDRESS || '', 'The product: passkey-owned mandates. Judge Mode runs here.'],
    ['ERC-8004 Identity Registry', DEFAULT_ERC8004_REGISTRY, 'Agent identities checked on every call'],
    ['MandateManager (v1)', DEFAULT_MANDATE_MANAGER_ADDRESS, 'Wallet-owned predecessor, used by the Lab pages'],
  ];

  return (
    <div className={s.wrap}>
      <PageHead
        eyebrow="Developers"
        icon={<BookOpen size={13} />}
        title="Give any agent a mandate in five minutes."
        sub="One contract, one SDK, one MCP server. Agents get spending tools that cannot exceed what a human signed, and every app on Monad can check that authority with a single view call."
        actions={
          <a className="btn-secondary" href={REPO} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <Github size={15} /> Source on GitHub
          </a>
        }
      />

      <section className={s.card}>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>
            <ShieldCheck size={18} /> How a mandate flows
          </span>
        </div>
        <div className={d.flow}>
          {FLOW.map((f, i) => {
            const Icon = f.icon;
            return (
              <React.Fragment key={f.title}>
                <div className={d.node}>
                  <span className={d.nodeIcon}><Icon size={18} /></span>
                  <span className={d.nodeTitle}>{f.title}</span>
                  <span className={d.nodeText}>{f.text}</span>
                </div>
                {i < FLOW.length - 1 && <ArrowRight className={d.arrow} size={16} />}
              </React.Fragment>
            );
          })}
        </div>
      </section>

      <div className={d.split}>
        <section className={s.card}>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>
              <Code2 size={18} /> Plug it in
            </span>
            <CopyBtn text={SNIPPETS[tab].code} />
          </div>
          <div className={s.tabs}>
            {(Object.keys(SNIPPETS) as (keyof typeof SNIPPETS)[]).map((k) => (
              <button key={k} className={`${s.tab} ${tab === k ? s.tabOn : ''}`} onClick={() => setTab(k)}>
                {SNIPPETS[k].label}
              </button>
            ))}
          </div>
          <pre className={s.code}>{SNIPPETS[tab].code}</pre>
          <p className={s.codeNote}>{SNIPPETS[tab].note}</p>
        </section>

        <section className={s.card}>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>
              <ShieldCheck size={18} /> What the contract checks
            </span>
          </div>
          <p className={s.cardSub}>On every execute() and payToken(), in this order. checkAction() and checkPayment() return the first failing reason without reverting.</p>
          <ol className={d.checks}>
            {CHECKS.map(([k, codes], i) => (
              <li key={codes[0]}>
                <span className={d.checkNum}>{i + 1}</span>
                <span className={d.checkText}>{k}</span>
                <span className={d.checkCodes}>
                  {codes.map((r) => (
                    <code key={r} className={d.checkCode}>{r}</code>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className={s.card}>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>
            <Server size={18} /> Deployment · Monad Testnet (10143)
          </span>
        </div>
        <div className={d.table}>
          {contracts.map(([name, addr, note]) => (
            <div key={name} className={d.row}>
              <div>
                <div className={d.rowName}>{name}</div>
                <div className={d.rowNote}>{note}</div>
              </div>
              {addr ? (
                <a className={d.addr} href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer">
                  {short(addr)} <ExternalLink size={11} />
                </a>
              ) : (
                <span className={d.addr}>not configured</span>
              )}
            </div>
          ))}
          <div className={d.row}>
            <div>
              <div className={d.rowName}>P-256 verifier</div>
              <div className={d.rowNote}>Monad precompile (RIP-7212 interface)</div>
            </div>
            <span className={d.addr}>0x…0100</span>
          </div>
          <div className={d.row}>
            <div>
              <div className={d.rowName}>RPC</div>
              <div className={d.rowNote}>Chain ID 10143</div>
            </div>
            <span className={d.addr}>testnet-rpc.monad.xyz</span>
          </div>
        </div>
      </section>

      <div className={d.docs}>
        {[
          ['Security model', 'Threats, trust assumptions, what a relayer can and cannot do', 'docs/security.md'],
          ['Adoption guide', 'Integrate as an agent framework, an API, or a protocol', 'docs/adoption.md'],
          ['Deploy your own', 'Contracts, relayer and console env vars', 'docs/deploy.md'],
        ].map(([t, x, path]) => (
          <a key={t} className={s.nextCard} href={`${REPO}/blob/main/${path}`} target="_blank" rel="noreferrer">
            <span className={s.nextIcon}><FileText size={18} /></span>
            <span>
              <span className={s.nextTitle} style={{ display: 'block' }}>{t}</span>
              <span className={s.nextText} style={{ display: 'block' }}>{x}</span>
            </span>
            <ExternalLink size={15} className={s.nextArrow} />
          </a>
        ))}
      </div>
    </div>
  );
}
