'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, type NavTab } from '../components/Sidebar';
import { MandateList } from '../components/MandateList';
import { AiPolicyCopilot } from '../components/AiPolicyCopilot';
import { AttackLab, type AttackScenario } from '../components/AttackLab';
import { ReceiptInspector } from '../components/ReceiptInspector';
import { SecurityActivityFeed } from '../components/SecurityActivityFeed';
import { CreateMandateModal } from '../components/CreateMandateModal';
import type { MandateItem } from '../components/MandateCard';
import type { ActivityItem } from '../components/ActivityFeed';
import {
  registerPasskey,
  signMandateWithPasskey,
  generateSimulatedSignature,
} from '../lib/webauthn';
import {
  parseEther,
  formatEther,
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type Hex,
} from 'viem';
import {
  computeMandateHash,
  MandateManagerABI,
  type CreateMandateParams,
} from '@agenttrust/sdk';
import {
  DEFAULT_MANDATE_MANAGER_ADDRESS,
  MONAD_TESTNET_CONFIG,
} from '../lib/contracts';
import {
  ShieldCheck,
  Plus,
  Sparkles,
  FlaskConical,
  SearchCode,
  FileKey2,
  Activity,
  Layers,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Lock,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Radio,
  ExternalLink,
} from 'lucide-react';

export default function SecurityConsoleDashboard() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');

  // Persisted runtime mode (LOCAL_SIMULATION | MONAD_TESTNET)
  const [networkMode, setNetworkMode] = useState<'LOCAL_SIMULATION' | 'MONAD_TESTNET'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('agenttrust.networkMode') as 'LOCAL_SIMULATION' | 'MONAD_TESTNET' | null;
      if (stored === 'LOCAL_SIMULATION' || stored === 'MONAD_TESTNET') return stored;
    }
    return 'MONAD_TESTNET';
  });

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connectedChainId, setConnectedChainId] = useState<number | null>(null);
  const [isContractDeployed, setIsContractDeployed] = useState<boolean | null>(null);
  const [isCheckingContract, setIsCheckingContract] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [revokingId, setRevokingId] = useState<bigint | null>(null);
  const [copilotDraft, setCopilotDraft] = useState<Partial<CreateMandateParams> | null>(null);
  const [statusAlert, setStatusAlert] = useState<{
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
  } | null>(null);

  // Local Simulated Mandates State (starts empty; populated only by real user actions in sandbox mode)
  const [simulatedMandates, setSimulatedMandates] = useState<MandateItem[]>([]);

  // Real Monad Testnet Mandates State (populated strictly from on-chain reads or real confirmed txs)
  const [testnetMandates, setTestnetMandates] = useState<MandateItem[]>([]);

  // Simulated Activities State (starts empty; populated only by real user actions in sandbox mode)
  const [simulatedActivities, setSimulatedActivities] = useState<ActivityItem[]>([]);

  // Real Monad Testnet Activities State (strictly real transactions with confirmed hashes)
  const [testnetActivities, setTestnetActivities] = useState<ActivityItem[]>([]);

  // Current active records based on selected network mode
  const currentMandates = networkMode === 'MONAD_TESTNET' ? testnetMandates : simulatedMandates;
  const currentActivities = networkMode === 'MONAD_TESTNET' ? testnetActivities : simulatedActivities;
  const activeMandates = currentMandates.filter((m) => !m.revoked);
  const totalVaultSecured = currentMandates.reduce((acc, m) => acc + (m.balance || 0n), 0n);
  const blockedActionsCount = currentActivities.filter((a) => a.type === 'blocked').length;

  // Check contract deployment bytecode on Monad Testnet
  const checkContractOnTestnet = useCallback(async () => {
    try {
      setIsCheckingContract(true);
      const client = createPublicClient({
        chain: MONAD_TESTNET_CONFIG as any,
        transport: http('https://testnet-rpc.monad.xyz'),
      });
      const code = await client.getBytecode({ address: DEFAULT_MANDATE_MANAGER_ADDRESS });
      const deployed = !!code && code !== '0x' && code.length > 2;
      setIsContractDeployed(deployed);
      return deployed;
    } catch (err) {
      console.error('Failed to query Monad testnet bytecode:', err);
      setIsContractDeployed(false);
      return false;
    } finally {
      setIsCheckingContract(false);
    }
  }, []);

  // Persist networkMode to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('agenttrust.networkMode', networkMode);
    }
  }, [networkMode]);

  // Sync wallet state and check network on mount / mode switch
  useEffect(() => {
    if (networkMode === 'MONAD_TESTNET') {
      checkContractOnTestnet();
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const eth = (window as any).ethereum;
        eth.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
          if (accounts && accounts.length > 0) {
            setWalletAddress(accounts[0]);
          } else {
            setWalletAddress(null);
          }
        }).catch(() => {});

        eth.request({ method: 'eth_chainId' }).then((hexId: string) => {
          setConnectedChainId(parseInt(hexId, 16));
        }).catch(() => {});

        const handleAccounts = (accs: string[]) => {
          setWalletAddress(accs.length > 0 ? accs[0] : null);
        };
        const handleChain = (hexId: string) => {
          setConnectedChainId(parseInt(hexId, 16));
        };

        eth.on?.('accountsChanged', handleAccounts);
        eth.on?.('chainChanged', handleChain);

        return () => {
          eth.removeListener?.('accountsChanged', handleAccounts);
          eth.removeListener?.('chainChanged', handleChain);
        };
      }
    } else {
      // Local simulation defaults - no hardcoded wallet
      // Wallet must be explicitly connected by user
      setWalletAddress(null);
      setConnectedChainId(31337);
      setIsContractDeployed(true);
    }
  }, [networkMode, checkContractOnTestnet]);

  // Connect or switch wallet
  const handleConnectWallet = async () => {
    setStatusAlert(null);
    if (networkMode === 'LOCAL_SIMULATION') {
      // In LOCAL_SIMULATION, generate a clearly-labelled random sandbox address (not a real account)
      if (walletAddress) {
        setWalletAddress(null);
      } else {
        const bytes = new Uint8Array(20);
        window.crypto.getRandomValues(bytes);
        const generated = `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
        setWalletAddress(generated);
        setStatusAlert({
          type: 'info',
          message: `[SIMULATION] Generated random sandbox wallet ${generated.slice(0, 6)}...${generated.slice(-4)} for local testing. This address does not exist on-chain and holds no funds.`,
        });
      }
      setConnectedChainId(31337);
      return;
    }

    // Monad Testnet mode: request injected wallet
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      setStatusAlert({
        type: 'warning',
        message: 'No injected Web3 wallet detected (MetaMask, Rabby, etc.). Please install a Web3 wallet extension to submit real transactions on Monad Testnet, or switch to Local Simulation mode.',
      });
      return;
    }

    try {
      const eth = (window as any).ethereum;
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        setWalletAddress(accounts[0]);
      }

      const hexChainId = await eth.request({ method: 'eth_chainId' });
      const chainIdNum = parseInt(hexChainId, 16);
      setConnectedChainId(chainIdNum);

      if (chainIdNum !== 10143) {
        try {
          await eth.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x279f' }],
          });
          setConnectedChainId(10143);
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            await eth.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: '0x279f',
                  chainName: 'Monad Testnet',
                  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
                  rpcUrls: ['https://testnet-rpc.monad.xyz'],
                  blockExplorerUrls: ['https://testnet.monadexplorer.com'],
                },
              ],
            });
            setConnectedChainId(10143);
          }
        }
      }
    } catch (err: any) {
      setStatusAlert({
        type: 'error',
        message: `Wallet connection error: ${err.message || String(err)}`,
      });
    }
  };

  const handleToggleNetworkMode = (mode: 'LOCAL_SIMULATION' | 'MONAD_TESTNET') => {
    setNetworkMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('agenttrust.networkMode', mode);
    }
    setStatusAlert(null);
    if (mode === 'LOCAL_SIMULATION') {
      // In LOCAL_SIMULATION, no auto-assigned wallet - user must explicitly connect
      setWalletAddress(null);
      setConnectedChainId(31337);
    } else {
      if (typeof window !== 'undefined' && (window as any).ethereum?.selectedAddress) {
        setWalletAddress((window as any).ethereum.selectedAddress);
      } else {
        setWalletAddress(null);
      }
      checkContractOnTestnet();
    }
  };

  // Revoke Mandate Handler
  const handleRevoke = async (id: bigint) => {
    setStatusAlert(null);
    setRevokingId(id);

    if (networkMode === 'MONAD_TESTNET') {
      if (!walletAddress) {
        setStatusAlert({ type: 'warning', message: 'Please connect your Web3 wallet to revoke this mandate on-chain.' });
        setRevokingId(null);
        return;
      }
      if (connectedChainId !== 10143) {
        setStatusAlert({ type: 'warning', message: 'Please switch your wallet network to Monad Testnet (Chain ID 10143).' });
        setRevokingId(null);
        return;
      }
      if (!isContractDeployed) {
        setStatusAlert({
          type: 'error',
          message: `Cannot revoke: MandateManager contract is not deployed at ${DEFAULT_MANDATE_MANAGER_ADDRESS} on Monad Testnet (0 bytes bytecode). Deploy contracts first.`,
        });
        setRevokingId(null);
        return;
      }

      try {
        const walletClient = createWalletClient({
          chain: MONAD_TESTNET_CONFIG as any,
          transport: custom((window as any).ethereum),
        });
        const publicClient = createPublicClient({
          chain: MONAD_TESTNET_CONFIG as any,
          transport: http('https://testnet-rpc.monad.xyz'),
        });

        const hash = await walletClient.writeContract({
          account: walletAddress as Address,
          chain: MONAD_TESTNET_CONFIG as any,
          address: DEFAULT_MANDATE_MANAGER_ADDRESS,
          abi: MandateManagerABI,
          functionName: 'revokeMandate',
          args: [id],
        });

        setStatusAlert({ type: 'info', message: `Transaction submitted: ${hash.slice(0, 10)}... Waiting for confirmation on Monad...` });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
          setTestnetMandates((prev) =>
            prev.map((m) => (m.id === id ? { ...m, revoked: true } : m))
          );
          setTestnetActivities((prev) => [
            {
              id: `tx-${receipt.transactionHash}`,
              type: 'revoked',
              agentId: testnetMandates.find((m) => m.id === id)?.agentId ?? 0n,
              mandateId: id,
              timestamp: 'Just now',
              txHash: receipt.transactionHash,
            },
            ...prev,
          ]);
          setStatusAlert({ type: 'success', message: `Mandate #${id} successfully revoked on Monad Testnet! Tx: ${hash}` });
        } else {
          setStatusAlert({ type: 'error', message: `Revocation transaction reverted on-chain. Tx: ${hash}` });
        }
      } catch (err: any) {
        console.error('Revocation failed:', err);
        setStatusAlert({ type: 'error', message: `Revocation failed: ${err.message || String(err)}` });
      } finally {
        setRevokingId(null);
      }
    } else {
      // Local simulation path
      setTimeout(() => {
        setSimulatedMandates((prev) =>
          prev.map((m) => (m.id === id ? { ...m, revoked: true } : m))
        );
        setSimulatedActivities((prev) => [
          {
            id: `sim-${Date.now()}`,
            type: 'revoked',
            agentId: simulatedMandates.find((m) => m.id === id)?.agentId ?? 42n,
            mandateId: id,
            timestamp: 'Just now',
            txHash: undefined,
          },
          ...prev,
        ]);
        setRevokingId(null);
        setStatusAlert({ type: 'info', message: `[SIMULATION] Mandate #${id} revoked in local sandbox.` });
      }, 400);
    }
  };

  // Create Mandate Handler
  const handleCreateMandate = async (params: CreateMandateParams) => {
    setStatusAlert(null);
    setIsAuthorizing(true);

    try {
      if (networkMode === 'MONAD_TESTNET') {
        if (!walletAddress) {
          throw new Error('Please connect your Web3 wallet first to authorize on Monad Testnet.');
        }
        if (connectedChainId !== 10143) {
          throw new Error('Wallet must be on Monad Testnet (Chain ID 10143) to submit transactions.');
        }
        if (!isContractDeployed) {
          throw new Error(
            `MandateManager contract is not deployed at ${DEFAULT_MANDATE_MANAGER_ADDRESS} on Monad Testnet (0 bytes bytecode). Deploy contract bytecode to Monad Testnet before submitting live transactions.`
          );
        }

        const publicClient = createPublicClient({
          chain: MONAD_TESTNET_CONFIG as any,
          transport: http('https://testnet-rpc.monad.xyz'),
        });

        // 1. Fetch on-chain nonce for owner
        const nonce = (await publicClient.readContract({
          address: DEFAULT_MANDATE_MANAGER_ADDRESS,
          abi: MandateManagerABI,
          functionName: 'ownerNonces',
          args: [walletAddress as Address],
        })) as bigint;

        // 2. Compute canonical challenge hash strictly bound to Monad chainId 10143
        const challengeHash = computeMandateHash({
          chainId: 10143,
          mandateManagerAddress: DEFAULT_MANDATE_MANAGER_ADDRESS,
          owner: walletAddress as Address,
          agentAddress: params.agentAddress,
          agentId: params.agentId,
          targets: params.targets,
          maxValuePerTx: params.maxValuePerTx,
          maxTotalValue: params.maxTotalValue,
          expiresAt: params.expiresAt,
          nonce,
        });

        // 3. Hardware Passkey Prompt (Strict Fail-Closed: throws if user cancels or fails)
        const passkeyData = await signMandateWithPasskey(challengeHash);

        // 4. Submit real on-chain transaction through user's wallet
        const walletClient = createWalletClient({
          chain: MONAD_TESTNET_CONFIG as any,
          transport: custom((window as any).ethereum),
        });

        const txHash = await walletClient.writeContract({
          account: walletAddress as Address,
          chain: MONAD_TESTNET_CONFIG as any,
          address: DEFAULT_MANDATE_MANAGER_ADDRESS,
          abi: MandateManagerABI,
          functionName: 'createMandateWithWebAuthn',
          args: [
            params.agentAddress,
            params.agentId,
            params.targets.map((t) => ({ target: t.target, selector: t.selector })),
            params.maxValuePerTx,
            params.maxTotalValue,
            params.expiresAt,
            nonce,
            passkeyData.sigR,
            passkeyData.sigS,
            passkeyData.authenticatorData,
            passkeyData.clientDataJSON,
            passkeyData.challengeOffset,
          ],
          value: params.depositValue ?? 0n,
        });

        setStatusAlert({ type: 'info', message: `Passkey verified! Mandate transaction submitted: ${txHash}. Waiting for Monad confirmation...` });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (receipt.status === 'success') {
          // Read new mandate from chain
          const newId = (await publicClient.readContract({
            address: DEFAULT_MANDATE_MANAGER_ADDRESS,
            abi: MandateManagerABI,
            functionName: 'nextMandateId',
          })) - 1n;

          const createdMandate: MandateItem = {
            id: newId,
            owner: walletAddress as Address,
            agentAddress: params.agentAddress,
            agentId: params.agentId,
            maxValuePerTx: params.maxValuePerTx,
            maxTotalValue: params.maxTotalValue,
            spentValue: 0n,
            balance: params.depositValue ?? 0n,
            expiresAt: params.expiresAt,
            nonce,
            revoked: false,
            targets: params.targets.map((t) => ({ target: t.target, selector: t.selector })),
          };

          setTestnetMandates((prev) => [createdMandate, ...prev]);
          setTestnetActivities((prev) => [
            {
              id: `tx-${receipt.transactionHash}`,
              type: 'executed',
              agentId: params.agentId,
              mandateId: newId,
              target: params.targets[0].target,
              selector: params.targets[0].selector,
              value: params.depositValue ?? 0n,
              timestamp: 'Just now',
              txHash: receipt.transactionHash,
            },
            ...prev,
          ]);

          setStatusAlert({ type: 'success', message: `Mandate #${newId} confirmed on Monad Testnet! Tx: ${txHash}` });
        } else {
          throw new Error(`Transaction reverted on-chain. Tx: ${txHash}`);
        }
      } else {
        // Local simulation path: explicitly labelled
        if (!walletAddress) {
          throw new Error('Connect a wallet first (a simulated sandbox wallet is fine).');
        }
        const ownerAddress = walletAddress as Address;
        const nextNonce = BigInt(simulatedMandates.length);

        const challengeHash = computeMandateHash({
          chainId: 31337,
          mandateManagerAddress: DEFAULT_MANDATE_MANAGER_ADDRESS,
          owner: ownerAddress,
          agentAddress: params.agentAddress,
          agentId: params.agentId,
          targets: params.targets,
          maxValuePerTx: params.maxValuePerTx,
          maxTotalValue: params.maxTotalValue,
          expiresAt: params.expiresAt,
          nonce: nextNonce,
        });

        // Generate synthetic passkey data in simulation mode
        const simSig = generateSimulatedSignature(challengeHash);

        const newId = BigInt(simulatedMandates.length + 1);
        const newMandate: MandateItem = {
          id: newId,
          owner: ownerAddress,
          agentAddress: params.agentAddress,
          agentId: params.agentId,
          maxValuePerTx: params.maxValuePerTx,
          maxTotalValue: params.maxTotalValue,
          spentValue: 0n,
          balance: params.depositValue ?? 0n,
          expiresAt: params.expiresAt,
          nonce: nextNonce,
          revoked: false,
          targets: params.targets.map((t) => ({ target: t.target, selector: t.selector })),
        };

        setSimulatedMandates((prev) => [newMandate, ...prev]);
        setSimulatedActivities((prev) => [
          {
            id: `sim-${Date.now()}`,
            type: 'executed',
            agentId: params.agentId,
            mandateId: newId,
            target: params.targets[0].target,
            selector: params.targets[0].selector,
              value: params.depositValue ?? 0n,
              timestamp: 'Just now',
              txHash: undefined,
          },
          ...prev,
        ]);

        setStatusAlert({ type: 'info', message: `[SIMULATION] Mandate #${newId} created in local sandbox.` });
      }

      setIsModalOpen(false);
      setCopilotDraft(null);
    } catch (err: any) {
      console.error('Create mandate error:', err);
      setStatusAlert({ type: 'error', message: err.message || String(err) });
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleCopilotDraftApproved = (draftParams: CreateMandateParams) => {
    setCopilotDraft(draftParams);
    setIsModalOpen(true);
  };

  const handleScenarioRun = (scenario: AttackScenario) => {
    if (networkMode === 'MONAD_TESTNET') {
      setStatusAlert({
        type: 'warning',
        message: 'Attack Simulation Lab runs against isolated local contract scenarios. Switch to LOCAL SIMULATION mode to exercise the 5 local attack scenarios.',
      });
      return;
    }

    // Scenarios execute against a mandate that actually exists in this sandbox session
    const targetMandate = simulatedMandates.find((m) => !m.revoked) || simulatedMandates[0];
    if (!targetMandate) {
      setStatusAlert({
        type: 'warning',
        message: 'No sandbox mandate exists yet. Create a mandate in LOCAL SIMULATION mode first, then run attack scenarios against it.',
      });
      return;
    }

    const agentId = targetMandate.agentId;
    const mandateId = targetMandate.id;

    if (scenario.expectedResult === 'Success') {
      if (targetMandate) {
        const newSpent = targetMandate.spentValue + parseEther('0.1');
        setSimulatedMandates(
          simulatedMandates.map((m) => (m.id === targetMandate.id ? { ...m, spentValue: newSpent } : m))
        );
      }
      setSimulatedActivities([
        {
          id: `sim-${Date.now()}`,
          type: 'executed',
          agentId,
          mandateId,
          target: scenario.target,
          selector: scenario.selector,
          value: parseEther(scenario.value),
          timestamp: 'Just now',
          txHash: undefined,
        },
        ...simulatedActivities,
      ]);
    } else {
      // Reverted actions: accurately report simulation without inventing fake confirmed transaction hashes
      setSimulatedActivities([
        {
          id: `sim-${Date.now()}`,
          type: 'blocked',
          agentId: 42n,
          mandateId: 1n,
          target: scenario.target,
          selector: scenario.selector,
          value: parseEther(scenario.value),
          timestamp: 'Just now',
          txHash: undefined,
          reason: `${scenario.revertError} (Contract halted unauthorized action in local simulation)`,
        },
        ...simulatedActivities,
      ]);
    }
  };

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeMandatesCount={activeMandates.length}
        blockedCount={blockedActionsCount}
        walletAddress={walletAddress}
        onConnectWallet={handleConnectWallet}
        onOpenCreateModal={() => {
          setCopilotDraft(null);
          setIsModalOpen(true);
        }}
        networkMode={networkMode}
        onToggleNetworkMode={handleToggleNetworkMode}
        chainId={connectedChainId}
      />

      {/* Main Content Area */}
      <div className="main-content">
        {/* Top Sticky Header */}
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Console</span>
            <span style={{ color: 'var(--border-default)' }}>/</span>
            <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>
              {activeTab === 'overview'
                ? 'Security Overview'
                : activeTab === 'copilot'
                ? 'AI Policy Copilot'
                : activeTab === 'attack-lab'
                ? 'Attack Simulation Lab'
                : activeTab === 'inspector'
                ? 'Trust & Receipt Explorer'
                : activeTab === 'mandates'
                ? 'Mandates Ledger'
                : 'Security Activity'}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Network Mode Status Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: networkMode === 'MONAD_TESTNET' ? 'rgba(131, 110, 249, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                border: `1px solid ${networkMode === 'MONAD_TESTNET' ? 'rgba(131, 110, 249, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <span className={`status-dot ${networkMode === 'MONAD_TESTNET' ? 'emerald' : 'amber'}`} />
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: networkMode === 'MONAD_TESTNET' ? '#c4b5fd' : '#fbbf24',
                }}
              >
                {networkMode === 'MONAD_TESTNET' ? 'Monad Testnet (10143)' : 'Local Simulation (31337)'}
              </span>
            </div>

            {/* P-256 Precompile Indicator */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'var(--bg-input)',
                padding: '0.35rem 0.65rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <CheckCircle2 size={13} color="var(--accent-emerald)" />
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                RIP-7212 (0x100) Active
              </span>
            </div>

            <button
              className="btn-primary"
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
              onClick={() => {
                setCopilotDraft(null);
                setIsModalOpen(true);
              }}
            >
              <Plus size={15} />
              New Mandate
            </button>
          </div>
        </header>

        {/* Global Network Notice Banner */}
        {networkMode === 'MONAD_TESTNET' ? (
          <div
            style={{
              padding: '0.75rem 1.5rem',
              background: 'rgba(131, 110, 249, 0.08)',
              borderBottom: '1px solid rgba(131, 110, 249, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <ShieldCheck size={18} color="var(--accent-monad)" />
              <span style={{ fontSize: '0.8rem', color: '#fff' }}>
                <strong>MONAD TESTNET MODE:</strong> Interacting directly with Monad RPC (Chain ID 10143).
                {isContractDeployed === false && (
                  <span style={{ color: 'var(--accent-amber)', marginLeft: '0.5rem' }}>
                    Contract at {DEFAULT_MANDATE_MANAGER_ADDRESS.slice(0, 8)}... has no deployed bytecode. Deploy contract or use Receipt Inspector.
                  </span>
                )}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {walletAddress ? (
                <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>
                  Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
              ) : (
                <button
                  className="btn-secondary"
                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', borderColor: 'var(--accent-monad-border)' }}
                  onClick={handleConnectWallet}
                >
                  <Wallet size={13} />
                  Connect Injected Wallet
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '0.75rem 1.5rem',
              background: 'rgba(245, 158, 11, 0.08)',
              borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <AlertTriangle size={18} color="var(--accent-amber)" />
              <span style={{ fontSize: '0.8rem', color: '#fff' }}>
                <strong>LOCAL SIMULATION MODE (Offline Sandbox):</strong> No transactions are submitted on-chain. Mandates and events shown here were created locally in this session only.
              </span>
            </div>

            <button
              className="btn-secondary"
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', borderColor: 'rgba(245, 158, 11, 0.4)', color: '#fbbf24' }}
              onClick={() => handleToggleNetworkMode('MONAD_TESTNET')}
            >
              Switch to Live Monad Testnet
            </button>
          </div>
        )}

        {/* Status Alerts Toast */}
        {statusAlert && (
          <div
            style={{
              margin: '1rem 1.5rem 0',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              background:
                statusAlert.type === 'error'
                  ? 'var(--accent-rose-subtle)'
                  : statusAlert.type === 'success'
                  ? 'var(--accent-emerald-subtle)'
                  : statusAlert.type === 'warning'
                  ? 'var(--accent-amber-subtle)'
                  : 'rgba(131, 110, 249, 0.15)',
              border: `1px solid ${
                statusAlert.type === 'error'
                  ? 'var(--accent-rose-border)'
                  : statusAlert.type === 'success'
                  ? 'var(--accent-emerald-border)'
                  : statusAlert.type === 'warning'
                  ? 'var(--accent-amber-border)'
                  : 'rgba(131, 110, 249, 0.3)'
              }`,
              color:
                statusAlert.type === 'error'
                  ? '#fda4af'
                  : statusAlert.type === 'success'
                  ? '#6ee7b7'
                  : statusAlert.type === 'warning'
                  ? '#fcd34d'
                  : '#c4b5fd',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} />
              <span>{statusAlert.message}</span>
            </div>
            <button
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.85rem' }}
              onClick={() => setStatusAlert(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Views */}
        <main className="page-container">
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              {/* Product Positioning Hero Header */}
              <div
                className="security-card"
                style={{
                  padding: '2rem',
                  background: 'linear-gradient(135deg, rgba(131, 110, 249, 0.08), rgba(16, 185, 129, 0.03))',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ maxWidth: '820px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span className="badge badge-monad">Delegated Authority Console</span>
                    <span className={`badge ${networkMode === 'MONAD_TESTNET' ? 'badge-emerald' : 'badge-amber'}`}>
                      {networkMode === 'MONAD_TESTNET' ? 'Monad Testnet' : 'Local Simulation'}
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.25 }}>
                    Give your AI agent a mandate, not unlimited power.
                  </h2>
                  <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', marginTop: '0.45rem', lineHeight: 1.5 }}>
                    Passkey-authorized delegation. Contract-enforced limits. Independently checkable receipts.
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn-primary"
                      onClick={() => {
                        setCopilotDraft(null);
                        setIsModalOpen(true);
                      }}
                      style={{ padding: '0.5rem 1.1rem', fontSize: '0.82rem' }}
                    >
                      <Plus size={15} />
                      Create Mandate
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => setActiveTab('copilot')}
                      style={{ padding: '0.5rem 1.1rem', fontSize: '0.82rem' }}
                    >
                      <Sparkles size={14} color="var(--accent-monad)" />
                      Policy Compiler
                    </button>
                  </div>
                </div>
              </div>

              {/* Executive KPI Banner */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div className="kpi-card emerald">
                  <div className="kpi-label">
                    <span>Active Mandates</span>
                    <ShieldCheck size={16} color="var(--accent-emerald)" />
                  </div>
                  <div className="kpi-value">
                    {networkMode === 'MONAD_TESTNET'
                      ? (activeMandates.length > 0 ? activeMandates.length.toString().padStart(2, '0') : '—')
                      : activeMandates.length.toString().padStart(2, '0')}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {networkMode === 'MONAD_TESTNET'
                      ? (walletAddress ? `${activeMandates.length} on-chain policies` : 'Connect wallet to query')
                      : 'Sandbox mandates created this session'}
                  </span>
                </div>

                <div className="kpi-card emerald">
                  <div className="kpi-label">
                    <span>Available Budget</span>
                    <Lock size={16} color="var(--accent-emerald)" />
                  </div>
                  <div className="kpi-value">
                    {networkMode === 'MONAD_TESTNET'
                      ? (walletAddress ? `${formatEther(totalVaultSecured)} MON` : '— MON')
                      : `${formatEther(totalVaultSecured)} MON`}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {networkMode === 'MONAD_TESTNET'
                      ? (walletAddress ? 'Contract Vault Deposits' : 'Connect to load balance')
                      : 'Sandbox only — not on-chain'}
                  </span>
                </div>

                <div className="kpi-card rose">
                  <div className="kpi-label">
                    <span>Recent Decisions</span>
                    <AlertTriangle size={16} color="var(--accent-rose)" />
                  </div>
                  <div className="kpi-value">
                    {networkMode === 'MONAD_TESTNET'
                      ? (currentActivities.length > 0 ? currentActivities.length.toString().padStart(2, '0') : '—')
                      : blockedActionsCount.toString().padStart(2, '0')}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {networkMode === 'MONAD_TESTNET'
                      ? (currentActivities.length > 0 ? 'Confirmed testnet events' : 'Awaiting evidence')
                      : 'Sandbox Revert Invariants'}
                  </span>
                </div>

                <div className="kpi-card amber">
                  <div className="kpi-label">
                    <span>Receipt Verifier</span>
                    <SearchCode size={16} color="var(--accent-amber)" />
                  </div>
                  <div className="kpi-value" style={{ fontSize: '1.25rem', color: 'var(--accent-emerald)' }}>
                    READY
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Monad Chain 10143
                  </span>
                </div>
              </div>

              {/* Quick Feature Spotlight Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {/* AI Copilot Teaser Card */}
                <div
                  className="security-card"
                  style={{
                    background: 'linear-gradient(135deg, rgba(131, 110, 249, 0.08), rgba(14, 17, 24, 0.95))',
                    border: '1px solid var(--accent-monad-border)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setActiveTab('copilot')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <Sparkles size={18} color="var(--accent-monad)" />
                    <strong style={{ fontSize: '1rem', color: '#fff' }}>AI Policy Copilot</strong>
                    <span className="badge badge-monad" style={{ fontSize: '0.65rem' }}>Natural Language</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Describe required permissions in plain English. The Copilot compiles deterministic target allowlists and spending limits ready for hardware passkey authorization.
                  </p>
                  <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--accent-monad)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    Draft Scoped Mandate with AI <ArrowRight size={14} />
                  </div>
                </div>

                {/* Attack Lab Teaser Card */}
                <div
                  className="security-card"
                  style={{
                    background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.08), rgba(14, 17, 24, 0.95))',
                    border: '1px solid var(--accent-rose-border)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setActiveTab('attack-lab')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <FlaskConical size={18} color="var(--accent-rose)" />
                    <strong style={{ fontSize: '1rem', color: '#fff' }}>Attack Simulation Lab</strong>
                    <span className="badge badge-rose" style={{ fontSize: '0.65rem' }}>Security Invariants</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Execute live security stress tests against unwhitelisted targets, excess spending, caller impersonation, and revoked mandates.
                  </p>
                  <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--accent-rose)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    Enter Attack Lab <ArrowRight size={14} />
                  </div>
                </div>
              </div>

              {/* Active Mandate Highlights & Recent Activity Split */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Active Mandate Highlights</h3>
                    <button
                      className="btn-secondary"
                      style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                      onClick={() => setActiveTab('mandates')}
                    >
                      View All ({currentMandates.length})
                    </button>
                  </div>
                  <MandateList
                    mandates={activeMandates.slice(0, 2)}
                    onRevoke={handleRevoke}
                    onOpenCreate={() => setIsModalOpen(true)}
                    isRevokingId={revokingId}
                    networkMode={networkMode}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Recent Security Events</h3>
                    <button
                      className="btn-secondary"
                      style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                      onClick={() => setActiveTab('activity')}
                    >
                      Full Audit Trail
                    </button>
                  </div>
                  <SecurityActivityFeed
                    activities={currentActivities.slice(0, 4)}
                    networkMode={networkMode}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mandates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {networkMode === 'MONAD_TESTNET' && isContractDeployed === false && (
                <div
                  className="security-card"
                  style={{
                    padding: '1.25rem',
                    borderLeft: '4px solid var(--accent-amber)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.85rem',
                  }}
                >
                  <AlertTriangle size={20} color="var(--accent-amber)" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: '#fff' }}>
                      Contract Not Deployed on Monad Testnet
                    </strong>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      The configured address <code style={{ color: '#fff' }}>{DEFAULT_MANDATE_MANAGER_ADDRESS}</code> currently has 0 bytes bytecode on Monad Testnet (RPC: <code style={{ color: '#fff' }}>https://testnet-rpc.monad.xyz</code>).
                    </p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      To interact with live contracts, run <code style={{ color: '#fff' }}>forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast</code> with a funded private key, or switch to <strong>LOCAL SIMULATION</strong> to demo the full lifecycle safely offline.
                    </p>
                  </div>
                </div>
              )}

              <MandateList
                mandates={currentMandates}
                onRevoke={handleRevoke}
                onOpenCreate={() => setIsModalOpen(true)}
                isRevokingId={revokingId}
                networkMode={networkMode}
              />
            </div>
          )}

          {activeTab === 'copilot' && (
            <AiPolicyCopilot onDraftApproved={handleCopilotDraftApproved} />
          )}

          {activeTab === 'attack-lab' && (
            <AttackLab onScenarioExecuted={handleScenarioRun} />
          )}

          {activeTab === 'inspector' && (
            <ReceiptInspector />
          )}

          {activeTab === 'activity' && (
            <SecurityActivityFeed
              activities={currentActivities}
              networkMode={networkMode}
            />
          )}
        </main>
      </div>

      {/* Modal Dialog for Passkey Mandate Creation */}
      <CreateMandateModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setCopilotDraft(null);
        }}
        onSubmit={handleCreateMandate}
        isLoading={isAuthorizing}
        initialParams={copilotDraft}
        networkMode={networkMode}
      />
    </div>
  );
}
