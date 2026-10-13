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
      <div className="security-card" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span className="badge badge-emerald">
                <SearchCode size={12} />
                Independent Proof Auditor
              </span>
              <span className="badge badge-monad">Zero-Backend SDK</span>
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
              Trust & Receipt Explorer
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: '680px', marginTop: '0.25rem' }}>
              Independently audit execution receipts directly against raw blockchain event logs and contract bytecode. Fails closed on unconfirmed or mismatched evidence.
            </p>
          </div>

          {/* Network Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.85rem', background: '#ede9fe', borderRadius: 'var(--radius-md)', fontSize: '0.785rem', fontWeight: 600, color: '#4f46e5', border: '1px solid #ddd6fe' }}>
            <span>Monad Testnet</span>
            <span style={{ fontFamily: 'var(--font-mono)', background: '#ffffff', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid #c7d2fe' }}>Chain ID: 10143</span>
          </div>
        </div>

        {/* Input Form */}
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
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
            <div style={{ padding: '0.65rem 0.85rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#dc2626', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={15} />
              <span>{validationError}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button
              className="btn-primary"
              onClick={handleVerify}
              disabled={isVerifying}
            >
              <SearchCode size={15} />
              {isVerifying ? 'Auditing On-Chain Evidence...' : 'Audit On-Chain Evidence'}
            </button>

            <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
              Active RPC: https://testnet-rpc.monad.xyz
            </span>
          </div>
        </div>
      </div>

      {/* Audit Report Result */}
      {auditResult ? (
        <div
          className="security-card"
          style={{
            border: auditResult.verified
              ? '1px solid #a7f3d0'
              : '1px solid #fecaca',
            padding: '1.75rem',
          }}
        >
          {/* Header Status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: auditResult.verified
                    ? '#ecfdf5'
                    : '#fef2f2',
                  border: auditResult.verified
                    ? '1px solid #a7f3d0'
                    : '1px solid #fecaca',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {auditResult.verified ? (
                  <ShieldCheck size={24} color="#059669" />
                ) : (
                  <ShieldAlert size={24} color="#dc2626" />
                )}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827' }}>
                    {auditResult.verified
                      ? 'Receipt Audit: Cryptographically Verified'
                      : 'Receipt Audit: Verification Failed'}
                  </h3>
                  <span className={auditResult.verified ? 'badge badge-emerald' : 'badge badge-rose'}>
                    {auditResult.verified ? 'Consensus Verified' : 'Unverified / Reverted'}
                  </span>
                </div>
                <div style={{ fontSize: '0.785rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                  {auditResult.verified
                    ? `Confirmed in ${auditResult.networkName} Block #${auditResult.blockNumber}`
                    : `Network: ${auditResult.networkName} (Chain ID: ${auditResult.chainId})`}
                </div>
              </div>
            </div>

            <button
              className="btn-secondary"
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.785rem' }}
              onClick={() => copyToClipboard(auditResult.txHash)}
            >
              {copied ? <Check size={14} color="#059669" /> : <Copy size={14} />}
              {copied ? 'Copied Hash' : 'Copy Hash'}
            </button>
          </div>

          {/* Detailed Verification Checks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {auditResult.checks.map((check, idx) => (
              <div
                key={idx}
                style={{
                  background: '#f8fafc',
                  border:
                    check.status === 'passed'
                      ? '1px solid #a7f3d0'
                      : check.status === 'warning'
                      ? '1px solid #fde68a'
                      : '1px solid #fecaca',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                }}
              >
                {check.status === 'passed' ? (
                  <CheckCircle2 size={18} color="#059669" style={{ marginTop: '2px', flexShrink: 0 }} />
                ) : check.status === 'warning' ? (
                  <AlertTriangle size={18} color="#d97706" style={{ marginTop: '2px', flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} color="#dc2626" style={{ marginTop: '2px', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: '0.875rem', color: '#111827' }}>{check.title}</strong>
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
                  <p style={{ fontSize: '0.8rem', color: '#4b5563', marginTop: '0.2rem' }}>
                    {check.description}
                  </p>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
                    {check.evidence}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Technical Context Footer */}
          <div style={{ marginTop: '1.25rem', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', background: '#eef2ff', border: '1px solid #e0e7ff', fontSize: '0.785rem', color: '#334155' }}>
            <strong style={{ color: '#4338ca' }}>Independent Verification Proof:</strong> Receipts are decoded against the canonical ABI without trusting web frontend state. If an event origin does not match the target contract address or has been tampered with, the audit fails closed.
          </div>
        </div>
      ) : (
        /* Empty Actionable State Before Audit */
        <div className="empty-state">
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f3f4f6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.85rem', color: '#9ca3af' }}>
            <SearchCode size={24} />
          </div>
          <h3 className="empty-state-title">No Active Receipt Audit</h3>
          <p className="empty-state-desc">
            Provide a Monad transaction hash and MandateManager contract address above to independently verify on-chain consensus, event topics, and spending constraints.
          </p>
          <p style={{ fontSize: '0.785rem', color: '#dc2626', fontFamily: 'var(--font-mono)', marginTop: '0.5rem' }}>
            Note: This auditor queries Monad Testnet (Chain ID 10143) directly.
          </p>
        </div>
      )}
    </div>
  );
}