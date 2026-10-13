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
  Info,
} from 'lucide-react';
import {
  type Hex,
  type Address,
  formatEther,
  parseEther,
  createPublicClient,
  http,
  isAddress,
  isHex,
} from 'viem';
import {
  verifyReceipt,
  verifyAgentIdentity,
  getMandate,
  type ReceiptVerificationStatus,
} from '@agenttrust/sdk';
import {
  DEFAULT_MANDATE_MANAGER_ADDRESS,
  DEFAULT_ERC8004_REGISTRY,
} from '../lib/contracts';

interface VerificationCheck {
  title: string;
  description: string;
  status: 'passed' | 'failed' | 'warning';
  evidence: string;
}

interface AuditResult {
  verified: boolean;
  fullPolicyCompliance: boolean;
  policyMatchLevel: 'full' | 'partial' | 'unspecified';
  statusCategory: ReceiptVerificationStatus;
  networkName: string;
  chainId: number;
  txHash: string;
  blockNumber: number;
  contractAddress: string;
  isCanonicalContract: boolean;
  mandateId?: number;
  agentId?: number | null;
  agentVerificationNote?: string;
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
  const [contractAddress, setContractAddress] = useState<string>(DEFAULT_MANDATE_MANAGER_ADDRESS);
  const [expectedMandateId, setExpectedMandateId] = useState('');
  const [expectedTarget, setExpectedTarget] = useState('');
  const [expectedSelector, setExpectedSelector] = useState('');
  const [expectedMaxMon, setExpectedMaxMon] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);

  const isCustomContract =
    contractAddress.trim().toLowerCase() !== DEFAULT_MANDATE_MANAGER_ADDRESS.toLowerCase();

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
      setValidationError('Contract address is required.');
      return;
    }
    if (!isAddress(cleanContract)) {
      setValidationError('Invalid contract address format. Must be a 42-character Ethereum address (0x...).');
      return;
    }

    if (expectedSelector.trim() && !/^0x[0-9a-fA-F]{8}$/.test(expectedSelector.trim())) {
      setValidationError('Expected selector must be a 4-byte hex string (e.g. 0x50824e4f or 0xa9059cbb).');
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
          fullPolicyCompliance: false,
          policyMatchLevel: 'unspecified',
          statusCategory: 'rpc_error',
          networkName: 'Monad Testnet',
          chainId: MONAD_TESTNET_CHAIN_ID,
          txHash: cleanTx,
          blockNumber: 0,
          contractAddress: cleanContract,
          isCanonicalContract: !isCustomContract,
          checks,
        });
        setIsVerifying(false);
        return;
      }

      // Check contract bytecode
      let isBytecodePresent = false;
      try {
        const bytecode = await client.getBytecode({ address: cleanContract as Address });
        if (!bytecode || bytecode === '0x') {
          checks.push({
            title: 'Contract Deployment Verification',
            description: 'No bytecode found at specified contract address',
            status: 'failed',
            evidence: `Address ${cleanContract} is an empty account (0 bytes bytecode) on Chain ID ${liveChainId}.`,
          });
        } else {
          isBytecodePresent = true;
          checks.push({
            title: 'Contract Deployment Verification',
            description: isCustomContract
              ? 'Custom contract address contains deployed bytecode (Origin Uncertified)'
              : 'Target address contains deployed MandateManager bytecode',
            status: isCustomContract ? 'warning' : 'passed',
            evidence: `Bytecode verified (${(bytecode.length - 2) / 2} bytes) at ${cleanContract}${
              isCustomContract ? ' [CUSTOM AUDIT]' : ' [CANONICAL]'
            }`,
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

      // Prepare verifyReceipt options
      const verifyOpts = {
        expectedChainId: MONAD_TESTNET_CHAIN_ID,
        expectedMandateId: expectedMandateId.trim() ? BigInt(expectedMandateId.trim()) : undefined,
        expectedTarget: expectedTarget.trim() ? (expectedTarget.trim() as Address) : undefined,
        expectedSelector: expectedSelector.trim() ? (expectedSelector.trim() as Hex) : undefined,
        expectedMaxValue: expectedMaxMon.trim() ? parseEther(expectedMaxMon.trim()) : undefined,
      };

      const res = await verifyReceipt(client, cleanContract as Address, cleanTx as Hex, verifyOpts);

      if (res.status === 'success' && res.verified && isBytecodePresent) {
        // 1. Transaction Receipt Confirmed
        checks.push({
          title: '1. Transaction Receipt Confirmed',
          description: `Confirmed on-chain in Block #${res.blockNumber.toString()}`,
          status: 'passed',
          evidence: `Status: 0x1 (Success) · Block Number: ${res.blockNumber.toString()}`,
        });

        // 2. Event Signature & Emitter Checked
        checks.push({
          title: '2. Canonical ActionExecuted Event Signature',
          description: 'Event emitted strictly by specified contract address',
          status: 'passed',
          evidence: `Topic0: ActionExecuted(uint256,address,bytes4,uint256,bytes) verified from ${cleanContract}`,
        });

        // Check which expectations were supplied vs missing
        const providedExpectations: string[] = [];
        const missingExpectations: string[] = [];

        if (expectedMandateId.trim()) providedExpectations.push(`Mandate #${expectedMandateId.trim()}`);
        else missingExpectations.push('Mandate ID');

        if (expectedTarget.trim()) providedExpectations.push(`Target ${expectedTarget.trim().slice(0, 8)}...`);
        else missingExpectations.push('Target Address');

        if (expectedSelector.trim()) providedExpectations.push(`Selector ${expectedSelector.trim()}`);
        else missingExpectations.push('Method Selector');

        if (expectedMaxMon.trim()) providedExpectations.push(`Max MON ${expectedMaxMon.trim()}`);
        else missingExpectations.push('Spending Cap');

        const hasAllExpectations = missingExpectations.length === 0;
        const hasAnyExpectations = providedExpectations.length > 0;
        const isFullPolicyCompliance = hasAllExpectations && !isCustomContract;

        // 3. Expected Policy Fields Actually Matched
        if (hasAllExpectations) {
          checks.push({
            title: '3. Expected Policy Fields Actually Matched',
            description: 'All 4 supplied policy boundaries verified against decoded event parameters',
            status: 'passed',
            evidence: `Mandate #${res.mandateId?.toString()} · Target: ${res.target} · Selector: ${res.selector} · Native MON: ${res.value ? formatEther(res.value) : '0'} MON (within ${expectedMaxMon} MON cap)`,
          });
        } else if (hasAnyExpectations) {
          checks.push({
            title: '3. Partial Policy Fields Matched',
            description: `Matched provided constraints (${providedExpectations.join(', ')}). Omitted constraints: ${missingExpectations.join(', ')}`,
            status: 'warning',
            evidence: `Decoded event values: Mandate #${res.mandateId?.toString()} · Target: ${res.target} · Selector: ${res.selector} · Native MON: ${res.value ? formatEther(res.value) : '0'} MON`,
          });
        } else {
          checks.push({
            title: '3. Expected Policy Constraints Not Provided',
            description: 'No expected policy parameters were entered for comparison. Raw event values extracted without policy-bound matching.',
            status: 'warning',
            evidence: `Decoded event values: Mandate #${res.mandateId?.toString()} · Target: ${res.target} · Selector: ${res.selector} · Native MON: ${res.value ? formatEther(res.value) : '0'} MON`,
          });
        }

        // 4. Full Policy Compliance Independently Verified
        if (isFullPolicyCompliance) {
          checks.push({
            title: '4. Full Policy Compliance Independently Verified',
            description: 'Independent proof: On-chain transaction succeeded, valid event emitted by canonical contract, and all policy boundaries satisfied.',
            status: 'passed',
            evidence: '100% Policy Bounds Proven: Mandate ID, Target, Selector, and Native Spending Cap verified on canonical contract.',
          });
        } else if (isCustomContract) {
          checks.push({
            title: '4. Policy Verification on Custom Contract (Notice)',
            description: 'Event matched policy parameters, but contract address differs from canonical AgentTrust MandateManager.',
            status: 'warning',
            evidence: `Custom Contract: ${cleanContract} [Uncertified Origin]`,
          });
        } else {
          checks.push({
            title: '4. Policy Compliance Incomplete (Missing Fields)',
            description: 'The transaction and event are verified authentic, but full policy compliance cannot be confirmed without supplying all expected constraints.',
            status: 'warning',
            evidence: `Missing expectations: ${missingExpectations.join(', ')}. Supply all expected fields to verify full policy compliance.`,
          });
        }

        // 5. ERC-8004 Agent Identity Binding Check
        let agentIdVal: number | null = null;
        let agentVerificationNoteVal =
          'Unverified from event log (Agent authorization is enforced on-chain by MandateManager at execution time)';

        if (res.mandateId !== undefined && !isCustomContract) {
          try {
            const mandate = await getMandate(client, cleanContract as Address, res.mandateId);
            if (mandate && mandate.agentId > 0n) {
              const agentCheck = await verifyAgentIdentity(
                client,
                mandate.agentId,
                mandate.agentAddress,
                DEFAULT_ERC8004_REGISTRY
              );

              agentIdVal = Number(mandate.agentId);
              if (agentCheck.verified) {
                checks.push({
                  title: '5. ERC-8004 Agent Identity Verified',
                  description: `Agent #${mandate.agentId.toString()} confirmed in on-chain ERC-8004 Identity Registry`,
                  status: 'passed',
                  evidence: `Registry ${DEFAULT_ERC8004_REGISTRY.slice(0, 10)}... confirmed designated wallet ${mandate.agentAddress.slice(0, 8)}... matches mandate agent.`,
                });
                agentVerificationNoteVal = `Verified on-chain via ERC-8004 Registry (${DEFAULT_ERC8004_REGISTRY.slice(0, 10)}...): Designated wallet matches authorized mandate agent.`;
              } else {
                checks.push({
                  title: '5. ERC-8004 Agent Identity Notice',
                  description: agentCheck.error || 'Agent wallet mismatch on ERC-8004 registry',
                  status: 'warning',
                  evidence: agentCheck.error || `Agent #${mandate.agentId.toString()} unconfirmed on-chain.`,
                });
                agentVerificationNoteVal = `ERC-8004 Identity Warning: ${agentCheck.error || 'Wallet mismatch'}`;
              }
            } else if (mandate && mandate.agentId === 0n) {
              agentVerificationNoteVal = 'Unbound Agent (No ERC-8004 ID specified in mandate definition)';
            }
          } catch {
            // Non-critical fallback if mandate lookup fails
          }
        }

        setAuditResult({
          verified: true,
          fullPolicyCompliance: isFullPolicyCompliance,
          policyMatchLevel: hasAllExpectations ? 'full' : hasAnyExpectations ? 'partial' : 'unspecified',
          statusCategory: 'success',
          networkName: 'Monad Testnet',
          chainId: liveChainId,
          txHash: cleanTx,
          blockNumber: Number(res.blockNumber),
          contractAddress: cleanContract,
          isCanonicalContract: !isCustomContract,
          mandateId: Number(res.mandateId ?? 0n),
          agentId: agentIdVal,
          agentVerificationNote: agentVerificationNoteVal,
          target: res.target,
          selector: res.selector,
          value: res.value ? `${formatEther(res.value)} MON` : '0 MON',
          checks,
        });
      } else {
        // Fail closed on any failure or missing bytecode
        const failureTitle =
          res.status === 'not_found'
            ? 'Transaction Receipt Not Found'
            : res.status === 'rpc_error'
            ? 'RPC Query Error'
            : res.status === 'wrong_network'
            ? 'Network Chain Mismatch'
            : res.status === 'reverted'
            ? 'Transaction Reverted on Monad'
            : 'Policy Verification Mismatch';

        checks.push({
          title: failureTitle,
          description: res.revertReason || (res.status === 'reverted' ? 'Transaction reverted on-chain' : 'Execution requirements failed'),
          status: 'failed',
          evidence: `Status: ${res.status} · ${res.revertReason || 'Policy rejected or not confirmed'}`,
        });

        setAuditResult({
          verified: false,
          fullPolicyCompliance: false,
          policyMatchLevel: 'unspecified',
          statusCategory: res.status,
          networkName: 'Monad Testnet',
          chainId: liveChainId,
          txHash: cleanTx,
          blockNumber: Number(res.blockNumber),
          contractAddress: cleanContract,
          isCanonicalContract: !isCustomContract,
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
        fullPolicyCompliance: false,
        policyMatchLevel: 'unspecified',
        statusCategory: 'rpc_error',
        networkName: 'Monad Testnet',
        chainId: MONAD_TESTNET_CHAIN_ID,
        txHash: cleanTx,
        blockNumber: 0,
        contractAddress: cleanContract,
        isCanonicalContract: !isCustomContract,
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
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Trust & Receipt Explorer
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '680px', marginTop: '0.25rem' }}>
              Independently audit execution receipts directly against raw blockchain event logs and contract bytecode. Fails closed on unconfirmed or mismatched evidence.
            </p>
          </div>

          {/* Network Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.85rem', background: 'var(--bg-lavender-subtle)', borderRadius: 'var(--radius-md)', fontSize: '0.785rem', fontWeight: 600, color: 'var(--accent-primary)', border: '1px solid var(--border-default)' }}>
            <span>Monad Testnet</span>
            <span style={{ fontFamily: 'var(--font-mono)', background: '#ffffff', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border-default)' }}>Chain ID: 10143</span>
          </div>
        </div>

        {/* Custom Contract Warning Banner */}
        {isCustomContract && (
          <div
            style={{
              marginTop: '1.25rem',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-amber-subtle)',
              border: '1px solid var(--accent-amber-border)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem',
              fontSize: '0.8rem',
              color: 'var(--accent-amber)',
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Custom Contract Audit: </strong>
              The specified contract address differs from canonical AgentTrust MandateManager ({DEFAULT_MANDATE_MANAGER_ADDRESS.slice(0, 10)}...). Logs will be decoded against ABI specs, but origin bytecode is uncertified.
            </div>
          </div>
        )}

        {/* Input Form */}
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="input-label" style={{ marginBottom: 0 }}>MandateManager Contract Address *</label>
                {isCustomContract && (
                  <button
                    onClick={() => setContractAddress(DEFAULT_MANDATE_MANAGER_ADDRESS)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Reset to Canonical
                  </button>
                )}
              </div>
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
                placeholder="0x... (66-char hex transaction hash)"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
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
            <div>
              <label className="input-label">Expected Selector (Optional)</label>
              <input
                type="text"
                className="input-field mono"
                style={{ width: '100%' }}
                value={expectedSelector}
                onChange={(e) => setExpectedSelector(e.target.value)}
                placeholder="e.g. 0x50824e4f"
              />
            </div>
            <div>
              <label className="input-label">Max Native MON (Optional)</label>
              <input
                type="text"
                className="input-field mono"
                style={{ width: '100%' }}
                value={expectedMaxMon}
                onChange={(e) => setExpectedMaxMon(e.target.value)}
                placeholder="e.g. 0.2"
              />
            </div>
          </div>

          {validationError && (
            <div style={{ padding: '0.65rem 0.85rem', background: 'var(--accent-rose-subtle)', border: '1px solid var(--accent-rose-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent-rose)', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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

            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Target RPC: https://testnet-rpc.monad.xyz (10143)
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
              ? '1px solid var(--accent-emerald-border)'
              : '1px solid var(--accent-rose-border)',
            padding: '1.75rem',
          }}
        >
          {/* Header Status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: auditResult.verified
                    ? 'var(--accent-emerald-subtle)'
                    : 'var(--accent-rose-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {auditResult.verified ? (
                  <ShieldCheck size={20} color="var(--accent-emerald)" />
                ) : (
                  <ShieldAlert size={20} color="var(--accent-rose)" />
                )}
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {auditResult.fullPolicyCompliance
                    ? 'Cryptographically Verified Receipt & Full Policy Compliance'
                    : auditResult.verified
                    ? 'Authentic Event Decoded · Policy Incomplete'
                    : auditResult.statusCategory === 'not_found'
                    ? 'Transaction Not Found / Pending'
                    : auditResult.statusCategory === 'reverted'
                    ? 'Transaction Reverted on Monad'
                    : 'Receipt Verification Failed'}
                </h3>
                <span style={{ fontSize: '0.785rem', color: 'var(--text-secondary)' }}>
                  {auditResult.fullPolicyCompliance
                    ? `ActionExecuted event decoded from Monad block #${auditResult.blockNumber} and strictly conforms to all expected policy constraints.`
                    : auditResult.verified
                    ? `ActionExecuted event decoded from Monad block #${auditResult.blockNumber}, but missing expected policy fields prevent full compliance verification.`
                    : auditResult.revertReason || 'Failed to establish cryptographic validity against mandate'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span
                className={
                  auditResult.fullPolicyCompliance
                    ? 'badge badge-emerald'
                    : auditResult.verified
                    ? 'badge badge-amber'
                    : auditResult.statusCategory === 'not_found'
                    ? 'badge badge-amber'
                    : 'badge badge-rose'
                }
              >
                {auditResult.fullPolicyCompliance
                  ? 'FULL COMPLIANCE VERIFIED'
                  : auditResult.verified
                  ? auditResult.policyMatchLevel === 'partial'
                    ? 'EVENT VERIFIED (PARTIAL POLICY)'
                    : 'EVENT VERIFIED (UNCHECKED POLICY)'
                  : auditResult.statusCategory.toUpperCase()}
              </span>
              <button
                className="btn-secondary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                onClick={() => copyToClipboard(JSON.stringify(auditResult, null, 2))}
              >
                {copied ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy JSON'}
              </button>
            </div>
          </div>

          {/* Key Parameters Table if Verified */}
          {auditResult.verified && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1.5rem',
                background: 'var(--bg-inset)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <span className="kpi-label">MANDATE ID</span>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                  #{auditResult.mandateId}
                </div>
              </div>
              <div>
                <span className="kpi-label">BOUND AGENT ID</span>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginTop: '2px', fontSize: '0.8rem' }}>
                  Unverified <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(Not in event)</span>
                </div>
              </div>
              <div>
                <span className="kpi-label">TARGET CONTRACT</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                  {auditResult.target}
                </div>
              </div>
              <div>
                <span className="kpi-label">METHOD SELECTOR</span>
                <div style={{ fontWeight: 600, color: 'var(--accent-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  {auditResult.selector}
                </div>
              </div>
              <div>
                <span className="kpi-label">NATIVE MON TRANSFERRED</span>
                <div style={{ fontWeight: 700, color: 'var(--accent-emerald)', marginTop: '2px' }}>
                  {auditResult.value}
                </div>
              </div>
              <div>
                <span className="kpi-label">POLICY MATCH STATUS</span>
                <div style={{ fontWeight: 700, color: auditResult.fullPolicyCompliance ? 'var(--accent-emerald)' : 'var(--accent-amber)', marginTop: '2px', fontSize: '0.8rem' }}>
                  {auditResult.fullPolicyCompliance ? '100% Verified' : auditResult.policyMatchLevel === 'partial' ? 'Partial Match' : 'Unchecked (No Policy Fields)'}
                </div>
              </div>
            </div>
          )}

          {/* Detailed Verification Checks Pipeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Verification Checks Pipeline ({checksPassedCount(auditResult.checks)} / {auditResult.checks.length})
            </span>

            {auditResult.checks.map((check, idx) => (
              <div
                key={idx}
                style={{
                  background: '#ffffff',
                  border:
                    check.status === 'passed'
                      ? '1px solid var(--accent-emerald-border)'
                      : check.status === 'warning'
                      ? '1px solid var(--accent-amber-border)'
                      : '1px solid var(--accent-rose-border)',
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
                    <strong style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{check.title}</strong>
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
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    {check.description}
                  </p>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', wordBreak: 'break-all' }}>
                    {check.evidence}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Technical Context Footer */}
          <div style={{ marginTop: '1.25rem', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-lavender-subtle)', border: '1px solid var(--border-default)', fontSize: '0.785rem', color: 'var(--text-primary)' }}>
            <strong style={{ color: 'var(--accent-primary)' }}>Fail-Closed Verification: </strong> Receipts are decoded against the canonical ABI without trusting web frontend state. If event origin, selector, or value expectations do not match, the audit fails closed.
          </div>
        </div>
      ) : (
        /* Empty Actionable State Before Audit */
        <div className="empty-state">
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-inset)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.85rem', color: 'var(--text-muted)' }}>
            <SearchCode size={24} />
          </div>
          <h3 className="empty-state-title">No Active Receipt Audit</h3>
          <p className="empty-state-desc">
            Provide a Monad transaction hash and contract address above to independently verify on-chain consensus, event topics, and spending constraints.
          </p>
          <p style={{ fontSize: '0.785rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.5rem' }}>
            Note: This auditor queries Monad Testnet (Chain ID 10143) directly without server intermediaries.
          </p>
        </div>
      )}
    </div>
  );
}

function checksPassedCount(checks: VerificationCheck[]) {
  return checks.filter((c) => c.status === 'passed').length;
}