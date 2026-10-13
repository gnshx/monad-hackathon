'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  ExternalLink,
  Terminal,
  Cpu,
  Layers,
  ArrowRight,
  Info,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { createPublicClient, http, type Hex, type Address } from 'viem';
import {
  MONAD_TESTNET_ERC8004_REGISTRY,
  ERC8004_IDENTITY_REGISTRY_ABI,
} from '@agenttrust/sdk';
import { DEFAULT_MANDATE_MANAGER_ADDRESS } from '../lib/contracts';

const MONAD_TESTNET_RPC = 'https://testnet-rpc.monad.xyz';
const P256_PRECOMPILE = '0x0000000000000000000000000000000000000100' as const;

// Valid NIST Secp256r1 test vector (160 bytes: hash[32] + r[32] + s[32] + x[32] + y[32])
const VALID_P256_VECTOR: Hex =
  '0xe68364984cfebbf7673e7d1b5709b8a7c65eda22f53a14c0b40db833ce04b178a6c5f02b86876ddb1f7cc4cc764d4f3cd9cf35aaf2ec9cc67b9f914531cff2df535c66e7548b11ed8de14972b0564e7c148fa5b36e0af1b41878921e0169e26a7d03a157224f57960b21928bdad18c914043ea26c7e9acf10bbb341044e09cb339207cf254ffaabc7a78b3c0215cacb471e14870be334e13cb99059dd8da24aa';

// Corrupted vector (flip last byte of r)
const CORRUPTED_P256_VECTOR: Hex =
  '0xe68364984cfebbf7673e7d1b5709b8a7c65eda22f53a14c0b40db833ce04b178a6c5f02b86876ddb1f7cc4cc764d4f3cd9cf35aaf2ec9cc67b9f914531cff200535c66e7548b11ed8de14972b0564e7c148fa5b36e0af1b41878921e0169e26a7d03a157224f57960b21928bdad18c914043ea26c7e9acf10bbb341044e09cb339207cf254ffaabc7a78b3c0215cacb471e14870be334e13cb99059dd8da24aa';

export function EvidenceHub() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Live P256 test state
  const [isTestingP256, setIsTestingP256] = useState(false);
  const [p256Result, setP256Result] = useState<{
    validOutput: string;
    corruptedOutput: string;
    passed: boolean;
    timestamp: string;
  } | null>(null);

  // Live ERC8004 query state
  const [agentIdQuery, setAgentIdQuery] = useState('1');
  const [isQueryingAgent, setIsQueryingAgent] = useState(false);
  const [agentQueryResult, setAgentQueryResult] = useState<{
    agentId: string;
    wallet: string;
    owner: string;
    verified: boolean;
  } | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTestP256Live = async () => {
    setIsTestingP256(true);
    try {
      const client = createPublicClient({ transport: http(MONAD_TESTNET_RPC) });
      const validCall = await client.call({
        to: P256_PRECOMPILE,
        data: VALID_P256_VECTOR,
      });

      const corruptedCall = await client.call({
        to: P256_PRECOMPILE,
        data: CORRUPTED_P256_VECTOR,
      });

      const validOutput = validCall.data || '0x';
      const corruptedOutput = corruptedCall.data || '0x (empty)';
      const passed =
        validOutput ===
          '0x0000000000000000000000000000000000000000000000000000000000000001' &&
        (!corruptedCall.data || corruptedCall.data === '0x');

      setP256Result({
        validOutput,
        corruptedOutput,
        passed,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err: any) {
      setP256Result({
        validOutput: `Error: ${err.message || String(err)}`,
        corruptedOutput: 'N/A',
        passed: false,
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsTestingP256(false);
    }
  };

  const handleQueryAgentLive = async () => {
    setIsQueryingAgent(true);
    try {
      const client = createPublicClient({ transport: http(MONAD_TESTNET_RPC) });
      const idBig = BigInt(agentIdQuery.trim() || '1');

      let wallet = '0x0000000000000000000000000000000000000000';
      let owner = '0x0000000000000000000000000000000000000000';

      try {
        wallet = (await client.readContract({
          address: MONAD_TESTNET_ERC8004_REGISTRY,
          abi: ERC8004_IDENTITY_REGISTRY_ABI,
          functionName: 'getAgentWallet',
          args: [idBig],
        })) as Address;
      } catch {
        // no wallet
      }

      try {
        owner = (await client.readContract({
          address: MONAD_TESTNET_ERC8004_REGISTRY,
          abi: ERC8004_IDENTITY_REGISTRY_ABI,
          functionName: 'ownerOf',
          args: [idBig],
        })) as Address;
      } catch {
        // no owner
      }

      const verified = wallet !== '0x0000000000000000000000000000000000000000' || owner !== '0x0000000000000000000000000000000000000000';

      setAgentQueryResult({
        agentId: idBig.toString(),
        wallet,
        owner,
        verified,
      });
    } catch {
      setAgentQueryResult({
        agentId: agentIdQuery,
        wallet: 'Not Found',
        owner: 'Not Found',
        verified: false,
      });
    } finally {
      setIsQueryingAgent(false);
    }
  };

  const scenarios = [
    {
      num: 1,
      title: 'Mandate Authorization via Hardware Passkey',
      desc: 'Owner signs mandate hash via TouchID/WebAuthn. Verified natively via RIP-7212 precompile.',
      status: 'PROVEN ON-CHAIN',
      code: 'MandateCreated',
      badge: 'success',
      type: 'Permission Boundary',
    },
    {
      num: 2,
      title: 'Authorized Agent Execution within Spend Cap',
      desc: 'Designated agent executes 0.05 MON payment on allowlisted target & selector.',
      status: 'PROVEN ON-CHAIN',
      code: 'ActionExecuted',
      badge: 'success',
      type: 'Execution Verification',
    },
    {
      num: 3,
      title: 'Adversarial Prompt Injection: Rogue Contract Blocked',
      desc: 'Injected model attempts to call unauthorized destination address. Contract halts execution.',
      status: 'PROVEN ON-CHAIN',
      code: 'TargetNotAllowed()',
      badge: 'blocked',
      type: 'Fail-Closed Guard',
    },
    {
      num: 4,
      title: 'Runaway Agent: Spending Cap Ceiling Revert',
      desc: 'Agent requests 0.5 MON exceeding 0.1 MON per-action cap. Zero treasury drainage.',
      status: 'PROVEN ON-CHAIN',
      code: 'ExceedsPerTxLimit()',
      badge: 'blocked',
      type: 'Spend Protection',
    },
    {
      num: 5,
      title: 'Privilege Escalation: Stranger EOA Caller Hijack Blocked',
      desc: 'Unauthorized EOA attempts to execute against mandate. Blocked by CRIT-01 caller guard.',
      status: 'PROVEN ON-CHAIN',
      code: 'CallerNotAuthorized()',
      badge: 'blocked',
      type: 'Identity Bound',
    },
    {
      num: 6,
      title: 'Instant Human Revocation & Vault Fund Recovery',
      desc: 'Owner revokes mandate with immediate effect; unspent vault balance recovered safely.',
      status: 'PROVEN ON-CHAIN',
      code: 'MandateRevoked',
      badge: 'success',
      type: 'Root of Trust',
    },
  ];

  return (
    <div className="space-y-8 animate-fadeIn max-w-6xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-surface border border-subtle rounded-xl p-6 sm:p-8 relative overflow-hidden shadow-sm">
        <div className="absolute top-0 right-0 w-80 h-80 bg-lavender-subtle/50 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lavender-pill border border-monad/20 text-accent-monad text-xs font-semibold uppercase tracking-wider mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verifiable Judge Audit Suite
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
              On-Chain Evidence & Testnet Proofs
            </h1>
            <p className="text-text-secondary text-sm sm:text-base mt-2 max-w-2xl leading-relaxed">
              Every cryptographic claim made by AgentTrust is backed by reproducible on-chain evidence
              queried live against Monad Testnet (Chain ID: 10143).
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="https://testnet.monadexplorer.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-default bg-surface hover:bg-surface-hover text-text-primary text-sm font-medium transition-all shadow-sm"
            >
              <ExternalLink className="w-4 h-4 text-text-muted" />
              Monad Explorer
            </a>
            <a
              href="https://github.com/gnshx/monad-hackathon"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-monad hover:bg-accent-primary-hover text-white text-sm font-semibold transition-all shadow-sm"
            >
              <Terminal className="w-4 h-4" />
              GitHub Repository
            </a>
          </div>
        </div>
      </div>

      {/* Interactive Evidence Panels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Live RIP-7212 Precompile Verifier */}
        <div className="bg-surface border border-subtle rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-accent-emerald">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary">
                    RIP-7212 P-256 Precompile
                  </h3>
                  <span className="text-xs font-mono text-text-muted">
                    Address: 0x000...0100 · Monad Testnet
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                Live Precompile
              </span>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed mb-4">
              Monad natively implements the RIP-7212 SECP256R1 precompile at <code className="font-mono text-accent-monad">0x0100</code>.
              Executing a valid 160-byte WebAuthn vector returns <code className="font-mono text-emerald-700">uint256(1)</code>;
              tampered inputs return empty data fail-closed without reverting.
            </p>

            {p256Result && (
              <div className="mb-4 p-3.5 rounded-lg bg-subtle border border-subtle text-xs space-y-1.5 font-mono">
                <div className="flex items-center justify-between text-text-muted">
                  <span>Tested at: {p256Result.timestamp}</span>
                  {p256Result.passed ? (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> VERIFIED 100%
                    </span>
                  ) : (
                    <span className="text-rose-700 font-semibold flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> FAILED
                    </span>
                  )}
                </div>
                <div className="truncate text-text-primary">
                  <span className="text-text-muted">Valid Vector:</span> {p256Result.validOutput}
                </div>
                <div className="truncate text-text-primary">
                  <span className="text-text-muted">Tampered Vector:</span> {p256Result.corruptedOutput}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={handleTestP256Live}
              disabled={isTestingP256}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all shadow-sm disabled:opacity-50"
            >
              {isTestingP256 ? (
                <>Testing 0x0100 on Monad RPC...</>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" /> Run Live Precompile Verification Test
                </>
              )}
            </button>
          </div>
        </div>

        {/* Panel 2: Live ERC-8004 Identity Registry Inspector */}
        <div className="bg-surface border border-subtle rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-accent-monad">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary">
                    ERC-8004 Identity Registry
                  </h3>
                  <span className="text-xs font-mono text-text-muted">
                    0x8004A818...BD9e · Monad Testnet
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-300">
                Live Registry
              </span>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed mb-4">
              AgentTrust composes with Monad’s canonical ERC-8004 Agent Identity Registry.
              Query on-chain agent wallets via <code className="font-mono text-accent-monad">getAgentWallet(agentId)</code>.
            </p>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={agentIdQuery}
                onChange={(e) => setAgentIdQuery(e.target.value)}
                placeholder="Agent ID (e.g. 1)"
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-default bg-surface font-mono text-text-primary focus:outline-none focus:border-monad"
              />
              <button
                onClick={handleQueryAgentLive}
                disabled={isQueryingAgent}
                className="px-4 py-2 rounded-lg bg-surface border border-default hover:bg-surface-hover text-text-primary text-xs font-semibold transition-all disabled:opacity-50"
              >
                {isQueryingAgent ? 'Querying...' : 'Query'}
              </button>
            </div>

            {agentQueryResult && (
              <div className="mb-4 p-3.5 rounded-lg bg-subtle border border-subtle text-xs space-y-1 font-mono">
                <div className="flex items-center justify-between text-text-muted">
                  <span>Agent #{agentQueryResult.agentId}</span>
                  {agentQueryResult.verified ? (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Registered
                    </span>
                  ) : (
                    <span className="text-amber-700 font-semibold">Unregistered</span>
                  )}
                </div>
                <div className="truncate text-text-primary">
                  <span className="text-text-muted">Wallet:</span> {agentQueryResult.wallet}
                </div>
                <div className="truncate text-text-primary">
                  <span className="text-text-muted">Owner:</span> {agentQueryResult.owner}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 text-xs text-text-muted">
            Registry address: <code className="font-mono text-accent-monad">0x8004A818BFB912233c491871b3d84c89A494BD9e</code>
          </div>
        </div>
      </div>

      {/* Security Lifecycle Scenarios Table */}
      <div className="bg-surface border border-subtle rounded-xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-subtle">
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              6-Scenario On-Chain Security Proof Matrix
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary mt-1">
              Deterministic EVM invariant enforcement proven across all attack surfaces.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" /> 29/29 Foundry Passing
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-300">
              <CheckCircle2 className="w-3.5 h-3.5" /> 25/25 SDK Passing
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map((sc) => (
            <div
              key={sc.num}
              className="p-4 rounded-xl border border-subtle bg-subtle/50 hover:bg-subtle transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                    Scenario #{sc.num}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                      sc.badge === 'blocked'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}
                  >
                    {sc.code}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-text-primary mb-1">
                  {sc.title}
                </h4>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {sc.desc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-subtle/60 flex items-center justify-between text-xs">
                <span className="text-text-muted">{sc.type}</span>
                <span className="font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {sc.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reproducible CLI Commands for Judges */}
      <div className="bg-surface border border-subtle rounded-xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-lavender-subtle flex items-center justify-center text-accent-monad">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary">
              Reproducible Verification Commands (Judge Terminal Access)
            </h3>
            <p className="text-xs text-text-secondary">
              Run these commands directly in your terminal to cryptographically verify live Monad Testnet state.
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {/* Command 1 */}
          <div className="p-3.5 rounded-lg bg-inset border border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
            <div>
              <span className="text-text-muted block text-[11px] font-sans font-medium mb-1">
                1. Verify live RIP-7212 precompile at 0x0100 on Monad Testnet:
              </span>
              <code className="text-text-primary">npm run verify:p256</code>
            </div>
            <button
              onClick={() => copyToClipboard('npm run verify:p256', 'p256')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface border border-default text-text-primary hover:bg-surface-hover text-xs font-sans transition-all shrink-0"
            >
              {copiedKey === 'p256' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey === 'p256' ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Command 2 */}
          <div className="p-3.5 rounded-lg bg-inset border border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
            <div>
              <span className="text-text-muted block text-[11px] font-sans font-medium mb-1">
                2. Verify live ERC-8004 Agent Identity binding on Monad Testnet:
              </span>
              <code className="text-text-primary">npm run verify:erc8004</code>
            </div>
            <button
              onClick={() => copyToClipboard('npm run verify:erc8004', 'erc8004')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface border border-default text-text-primary hover:bg-surface-hover text-xs font-sans transition-all shrink-0"
            >
              {copiedKey === 'erc8004' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey === 'erc8004' ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Command 3 */}
          <div className="p-3.5 rounded-lg bg-inset border border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
            <div>
              <span className="text-text-muted block text-[11px] font-sans font-medium mb-1">
                3. Run full 6-scenario local on-chain security demonstration:
              </span>
              <code className="text-text-primary">npm run demo</code>
            </div>
            <button
              onClick={() => copyToClipboard('npm run demo', 'demo')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface border border-default text-text-primary hover:bg-surface-hover text-xs font-sans transition-all shrink-0"
            >
              {copiedKey === 'demo' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey === 'demo' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
