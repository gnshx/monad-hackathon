'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Download,
  Copy,
  Check,
  FileCode,
  Info,
  Clock,
  Target,
  Code,
  Coins,
  CreditCard,
  KeyRound,
  ExternalLink,
  Ban,
} from 'lucide-react';
import { parseEther, formatEther, isAddress, type Address, type Hex } from 'viem';
import type { CreateMandateParams } from '@agenttrust/sdk';
import {
  DEFAULT_MANDATE_MANAGER_ADDRESS,
  DEFAULT_MOCK_TARGET_ADDRESS,
  DO_SOMETHING_SELECTOR,
  DO_SOMETHING_SIGNATURE,
} from '../lib/contracts';
import { evaluateV1Execute, type V1ExecuteError } from './AttackLab';
import type { MandateItem } from './MandateCard';

interface PolicyToProofExplorerProps {
  onAuthorizeMandate: (params: CreateMandateParams) => void;
  networkMode?: 'LOCAL_SIMULATION' | 'MONAD_TESTNET';
  isJudgeMode?: boolean;
}

interface ParsedPolicy {
  prompt: string;
  agentAddress: string;
  agentId: string;
  targetAddress: string;
  targetLabel: string;
  selector: string;
  selectorName: string;
  perTxCap: string;
  totalBudget: string;
  durationHours: string;
  isWildcard: boolean;
}

interface LinterFinding {
  level: 'ok' | 'warning' | 'error';
  field: string;
  message: string;
  actionableHint?: string;
  isBlocking?: boolean;
}

interface InvariantTestResult {
  id: string;
  name: string;
  category: string;
  attemptedAction: string;
  expectedResult: 'Success' | 'Reverts';
  expectedRevertError?: string;
  actualStatus: 'pending' | 'passed' | 'failed';
  actualObserved: string;
  invariantDescription: string;
}

export function PolicyToProofExplorer({
  onAuthorizeMandate,
  networkMode = 'MONAD_TESTNET',
  isJudgeMode = false,
}: PolicyToProofExplorerProps) {
  // Preset 1: the deployed v1 MockTarget and its doSomething(uint256) selector (0xa6b206bf)
  const presets = [
    {
      id: 'canonical-payable-router',
      label: '01. Payable MockTarget (default)',
      prompt: `Authorize agent 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 to call payable contract ${DEFAULT_MOCK_TARGET_ADDRESS} with selector ${DO_SOMETHING_SELECTOR} (doSomething) transferring up to 0.2 MON native value per call for 1 hour.`,
      target: DEFAULT_MOCK_TARGET_ADDRESS as string,
      targetLabel: 'Payable MockTarget (deployed v1 demo target)',
      selector: DO_SOMETHING_SELECTOR as string,
      selectorName: DO_SOMETHING_SIGNATURE,
      perTxCap: '0.2',
      totalBudget: '1.0',
      durationHours: '1',
    },
    {
      id: 'treasury-transfer',
      label: '02. Treasury Transfer (Strict Selector)',
      prompt: 'Allow trading agent 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 to call DAO vault 0x1111111111111111111111111111111111111111 with selector 0xa9059cbb (transfer) transmitting up to 0.5 MON native value per call for 24 hours.',
      target: '0x1111111111111111111111111111111111111111',
      targetLabel: 'DAO Treasury Vault',
      selector: '0xa9059cbb',
      selectorName: 'transfer(address,uint256)',
      perTxCap: '0.5',
      totalBudget: '2.0',
      durationHours: '24',
    },
    {
      id: 'wildcard-relayer',
      label: '03. Gas Relayer (Wildcard Caution)',
      prompt: 'Grant relayer agent 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 permission to call forwarder contract 0x4444444444444444444444444444444444444444 with wildcard selector 0x00000000 transmitting up to 0.05 MON native value per call for 168 hours.',
      target: '0x4444444444444444444444444444444444444444',
      targetLabel: 'Gas Relayer Forwarder',
      selector: '0x00000000',
      selectorName: 'Wildcard (0x00000000)',
      perTxCap: '0.05',
      totalBudget: '0.5',
      durationHours: '168',
    },
  ];

  const [selectedPresetId, setSelectedPresetId] = useState('canonical-payable-router');
  const [customPrompt, setCustomPrompt] = useState(presets[0].prompt);

  // Active Policy
  const [policy, setPolicy] = useState<ParsedPolicy>({
    prompt: presets[0].prompt,
    agentAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    agentId: '42',
    targetAddress: presets[0].target,
    targetLabel: presets[0].targetLabel,
    selector: presets[0].selector,
    selectorName: presets[0].selectorName,
    perTxCap: presets[0].perTxCap,
    totalBudget: presets[0].totalBudget,
    durationHours: presets[0].durationHours,
    isWildcard: false,
  });

  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testsCompleted, setTestsCompleted] = useState(false);
  const [testResults, setTestResults] = useState<InvariantTestResult[]>([]);
  const [copiedBundle, setCopiedBundle] = useState(false);

  // Apply preset
  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setCustomPrompt(p.prompt);
    setPolicy({
      prompt: p.prompt,
      agentAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      agentId: '42',
      targetAddress: p.target,
      targetLabel: p.targetLabel,
      selector: p.selector,
      selectorName: p.selectorName,
      perTxCap: p.perTxCap,
      totalBudget: p.totalBudget,
      durationHours: p.durationHours,
      isWildcard: p.selector === '0x00000000',
    });
    setTestsCompleted(false);
    setTestResults([]);
  };

  // Run deterministic linter with strict validation (fail closed)
  const linterFindings: LinterFinding[] = [];

  // 1. Agent Address Validation
  if (!policy.agentAddress || !isAddress(policy.agentAddress)) {
    linterFindings.push({
      level: 'error',
      field: 'Agent Address',
      message: 'Missing or malformed agent address. Must be a 42-character Ethereum address (0x...).',
      actionableHint: 'Provide a valid Ethereum address for the authorized agent.',
      isBlocking: true,
    });
  } else {
    linterFindings.push({
      level: 'ok',
      field: 'Agent Address',
      message: `Bound strictly to agent address ${policy.agentAddress.slice(0, 10)}...${policy.agentAddress.slice(-6)}.`,
    });
  }

  // 2. Agent ID Validation
  const agentIdNum = parseInt(policy.agentId, 10);
  if (isNaN(agentIdNum) || agentIdNum < 0 || policy.agentId.trim() === '') {
    linterFindings.push({
      level: 'error',
      field: 'Agent ID',
      message: 'Agent ID must be a non-negative integer matching the ERC-8004 registry.',
      actionableHint: 'Specify a valid integer agent ID (e.g., 42).',
      isBlocking: true,
    });
  } else {
    linterFindings.push({
      level: 'ok',
      field: 'Agent ID',
      message: `Bound to registry identity Agent #${policy.agentId}.`,
    });
  }

  // 3. Target Address Validation
  if (!policy.targetAddress || !isAddress(policy.targetAddress)) {
    linterFindings.push({
      level: 'error',
      field: 'Target Address',
      message: 'Missing or malformed target contract address.',
      actionableHint: 'Provide a valid 42-character Ethereum contract address.',
      isBlocking: true,
    });
  } else {
    linterFindings.push({
      level: 'ok',
      field: 'Target Allowlist',
      message: `Target strictly locked to ${policy.targetLabel} (${policy.targetAddress.slice(0, 10)}...).`,
    });
  }

  // 4. Selector Validation
  const selectorRegex = /^0x[0-9a-fA-F]{8}$/;
  if (!policy.selector || !selectorRegex.test(policy.selector)) {
    linterFindings.push({
      level: 'error',
      field: 'Method Selector',
      message: `Selector must be a 4-byte hex string (e.g. ${DO_SOMETHING_SELECTOR} or 0x00000000 for wildcard).`,
      actionableHint: 'Provide an exact 10-character hex string starting with 0x.',
      isBlocking: true,
    });
  } else if (policy.isWildcard || policy.selector === '0x00000000') {
    linterFindings.push({
      level: 'warning',
      field: 'Method Selector',
      message: 'Wildcard selector (0x00000000) permits calling ANY function on the allowlisted target.',
      actionableHint: `Constrain to a 4-byte selector (e.g. ${DO_SOMETHING_SELECTOR}) unless building a generic relayer.`,
    });
  } else {
    linterFindings.push({
      level: 'ok',
      field: 'Method Selector',
      message: `Constrained to single method ${policy.selectorName} (${policy.selector}).`,
    });
  }

  // 5. Per-Transaction Native Cap Validation
  const numPerTx = parseFloat(policy.perTxCap);
  if (isNaN(numPerTx) || numPerTx <= 0) {
    linterFindings.push({
      level: 'error',
      field: 'Per-Transaction Cap',
      message: 'Per-transaction cap must be a positive finite amount of native MON.',
      actionableHint: 'Set a positive MON ceiling (e.g. 0.2 MON).',
      isBlocking: true,
    });
  } else {
    linterFindings.push({
      level: 'ok',
      field: 'Per-Transaction Cap',
      message: `Individual call native MON (msg.value) transmission capped at ${numPerTx} MON.`,
    });
  }

  // 6. Cumulative Vault Budget Validation
  const numTotal = parseFloat(policy.totalBudget);
  if (isNaN(numTotal) || numTotal <= 0) {
    linterFindings.push({
      level: 'error',
      field: 'Cumulative Vault Budget',
      message: 'Lifetime vault budget must be a positive finite amount of native MON.',
      actionableHint: 'Configure a positive total budget (e.g. 1.0 MON).',
      isBlocking: true,
    });
  } else if (numTotal < numPerTx) {
    linterFindings.push({
      level: 'error',
      field: 'Cumulative Vault Budget',
      message: `Lifetime budget (${numTotal} MON) cannot be less than per-transaction cap (${numPerTx} MON).`,
      actionableHint: 'Total budget must be greater than or equal to per-tx limit.',
      isBlocking: true,
    });
  } else {
    linterFindings.push({
      level: 'ok',
      field: 'Cumulative Vault Budget',
      message: `Lifetime spend capped at ${numTotal} MON native vault balance.`,
    });
  }

  // 7. Policy Expiry Validation
  const hours = parseInt(policy.durationHours, 10);
  if (isNaN(hours) || hours < 0) {
    linterFindings.push({
      level: 'error',
      field: 'Policy Expiry',
      message: 'Expiry duration must be a non-negative integer of hours.',
      actionableHint: 'Set an expiration duration in hours (e.g., 1 or 24, or 0 for permanent).',
      isBlocking: true,
    });
  } else if (hours === 0) {
    linterFindings.push({
      level: 'warning',
      field: 'Policy Expiry',
      message: 'Permanent mandate: does not auto-expire and requires manual on-chain revocation.',
      actionableHint: 'Set an explicit expiration duration to enforce automated time bounds.',
    });
  } else {
    linterFindings.push({
      level: 'ok',
      field: 'Policy Expiry',
      message: `Mandate self-expires in ${hours} hour(s) from passkey authorization.`,
    });
  }

  // Determine if authorization is blocked
  const blockingErrors = linterFindings.filter((f) => f.level === 'error');
  const isAuthorizationBlocked = blockingErrors.length > 0;

  // Run three attempted calls through a JavaScript copy of MandateManager.execute()'s checks,
  // using this exact policy. Simulated in the browser: nothing is sent to any chain.
  const handleRunInvariantTests = () => {
    if (isAuthorizationBlocked) return;
    setIsRunningTests(true);

    setTimeout(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      const perTx = parseEther(policy.perTxCap);
      const total = parseEther(policy.totalBudget);
      const hrs = parseInt(policy.durationHours, 10);
      // Same shape the Authorize step creates: vault deposit = total budget, nothing spent yet.
      const simulatedMandate: MandateItem = {
        id: 0n,
        owner: '0x0000000000000000000000000000000000000001',
        agentAddress: policy.agentAddress,
        agentId: BigInt(policy.agentId),
        maxValuePerTx: perTx,
        maxTotalValue: total,
        spentValue: 0n,
        balance: total,
        expiresAt: hrs > 0 ? BigInt(nowSec + hrs * 3600) : 0n,
        nonce: 0n,
        revoked: false,
        targets: [{ target: policy.targetAddress, selector: policy.selector }],
      };
      const callSelector = policy.selector === '0x00000000' ? DO_SOMETHING_SELECTOR : policy.selector;
      const safeValue = perTx / 2n;
      const excessValue = perTx * 3n;
      const rogue = '0xDeadDeAdDeADdeAdDeaddeadDEADdeAdDeadbEEf';

      const run = (
        base: Omit<InvariantTestResult, 'actualStatus' | 'actualObserved'>,
        action: { target: string; value: bigint }
      ): InvariantTestResult => {
        const error: V1ExecuteError | null = evaluateV1Execute(
          simulatedMandate,
          { caller: policy.agentAddress, callerLabel: 'Bound agent', target: action.target, selector: callSelector, value: action.value },
          nowSec
        );
        const expected = base.expectedRevertError ?? null;
        return {
          ...base,
          actualStatus: error === expected ? 'passed' : 'failed',
          actualObserved: error
            ? `Simulated check returns ${error}. The vault would be unchanged.`
            : `Simulated check allows the call (target and selector allowlisted, ${formatEther(action.value)} <= ${policy.perTxCap} MON per call).`,
        };
      };

      const generatedResults: InvariantTestResult[] = [
        run(
          {
            id: 'test-1-permitted',
            name: '1. Permitted Action (Compliant Call)',
            category: 'Allowed Path',
            attemptedAction: `Agent calls ${policy.selectorName} on ${policy.targetLabel} with ${formatEther(safeValue)} MON msg.value`,
            expectedResult: 'Success',
            invariantDescription: 'A call inside every bound goes through.',
          },
          { target: policy.targetAddress, value: safeValue }
        ),
        run(
          {
            id: 'test-2-rogue-target',
            name: '2. Rogue Destination Attack (Prompt Injection)',
            category: 'Policy Boundary',
            attemptedAction: `Prompt injection redirects ${formatEther(safeValue)} MON to attacker address ${rogue}`,
            expectedResult: 'Reverts',
            expectedRevertError: 'TargetNotAllowed()',
            invariantDescription: 'The call target must be on the allowlist.',
          },
          { target: rogue, value: safeValue }
        ),
        run(
          {
            id: 'test-3-ceiling-breach',
            name: '3. Ceiling Breach Attack (Over-Budget Action)',
            category: 'Accounting Limit',
            attemptedAction: `Agent sends ${formatEther(excessValue)} MON msg.value (over the ${policy.perTxCap} MON per-call cap)`,
            expectedResult: 'Reverts',
            expectedRevertError: 'ExceedsPerTxLimit()',
            invariantDescription: 'msg.value per call is capped at maxValuePerTx.',
          },
          { target: policy.targetAddress, value: excessValue }
        ),
      ];

      setTestResults(generatedResults);
      setIsRunningTests(false);
      setTestsCompleted(true);
    }, 300);
  };

  // Export Proof Bundle Dossier (honest client preflight simulation schema)
  const generateProofBundle = () => {
    const timestamp = new Date().toISOString();
    return {
      title: 'AgentTrust Policy-to-Proof Verification Dossier',
      timestamp,
      environment: {
        mode: networkMode,
        chain: networkMode === 'MONAD_TESTNET' ? 'Monad Testnet' : 'Local Sandbox',
        chainId: networkMode === 'MONAD_TESTNET' ? 10143 : 31337,
        configuredContract: DEFAULT_MANDATE_MANAGER_ADDRESS,
        simulationSource: "Browser simulation: a JavaScript copy of MandateManager.execute()'s checks run against this policy. Not an on-chain result.",
        reproducibleLocalChainProof: 'Run `npx tsx scripts/run-demo.ts` on local Anvil (Chain ID 31337) to inspect mined transactions.',
      },
      policyParameters: {
        agentAddress: policy.agentAddress,
        agentId: policy.agentId,
        targetAddress: policy.targetAddress,
        targetLabel: policy.targetLabel,
        selector: policy.selector,
        selectorName: policy.selectorName,
        maxValuePerTxNativeMON: policy.perTxCap,
        maxTotalBudgetNativeMON: policy.totalBudget,
        durationHours: policy.durationHours,
        valueEnforcementSemantic:
          'MandateManager spending caps strictly limit native MON (msg.value) transmission in the execution call.',
      },
      linterChecks: linterFindings.map((f) => ({
        field: f.field,
        level: f.level,
        message: f.message,
        isBlocking: f.isBlocking || false,
      })),
      invariantTestOutcomes: testResults.map((t) => ({
        testName: t.name,
        attemptedAction: t.attemptedAction,
        expected: t.expectedResult,
        observedSimulatedOutcome: t.actualObserved,
        simulatedCheck: t.actualStatus,
        evaluationType: 'browser_simulation',
      })),
      disclaimer:
        'These outcomes were computed in browser code by a JavaScript copy of the contract checks. Nothing was sent on-chain and this file is not a proof. To audit mined receipts, use the Receipts page or the recorded testnet transactions on Evidence & Proofs.',
    };
  };

  const handleCopyProofBundle = () => {
    const json = JSON.stringify(generateProofBundle(), null, 2);
    navigator.clipboard.writeText(json);
    setCopiedBundle(true);
    setTimeout(() => setCopiedBundle(false), 2000);
  };

  const handleDownloadProofBundle = () => {
    const json = JSON.stringify(generateProofBundle(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agenttrust-proof-bundle-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Fail-closed authorization trigger: zero silent defaults
  const handleProceedToPasskey = () => {
    if (isAuthorizationBlocked) {
      alert('Authorization is blocked: please resolve all policy validation errors before proceeding.');
      return;
    }

    const hours = parseInt(policy.durationHours, 10);
    const expiresAt =
      hours <= 0 ? 0n : BigInt(Math.floor(Date.now() / 1000) + hours * 3600);

    const params: CreateMandateParams = {
      agentAddress: policy.agentAddress as Address,
      agentId: BigInt(policy.agentId),
      targets: [
        {
          target: policy.targetAddress as Address,
          selector: policy.selector as Hex,
        },
      ],
      maxValuePerTx: parseEther(policy.perTxCap),
      maxTotalValue: parseEther(policy.totalBudget),
      depositValue: parseEther(policy.totalBudget),
      expiresAt,
    };

    onAuthorizeMandate(params);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Editorial Header */}
      <div
        className="security-card"
        style={{
          padding: '2rem 2.25rem',
          borderLeft: '4px solid var(--accent-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                Lab · legacy v1 prototype
              </span>
              <span className="badge badge-simulation" style={{ fontSize: '0.75rem' }}>
                Simulated in your browser
              </span>
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
              Policy-to-Proof Explorer
            </h1>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.35rem', maxWidth: '780px', lineHeight: 1.5 }}>
              From natural language intention to verifiable evidence: inspect how an authorized mandate compiles into EVM policy bounds, simulates defense against prompt injection attacks, and prepares a cryptographic authorization bundle.
            </p>
          </div>

          {/* Preset Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', minWidth: '260px' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Select Scenario Preset
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.id)}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    borderColor: selectedPresetId === preset.id ? 'var(--accent-primary)' : 'var(--border-default)',
                    background: selectedPresetId === preset.id ? 'var(--accent-primary-light)' : 'var(--bg-surface)',
                    color: selectedPresetId === preset.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontWeight: selectedPresetId === preset.id ? 700 : 500,
                    fontSize: '0.785rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4-STEP CONNECTED PIPELINE */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        
        {/* STEP 01 — INTENT */}
        <div className="security-card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'var(--accent-primary)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.8rem',
              }}
            >
              01
            </span>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              INTENT — Natural Language Agent Scope
            </h2>
          </div>

          <div
            style={{
              background: 'var(--bg-inset)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '1rem',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <Sparkles size={22} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                "{customPrompt}"
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Preset scenario: the fields below are this preset's values, shown next to the plain-English intent
              </div>
            </div>
          </div>
        </div>

        {/* STEP 02 — POLICY & LINTER */}
        <div className="security-card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--accent-primary)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                }}
              >
                02
              </span>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                POLICY & LINTER — On-Chain Enforceable Bounds
              </h2>
            </div>
            <span className="badge badge-neutral">Deterministic Security Linter</span>
          </div>

          {/* Architectural Semantic Callout */}
          <div
            style={{
              background: 'var(--accent-primary-light)',
              border: '1px solid var(--accent-monad-border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
            }}
          >
            <Info size={16} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Native Value Spending Boundary: </strong>
              MandateManager's spending ceiling constrains <strong>native MON (<code>msg.value</code>)</strong> transferred in the execution call. It does not measure internal ERC-20 token quantities encoded in calldata arguments. Future roadmap versions will introduce ABI-aware calldata argument inspection.
            </div>
          </div>

          {/* Structured Policy Field Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '0.85rem',
              marginBottom: '1.25rem',
            }}
          >
            <div className="mono-box">
              <span className="kpi-label">ALLOWLISTED TARGET</span>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '3px' }}>
                {policy.targetLabel}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', wordBreak: 'break-all' }}>
                {policy.targetAddress || 'Not configured'}
              </div>
            </div>

            <div className="mono-box">
              <span className="kpi-label">METHOD SELECTOR</span>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '3px' }}>
                {policy.selectorName}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {policy.selector}
              </div>
            </div>

            <div className="mono-box">
              <span className="kpi-label">PER-ACTION NATIVE CEILING</span>
              <div style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '1rem', marginTop: '2px' }}>
                {policy.perTxCap} MON (msg.value)
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Enforced at EVM boundary
              </div>
            </div>

            <div className="mono-box">
              <span className="kpi-label">LIFETIME VAULT BUDGET</span>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '3px' }}>
                {policy.totalBudget} MON
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Isolated vault cap
              </div>
            </div>

            <div className="mono-box">
              <span className="kpi-label">EXPIRY WINDOW</span>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '3px' }}>
                {policy.durationHours === '0' ? 'Permanent' : `${policy.durationHours} Hour(s)`}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Self-invalidating on-chain
              </div>
            </div>
          </div>

          {/* Actionable Policy Linter Findings */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Actionable Policy Linter Findings ({linterFindings.length})
              </div>
              {isAuthorizationBlocked && (
                <span className="badge badge-rose" style={{ fontSize: '0.7rem' }}>
                  <Ban size={10} /> {blockingErrors.length} Blocking Error(s)
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {linterFindings.map((finding, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    fontSize: '0.8rem',
                    padding: '0.45rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    background: finding.level === 'ok' ? 'var(--accent-emerald-subtle)' : finding.level === 'warning' ? 'var(--accent-amber-subtle)' : 'var(--accent-rose-subtle)',
                    border: `1px solid ${finding.level === 'ok' ? 'var(--accent-emerald-border)' : finding.level === 'warning' ? 'var(--accent-amber-border)' : 'var(--accent-rose-border)'}`,
                  }}
                >
                  {finding.level === 'ok' ? (
                    <CheckCircle2 size={16} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  ) : finding.level === 'warning' ? (
                    <AlertTriangle size={16} color="var(--accent-amber)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  ) : (
                    <XCircle size={16} color="var(--accent-rose)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: finding.level === 'ok' ? 'var(--accent-emerald)' : finding.level === 'warning' ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>
                      [{finding.field}]
                    </strong>{' '}
                    <span style={{ color: 'var(--text-primary)' }}>{finding.message}</span>
                    {finding.actionableHint && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        💡 <em>Remedy: {finding.actionableHint}</em>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* STEP 03 — SECURITY INVARIANT TESTS */}
        <div className="security-card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--accent-primary)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                }}
              >
                03
              </span>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                SECURITY INVARIANT TESTS: simulated in your browser
              </h2>
            </div>
            
            <button
              className="btn-primary"
              onClick={handleRunInvariantTests}
              disabled={isRunningTests || isAuthorizationBlocked}
              title={isAuthorizationBlocked ? 'Fix the blocking linter errors first' : undefined}
              style={{ fontSize: '0.825rem', padding: '0.5rem 1rem' }}
            >
              <Play size={14} />
              {isRunningTests ? 'Running simulated checks...' : 'Run Simulated Checks Against This Policy'}
            </button>
          </div>

          <div
            style={{
              background: 'var(--bg-inset)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 0.85rem',
              marginBottom: '1rem',
              fontSize: '0.785rem',
              color: 'var(--text-secondary)',
            }}
          >
            <strong>Simulated, not on-chain:</strong> each attempted call goes through a JavaScript copy of the checks in <code>MandateManager.execute()</code>, using this policy. Nothing is sent to any chain. Real reverts for the same checks are recorded on Monad Testnet (see Evidence &amp; Proofs), and <code>npx tsx scripts/run-demo.ts</code> replays them on local Anvil (chain 31337).
          </div>

          {/* Test Cards */}
          {testResults.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '2.5rem 1rem',
                background: 'var(--bg-inset)',
                borderRadius: 'var(--radius-lg)',
                border: '1px dashed var(--border-default)',
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Awaiting Invariant Test Execution
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Click "Run Simulated Checks Against This Policy" above to check a compliant call and two attacks against this policy.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {testResults.map((test) => {
                const isSuccessTest = test.expectedResult === 'Success';
                return (
                  <div
                    key={test.id}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      borderLeft: `4px solid ${isSuccessTest ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.45rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{test.name}</strong>
                        <span className={`badge ${isSuccessTest ? 'badge-emerald' : 'badge-rose'}`}>
                          Expected: {test.expectedResult}
                        </span>
                        <span className="badge badge-neutral">{test.category}</span>
                      </div>
                      <span className={`badge ${test.actualStatus === 'passed' ? 'badge-emerald' : 'badge-rose'}`} style={{ fontSize: '0.7rem' }}>
                        {test.actualStatus === 'passed' ? 'Simulated check: as expected' : 'Simulated check: unexpected result'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                      <strong>Action Attempted:</strong> {test.attemptedAction}
                    </div>

                    <div
                      style={{
                        fontSize: '0.785rem',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-inset)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <strong>Simulated result:</strong> {test.actualObserved}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* STEP 04 — EVIDENCE & PROOF BUNDLE EXPORT */}
        <div className="security-card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--accent-primary)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                }}
              >
                04
              </span>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                EVIDENCE: policy dossier (JSON export, simulated)
              </h2>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn-secondary"
                onClick={handleCopyProofBundle}
                style={{ fontSize: '0.785rem', padding: '0.45rem 0.75rem' }}
                title="Copy structured JSON proof bundle"
              >
                {copiedBundle ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
                {copiedBundle ? 'Copied Dossier' : 'Copy JSON Dossier'}
              </button>
              <button
                className="btn-secondary"
                onClick={handleDownloadProofBundle}
                style={{ fontSize: '0.785rem', padding: '0.45rem 0.75rem' }}
                title="Download JSON proof bundle"
              >
                <Download size={14} />
                Download JSON
              </button>
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-inset)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              border: '1px solid var(--border-subtle)',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              Cryptographic Receipt Verification Flow
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
              <div style={{ padding: '0.4rem 0.75rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', fontWeight: 600 }}>
                1. Monad RPC Receipt
              </div>
              <ArrowRight size={14} color="var(--text-muted)" />
              <div style={{ padding: '0.4rem 0.75rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', fontWeight: 600 }}>
                2. ActionExecuted Log
              </div>
              <ArrowRight size={14} color="var(--text-muted)" />
              <div style={{ padding: '0.4rem 0.75rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', fontWeight: 600 }}>
                3. SDK Decode & Assertion
              </div>
              <ArrowRight size={14} color="var(--text-muted)" />
              <div style={{ padding: '0.4rem 0.75rem', background: 'var(--accent-emerald-subtle)', color: 'var(--accent-emerald)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-emerald-border)', fontWeight: 700 }}>
                4. Verified Policy Fields
              </div>
            </div>

            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
              The AgentTrust TypeScript SDK independent auditor validates transaction inclusion, deployed bytecode, contract origin, and parameters directly against RPC nodes without trusting centralized server logs.
            </div>
          </div>

          {/* Primary Action Button with Fail-Closed Blocking Enforcement */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)', display: 'block' }}>
                {isAuthorizationBlocked ? 'Policy Authorization Blocked' : 'Ready to Authorize this Mandate?'}
              </strong>
              <span style={{ fontSize: '0.785rem', color: isAuthorizationBlocked ? 'var(--accent-rose)' : 'var(--text-secondary)' }}>
                {isAuthorizationBlocked
                  ? `Fix ${blockingErrors.length} blocking linter error(s) above before signing with hardware passkey.`
                  : 'Opens the v1 create form with these limits. For the live passkey flow, use Passkey Mandates.'}
              </span>
            </div>

            <button
              className="btn-primary"
              onClick={handleProceedToPasskey}
              disabled={isAuthorizationBlocked}
              style={{
                fontSize: '0.875rem',
                padding: '0.65rem 1.4rem',
                opacity: isAuthorizationBlocked ? 0.5 : 1,
                cursor: isAuthorizationBlocked ? 'not-allowed' : 'pointer',
              }}
              title={isAuthorizationBlocked ? 'Resolve blocking errors before authorizing' : 'Authorize with passkey'}
            >
              {isAuthorizationBlocked ? <Ban size={16} /> : <KeyRound size={16} />}
              {isAuthorizationBlocked ? 'Authorization Blocked by Linter' : 'Authorize Mandate with Passkey'}
              {!isAuthorizationBlocked && <ArrowRight size={15} />}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
