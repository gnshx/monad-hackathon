'use client';

import React, { useState, useEffect } from 'react';
import {
  Gavel,
  Play,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Coins,
  AlertCircle,
  Timer,
  FileSignature,
  Ban,
  Crosshair,
  Undo2,
  Bot,
} from 'lucide-react';
import type { JudgeStepResult } from '@/lib/judge-mode-runner';
import { PageHead } from './PageHead';
import j from './Judge.module.css';

interface JudgeStatus {
  deployed: boolean;
  chainId: number;
  contracts: {
    mandateManager: string;
    mockTarget: string;
  };
  version?: 'v1' | 'v2';
  rpcError?: boolean;
  agentMandates?: string;
  relayerAddress?: string;
  relayerBalance?: string;
  requiredBalance?: string;
  lowFunds: boolean;
  isRateLimited?: boolean;
  retryAfterSeconds?: number;
  message?: string;
}

/** The fixed scenario the server runs, in order (see lib/judge-mode-runner.ts). */
const PLAN = [
  { icon: FileSignature, name: 'Create mandate', text: "A fresh P-256 passkey signs a WebAuthn mandate and Monad's precompile verifies it: 0.0001 MON per call, one function, 1 hour", expect: 'success' },
  { icon: Bot, name: 'Allowed call', text: 'The ERC-8004 agent spends 0.00005 MON on the one function it was granted', expect: 'success' },
  { icon: Ban, name: 'Overspend', text: 'The agent tries 0.001 MON, 10x the per-call cap', expect: 'reverted' },
  { icon: Crosshair, name: 'Rogue target', text: 'The agent calls a contract the passkey never granted', expect: 'reverted' },
  { icon: Undo2, name: 'Owner revokes', text: 'The same passkey signs a revoke and the relayer submits it', expect: 'success' },
  { icon: ShieldAlert, name: 'Call after revoke', text: 'The agent retries the call that worked in step 2', expect: 'reverted' },
] as const;

function fmtBalance(b?: string) {
  if (!b) return '';
  const n = parseFloat(b);
  return Number.isFinite(n) ? `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })} MON` : b;
}

export function JudgeMode() {
  const [status, setStatus] = useState<JudgeStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<JudgeStepResult[]>([]);
  const [runInfo, setRunInfo] = useState<{ mandateId?: string; agentId?: string; setupTx?: string } | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(0);
  const [pulse, setPulse] = useState(0);

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      setError(null);
      const res = await fetch('/api/judge-mode');
      const data: JudgeStatus = await res.json().catch(() => ({ deployed: false, chainId: 0, lowFunds: false, rpcError: true, message: 'Could not reach the server. Retry in a moment.' } as any));
      setStatus(data);
      if (data.isRateLimited && data.retryAfterSeconds) {
        setCooldown(data.retryAfterSeconds);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check Judge Mode status');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // While the server broadcasts, walk a highlight down the plan so the wait reads as progress.
  useEffect(() => {
    if (!running) return;
    setPulse(0);
    const t = setInterval(() => setPulse((p) => (p + 1) % PLAN.length), 1400);
    return () => clearInterval(t);
  }, [running]);

  const handleRun = async () => {
    if (running || cooldown > 0) return;
    setRunning(true);
    setError(null);
    setSteps([]);
    setRunInfo(null);

    try {
      const res = await fetch('/api/judge-mode', {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({
        error:
          res.status === 504
            ? 'The run took longer than the server allows. Some steps may still have landed; check the relayer on the explorer, then run again.'
            : `The server returned an unexpected response (HTTP ${res.status}). Try again in a minute.`,
      }));

      if (!res.ok) {
        if (res.status === 429 && data.retryAfterSeconds) {
          setCooldown(data.retryAfterSeconds);
        }
        throw new Error(data.error || 'Failed to execute Judge Mode sequence');
      }

      setSteps(data.steps || []);
      setRunInfo(data.version === 'v2' ? { mandateId: data.mandateId, agentId: data.agentId, setupTx: data.setupTx } : null);
      setCooldown(120); // 2-minute cooldown
      fetchStatus();
    } catch (err: any) {
      setError(err.message || 'Judge Mode execution encountered an error');
    } finally {
      setRunning(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const isButtonDisabled = loadingStatus || running || cooldown > 0 || !status?.deployed || status?.lowFunds;
  const blockReason = loadingStatus
    ? 'Checking the contracts on Monad…'
    : !status?.deployed
    ? 'Contracts are not deployed on this network.'
    : status?.lowFunds
    ? 'The demo relayer is out of testnet MON.'
    : cooldown > 0
    ? `Cooling down: run again in ${cooldown}s (one run per 2 minutes).`
    : null;

  const executed = steps.filter((s) => s.status === 'success').length;
  const blocked = steps.filter((s) => s.status === 'reverted' && s.expectedOutcome === 'reverted').length;
  const asExpected = steps.filter((s) => s.status === s.expectedOutcome).length;

  return (
    <div className={j.wrap}>
      <PageHead
        eyebrow="Judge Mode"
        icon={<Gavel size={13} />}
        title="Six live transactions. One click."
        sub="A sponsored relayer runs the full mandate lifecycle on Monad Testnet: sign, spend, get blocked, revoke, get blocked again. Every step is a real transaction you can open in the explorer. You need no wallet and no MON."
      />

      <section className={j.console}>
        <div className={j.consoleTop}>
          <div className={j.chips}>
            <span className={`${j.chip} ${status?.deployed ? j.chipOk : status ? j.chipBad : ''}`}>
              <span className={j.dot} />
              {loadingStatus && !status ? 'Checking Monad…' : status?.deployed ? `Monad Testnet · ${status.chainId || 10143} · live` : 'Not deployed on Monad'}
            </span>
            {status?.relayerBalance && (
              <span className={`${j.chip} ${status.lowFunds ? j.chipWarn : ''}`}>
                <Coins size={13} /> Relayer {fmtBalance(status.relayerBalance)}
              </span>
            )}
            <button className={j.iconBtn} onClick={fetchStatus} disabled={loadingStatus || running} title="Refresh on-chain status" aria-label="Refresh status">
              <RefreshCw size={14} className={loadingStatus ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className={j.runWrap}>
            <button className={j.run} onClick={handleRun} disabled={isButtonDisabled}>
              {running ? (
                <>
                  <Loader2 size={19} className="animate-spin" /> Broadcasting to Monad…
                </>
              ) : (
                <>
                  <Play size={18} fill="currentColor" /> {steps.length ? 'Run it again' : 'Run the live sequence'}
                </>
              )}
            </button>
            {blockReason && !running && (
              <span className={j.why}>
                {cooldown > 0 ? <Timer size={13} /> : <AlertCircle size={13} />} {blockReason}
              </span>
            )}
          </div>
        </div>

        {status?.rpcError && (
          <div className={j.alertWarn}>
            <AlertTriangle size={16} />
            <span>{status.message || 'Could not reach the Monad RPC. Retry in a moment.'}</span>
          </div>
        )}
        {status && !status.deployed && !status.rpcError && (
          <div className={j.alertBad}>
            <AlertCircle size={16} />
            <span>
              <strong>Contracts not found on chain {status.chainId || 10143}.</strong> Judge Mode needs the deployed{' '}
              {status.version === 'v1' ? 'MandateManager' : 'AgentMandates'} and its demo target contract.
            </span>
          </div>
        )}
        {status?.lowFunds && status?.deployed && (
          <div className={j.alertWarn}>
            <AlertTriangle size={16} />
            <span>
              <strong>Relayer low on funds.</strong> One run needs about {fmtBalance(status.requiredBalance) || '0.1 MON'} at the
              current gas price{status.relayerBalance ? ` and it has ${fmtBalance(status.relayerBalance)}` : ''}.
              {status.relayerAddress && (
                <>
                  {' '}Send MON to <code>{status.relayerAddress}</code>.
                </>
              )}
            </span>
          </div>
        )}
        {error && (
          <div className={j.alertBad}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {steps.length > 0 && (
          <div className={j.score}>
            <div className={j.scoreItem}>
              <span className={j.scoreNum} style={{ color: 'var(--accent-emerald)' }}>{executed}</span>
              <span className={j.scoreLabel}>went through</span>
            </div>
            <div className={j.scoreItem}>
              <span className={j.scoreNum} style={{ color: 'var(--accent-rose)' }}>{blocked}</span>
              <span className={j.scoreLabel}>blocked by the contract</span>
            </div>
            <div className={j.scoreItem}>
              <span className={j.scoreNum}>{asExpected}/{PLAN.length}</span>
              <span className={j.scoreLabel}>exactly as expected</span>
            </div>
            {asExpected === PLAN.length ? (
              <div className={j.scoreBadge}>
                <ShieldCheck size={16} />
                {runInfo?.mandateId ? `Mandate #${runInfo.mandateId} · agent ERC-8004 #${runInfo.agentId}` : `Verified on chain ${status?.chainId || 10143}`}
              </div>
            ) : (
              <div className={`${j.scoreBadge} ${j.scoreBadgeWarn}`}>
                <AlertTriangle size={16} /> {PLAN.length - asExpected} step{PLAN.length - asExpected === 1 ? '' : 's'} not as expected
              </div>
            )}
          </div>
        )}

        <ol className={j.timeline}>
          {PLAN.map((p, i) => {
            const res = steps.find((s) => s.step === i + 1);
            const Icon = p.icon;
            const state = res
              ? res.status !== res.expectedOutcome
                ? 'err'
                : res.status === 'success'
                ? 'ok'
                : 'no'
              : running
              ? i === pulse
                ? 'live'
                : 'wait'
              : 'idle';
            return (
              <li key={p.name} className={`${j.step} ${j[state]}`} style={{ animationDelay: res ? `${i * 90}ms` : undefined }}>
                <span className={j.rail}>
                  <span className={j.node}>
                    {state === 'ok' ? <CheckCircle2 size={17} /> : state === 'no' ? <ShieldAlert size={17} /> : state === 'err' ? <AlertTriangle size={16} /> : state === 'live' ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
                  </span>
                </span>
                <div className={j.body}>
                  <div className={j.stepHead}>
                    <span className={j.stepNum}>{String(i + 1).padStart(2, '0')}</span>
                    <span className={j.stepName}>{res?.name || p.name}</span>
                    <span className={j.tag}>{p.expect === 'success' ? 'should succeed' : 'should be blocked'}</span>
                    {res && (
                      <span className={`${j.result} ${res.status !== res.expectedOutcome ? j.resultErr : res.status === 'success' ? j.resultOk : j.resultNo}`}>
                        {res.status === 'success' ? 'SUCCESS' : res.status === 'reverted' ? 'REVERTED' : 'ERROR'}
                      </span>
                    )}
                  </div>
                  <p className={j.stepText}>{res?.description || p.text}</p>
                  {res?.decodedRevert && (
                    <div className={j.revert}>
                      <ShieldAlert size={13} /> Reverted with <code>{res.decodedRevert}</code>
                    </div>
                  )}
                  {res && res.txHash.length > 2 && (
                    <div className={j.tx}>
                      <code>
                        {res.txHash.slice(0, 12)}…{res.txHash.slice(-8)}
                      </code>
                      <button onClick={() => copyToClipboard(res.txHash)} title="Copy transaction hash" aria-label="Copy transaction hash">
                        {copiedHash === res.txHash ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                      {res.blockNumber ? <span>block {res.blockNumber.toLocaleString()}</span> : null}
                      <a href={res.explorerUrl} target="_blank" rel="noopener noreferrer">
                        Open in explorer <ExternalLink size={11} />
                      </a>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <p className={j.foot}>
        {status?.version === 'v1' ? (
          <>
            Judge Mode is pinned to the v1 <code>MandateManager</code> with a server-held test passkey.
          </>
        ) : (
          <>
            Judge Mode runs <code>AgentMandates</code>, the same contract as the passkey console. The passkey is a software
            authenticator the server holds for one run, so it can run unattended, and the relayer acts as the agent with its own
            ERC-8004 identity.
            {runInfo?.setupTx && (
              <>
                {' '}This run first registered that identity:{' '}
                <a href={`https://testnet.monadexplorer.com/tx/${runInfo.setupTx}`} target="_blank" rel="noopener noreferrer">
                  registration tx
                </a>
                .
              </>
            )}
          </>
        )}{' '}
        To sign with your own device&apos;s passkey, use <a href="#passkey">Passkey Mandates</a>.
      </p>
    </div>
  );
}
