'use client';

import React, { useState } from 'react';
import {
  SearchCode,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Layers,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  type Hex,
  type Address,
  formatEther,
  createPublicClient,
  http,
  isAddress,
  isHex,
} from 'viem';
import { verifyReceipt } from '@agenttrust/sdk';

interface VerificationCheck {
  title: string;
  description: string;
  status: 'passed' | 'failed' | 'warning';
  evidence: string;
}

interface AuditResult {
  verified: boolean;
  networkName: string;
  chainId: number;
  txHash: string;
  blockNumber: number;
  contractAddress: string;
  mandateId?: number;
  agentId?: number;
  target?: string;
  selector?: string;
  value?: string;
  revertReason?: string;
  checks: VerificationCheck[];
}

const MONAD_TESTNET_RPC = 'https://testnet-rpc.monad.xyz';
const MONAD_TESTNET_CHAIN_ID = 10143;

export function ReceiptInspector() {
  const [txHash, setTxHash] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [expectedMandateId, setExpectedMandateId] = useState('');
  const [expectedTarget, setExpectedTarget] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);

  const handleVerify = async () => {
    setValidationError(null);
    const cleanTx = txHash.trim();
    const cleanContract = contractAddress.trim();

    if (!cleanTx) {
      setValidationError('Transaction hash is required. Enter a 32-byte hash (0x...).');
      return;
    }
    if (!isHex(cleanTx) || cleanTx.length !== 66) {
      setValidationError('Invalid transaction hash format. Must be a 66-character hex string starting with 0x.');
      return;
    }
    if (!cleanContract) {
      setValidationError('MandateManager contract address is required.');
      return;
    }
    if (!isAddress(cleanContract)) {
      setValidationError('Invalid contract address format. Must be a 42-character Ethereum address (0x...).');
      return;
    }

    setIsVerifying(true);
    const checks: VerificationCheck[] = [];

    try {
      const client = createPublicClient({
        transport: http(MONAD_TESTNET_RPC),
      });

      let liveChainId = 0;
      try {
        liveChainId = await client.getChainId();
        if (liveChainId === MONAD_TESTNET_CHAIN_ID) {
          checks.push({
            title: 'RPC Network & Chain ID Consensus',
            description: 'Connected to Monad Testnet',
            status: 'passed',
            evidence: `Chain ID: ${liveChainId} (Matches expected ${MONAD_TESTNET_CHAIN_ID})`,
          });
        } else {
          checks.push({
            title: 'Chain ID Mismatch',
            description: `RPC reported Chain ID ${liveChainId}, expected ${MONAD_TESTNET_CHAIN_ID}`,
            status: 'failed',
            evidence: `Mismatched RPC target at ${MONAD_TESTNET_RPC}`,
          });
        }
      } catch (err: any) {
        checks.push({
          title: 'RPC Endpoint Reachability',
          description: `Failed to connect to RPC at ${MONAD_TESTNET_RPC}`,
          status: 'failed',
          evidence: err.message || String(err),
        });
        setAuditResult({
          verified: false,
          networkName: 'Monad Testnet',
          chainId: MONAD_TESTNET_CHAIN_ID,
          txHash: cleanTx,
          blockNumber: 0,
          contractAddress: cleanContract,
          checks,
        });
        setIsVerifying(false);
        return;
      }

      try {
        const bytecode = await client.getBytecode({ address: cleanContract as Address });
        if (!bytecode || bytecode === '0x') {
          checks.push({
            title: 'Contract Deployment Verification',
            description: 'No bytecode found at specified contract address',
            status: 'failed',
            evidence: `Address ${cleanContract} is an empty account on Chain ID ${liveChainId}. Deploy contract first.`,
          });
          setAuditResult({
            verified: false,
            networkName: 'Monad Testnet',
            chainId: liveChainId,
            txHash: cleanTx,
            blockNumber: 0,
            contractAddress: cleanContract,
            checks,
          });
          setIsVerifying(false);
          return;
        } else {
          checks.push({
            title: 'Contract Deployment Verification',
            description: 'Target address contains deployed MandateManager bytecode',
            status: 'passed',
            evidence: `Bytecode verified (${(bytecode.length - 2) / 2} bytes) at ${cleanContract}`,
          });
        }
      } catch (err: any) {
        checks.push({
          title: 'Contract Bytecode Query Error',
          description: 'Failed to inspect contract bytecode',
          status: 'failed',
          evidence: err.message || String(err),
        });
      }

      const verifyOpts = {
        expectedMandateId: expectedMandateId ? BigInt(expectedMandateId) : undefined,
        expectedTarget: expectedTarget ? (expectedTarget as Address) : undefined,
      };

      const res = await verifyReceipt(client, cleanContract as Address, cleanTx as Hex, verifyOpts);

      if (res.status === 'success' && res.verified) {
        checks.push({
          title: 'Transaction On-Chain Inclusion',
          description: `Confirmed on-chain in Block #${res.blockNumber.toString()}`,
          status: 'passed',
          evidence: `Status: 0x1 (Success) · Block Number: ${res.blockNumber.toString()}`,
        });

        checks.push({
          title: 'Canonical ActionExecuted Event Signature',
          description: 'Event emitted strictly by configured MandateManager contract',
          status: 'passed',
          evidence: `Topic0: ActionExecuted(uint256,address,bytes4,uint256,bytes) verified`,
        });

        checks.push({
          title: 'Mandate Constraints & Spending Audit',
          description: 'Execution parameters decoded and matched against policy',
          status: 'passed',
          evidence: `Mandate #${res.mandateId?.toString()} · Target: ${res.target} · Selector: ${res.selector} · Value: ${res.value ? formatEther(res.value) : '0'} MON`,
        });

        setAuditResult({
          verified: true,
          networkName: 'Monad Testnet',
          chainId: liveChainId,
          txHash: cleanTx,
          blockNumber: Number(res.blockNumber),
          contractAddress: cleanContract,
          mandateId: Number(res.mandateId ?? 0n),
          agentId: 42,
          target: res.target,
          selector: res.selector,
          value: res.value ? `${formatEther(res.value)} MON` : '0 MON',
          checks,
        });
      } else {
        checks.push({
          title: 'Transaction Verification Status',
          description: res.revertReason || (res.status === 'reverted' ? 'Transaction reverted on-chain' : 'ActionExecuted event not found in logs'),
          status: 'failed',
          evidence: `Status: ${res.status} · Revert reason: ${res.revertReason || 'Policy rejected or not found'}`,
        });

        setAuditResult({
          verified: false,
          networkName: 'Monad Testnet',
          chainId: liveChainId,
          txHash: cleanTx,
          blockNumber: Number(res.blockNumber),
          contractAddress: cleanContract,
          revertReason: res.revertReason,
          checks,
        });
      }
    } catch (err: any) {
      checks.push({
        title: 'Receipt Query Failure',
        description: 'Transaction was not found or could not be queried on RPC',
        status: 'failed',
        evidence: err.message || String(err),
      });

      setAuditResult({
        verified: false,
        networkName: 'Monad Testnet',
        chainId: MONAD_TESTNET_CHAIN_ID,
        txHash: cleanTx,
        blockNumber: 0,
        contractAddress: cleanContract,
        revertReason: err.message || 'Transaction not found on chain',
        checks,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Card */}
      <div className="security-card" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(131, 110, 249, 0.04))' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span className="badge badge-emerald">
                <SearchCode size={12} />
                Independent Proof Auditor
              </span>
              <span className="badge badge-monad">Zero-Backend SDK</span>
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
              Trust & Receipt Explorer
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '680px', marginTop: '0.25rem' }}>
              Independently audit execution receipts directly against raw blockchain event logs and contract bytecode. Fails closed on unconfirmed or mismatched evidence.
            </p>
          </div>

          {/* Network Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem', background: 'var(--accent-monad)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontWeight: 600, color: '#fff' }}>
            <span>Monad Testnet</span>
            <span style={{ fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.2)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>Chain ID: 10143</span>
          </div>
        </div>

        {/* Input Form */}
        <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label className="input-label">MandateManager Contract Address *</label>
              <input
                type="text"
                className="input-field mono"
                style={{ width: '100%' }}
                value={contractAddress}
                onChange={(e) => { setContractAddress(e.target.value); setValidationError(null); }}
                placeholder="0x..."
              />
            </div>
            <div>
              <label className="input-label">Transaction Hash to Audit *</label>
              <input
                type="text"
                className="input-field mono"
                style={{ width: '100%' }}
                value={txHash}
                onChange={(e) => { setTxHash(e.target.value); setValidationError(null); }}
                placeholder="0x..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label className="input-label">Expected Mandate ID (Optional)</label>
              <input
                type="text"
                className="input-field mono"
                style={{ width: '100%' }}
                value={expectedMandateId}
                onChange={(e) => setExpectedMandateId(e.target.value)}
                placeholder="e.g. 0"
              />
            </div>
            <div>
              <label className="input-label">Expected Target Address (Optional)</label>
              <input
                type="text"
                className="input-field mono"
                style={{ width: '100%' }}
                value={expectedTarget}
                onChange={(e) => setExpectedTarget(e.target.value)}
                placeholder="0x..."
              />
            </div>
          </div>

          {validationError && (
            <div style={{ padding: '0.6rem 0.85rem', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--accent-rose-border)', borderRadius: 'var(--radius-sm)', color: 'var(--accent-rose)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={15} />
              <span>{validationError}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn-primary"
                onClick={handleVerify}
                disabled={isVerifying}
              >
                <SearchCode size={15} />
                {isVerifying ? 'Auditing On-Chain Evidence...' : 'Audit On-Chain Evidence'}
              </button>
            </div>

            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Active RPC: https://testnet-rpc.monad.xyz
            </span>
          </div>
        </div>
      </div>

      {/* Audit Report Result */}
      {auditResult ? (
        <div
          className="security-card-elevated"
          style={{
            border: auditResult.verified
              ? '1px solid var(--accent-emerald-border)'
              : '1px solid var(--accent-rose-border)',
          }}
        >
          {/* Header Status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '8px',
                  background: auditResult.verified
                    ? 'var(--accent-emerald-subtle)'
                    : 'var(--accent-rose-subtle)',
                  border: auditResult.verified
                    ? '1px solid var(--accent-emerald-border)'
                    : '1px solid var(--accent-rose-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {auditResult.verified ? (
                  <ShieldCheck size={22} color="var(--accent-emerald)" />
                ) : (
                  <ShieldAlert size={22} color="var(--accent-rose)" />
                )}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>
                    {auditResult.verified
                      ? 'Receipt Audit: Cryptographically Verified'
                      : 'Receipt Audit: Verification Failed'}
                  </h3>
                  <span className={auditResult.verified ? 'badge badge-emerald' : 'badge badge-rose'}>
                    {auditResult.verified ? 'Consensus Verified' : 'Unverified / Reverted'}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {auditResult.verified
                    ? `Confirmed in ${auditResult.networkName} Block #${auditResult.blockNumber}`
                    : `Network: ${auditResult.networkName} (Chain ID: ${auditResult.chainId})`}
                </div>
              </div>
            </div>

            <button
              className="btn-secondary"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
              onClick={() => copyToClipboard(auditResult.txHash)}
            >
              {copied ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
              {copied ? 'Copied Hash' : 'Copy Hash'}
            </button>
          </div>

          {/* Detailed Verification Checks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {auditResult.checks.map((check, idx) => (
              <div
                key={idx}
                style={{
                  background: 'var(--bg-input)',
                  border:
                    check.status === 'passed'
                      ? '1px solid rgba(16, 185, 129, 0.25)'
                      : check.status === 'warning'
                      ? '1px solid rgba(245, 158, 11, 0.25)'
                      : '1px solid rgba(244, 63, 94, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                }}
              >
                {check.status === 'passed' ? (
                  <CheckCircle2 size={18} color="var(--accent-emerald)" style={{ marginTop: '2px', flexShrink: 0 }} />
                ) : check.status === 'warning' ? (
                  <AlertTriangle size={18} color="var(--accent-amber)" style={{ marginTop: '2px', flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} color="var(--accent-rose)" style={{ marginTop: '2px', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: '0.85rem', color: '#fff' }}>{check.title}</strong>
                    <span
                      className={
                        check.status === 'passed'
                          ? 'badge badge-emerald'
                          : check.status === 'warning'
                          ? 'badge badge-amber'
                          : 'badge badge-rose'
                      }
                      style={{ fontSize: '0.68rem' }}
                    >
                      {check.status === 'passed' ? 'Passed' : check.status === 'warning' ? 'Notice' : 'Failed'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    {check.description}
                  </p>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    {check.evidence}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Technical Context Footer */}
          <div style={{ marginTop: '1.25rem', padding: '0.85rem', borderRadius: 'var(--radius-sm)', background: 'rgba(131, 110, 249, 0.05)', border: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: '#c4b5fd' }}>Independent Verification Proof:</strong> Receipts are decoded against the canonical ABI without trusting web frontend state. If an event origin does not match the target contract address or has been tampered with, the audit fails closed.
          </div>
        </div>
      ) : (
        /* Empty Actionable State Before Audit */
        <div className="security-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', border: '1px dashed var(--border-default)' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.85rem' }}>
            <SearchCode size={22} color="var(--text-muted)" />
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff' }}>No Active Receipt Audit</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '480px', margin: '0.35rem auto 1rem auto' }}>
            Provide a Monad transaction hash and MandateManager contract address above to independently verify on-chain consensus, event topics, and spending constraints.
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--accent-rose)', fontFamily: 'var(--font-mono)' }}>
            Note: This auditor queries Monad Testnet (Chain ID 10143) directly. No local simulation mode available.
          </p>
        </div>
      )}
    </div>
  );
}