'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar, NAV_TABS, LAB_TABS, type NavTab } from '../components/Sidebar';
import { PageHead, LegacyNote } from '../components/PageHead';
import { HomeView } from '../components/HomeView';
import { VerifyLab } from '../components/VerifyLab';
import { Developers } from '../components/Developers';
import { MandateList } from '../components/MandateList';
import { PolicyToProofExplorer } from '../components/PolicyToProofExplorer';
import { AiPolicyCopilot } from '../components/AiPolicyCopilot';
import { AttackLab, type AttackScenario } from '../components/AttackLab';
import { ReceiptInspector } from '../components/ReceiptInspector';
import { EvidenceHub } from '../components/EvidenceHub';
import { PasskeyConsole } from '../components/PasskeyConsole';
import { JudgeMode } from '../components/JudgeMode';
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
import { RPC_URL } from '../lib/agentMandates';
import {
  Shield,
  ShieldCheck,
  Plus,
  Sparkles,
  SearchCode,
  FileText,
  Lock,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Radio,
  ExternalLink,
  ChevronDown,
  X,
  ArrowRight,
  Target,
  Code,
  Coins,
  CreditCard,
  Clock,
  Info,
  BookOpen,
  Layers,
  KeyRound,
  Check,
  Route,
} from 'lucide-react';

export default function SecurityConsoleDashboard() {
  const [activeTab, setActiveTabState] = useState<NavTab>('home');

  // Every tab has a shareable URL: /#judge, /#passkey, ...
  const setActiveTab = useCallback((tab: NavTab) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const hash = tab === 'home' ? '' : `#${tab}`;
      if (window.location.hash !== hash) history.pushState(null, '', hash || window.location.pathname);
      window.scrollTo({ top: 0 });
    }
  }, []);

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace('#', '') as NavTab;
      setActiveTabState(NAV_TABS.includes(h) ? h : 'home');
    };
    fromHash();
    window.addEventListener('popstate', fromHash);
    window.addEventListener('hashchange', fromHash);
    return () => {
      window.removeEventListener('popstate', fromHash);
      window.removeEventListener('hashchange', fromHash);
    };
  }, []);

  // Persisted runtime mode (LOCAL_SIMULATION | MONAD_TESTNET), read after mount to keep SSR and client in sync
  const [networkMode, setNetworkMode] = useState<'LOCAL_SIMULATION' | 'MONAD_TESTNET'>('MONAD_TESTNET');
  useEffect(() => {
    const stored = localStorage.getItem('agenttrust.networkMode');
    if (stored === 'LOCAL_SIMULATION' || stored === 'MONAD_TESTNET') setNetworkMode(stored);
  }, []);

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connectedChainId, setConnectedChainId] = useState<number | null>(null);
  const [isContractDeployed, setIsContractDeployed] = useState<boolean | null>(null);
  const [isCheckingContract, setIsCheckingContract] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [revokingId, setRevokingId] = useState<bigint | null>(null);
  const [copilotDraft, setCopilotDraft] = useState<Partial<CreateMandateParams> | null>(null);
  const [isNetworkDropdownOpen, setIsNetworkDropdownOpen] = useState(false);
  const [statusAlert, setStatusAlert] = useState<{
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
  } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsNetworkDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Local Simulated Mandates State
  const [simulatedMandates, setSimulatedMandates] = useState<MandateItem[]>([]);

  // Real Monad Testnet Mandates State
  const [testnetMandates, setTestnetMandates] = useState<MandateItem[]>([]);

  // Simulated Activities State
  const [simulatedActivities, setSimulatedActivities] = useState<ActivityItem[]>([]);

  // Real Monad Testnet Activities State
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
        transport: http(RPC_URL),
      });
      const code = await client.getBytecode({ address: DEFAULT_MANDATE_MANAGER_ADDRESS });
      const deployed = !!code && code !== '0x' && code.length > 2;
      setIsContractDeployed(deployed);
      return deployed;
    } catch (err) {
      console.warn('Could not read MandateManager bytecode:', err);
      setIsContractDeployed(false);
      return false;
    } finally {
      setIsCheckingContract(false);
    }
  }, []);

  useEffect(() => {
    // Only the v1 lab views need this, so the product pages never wait on it
    if (networkMode === 'MONAD_TESTNET' && LAB_TABS.includes(activeTab) && isContractDeployed === null) {
      checkContractOnTestnet();
    }
  }, [networkMode, activeTab, isContractDeployed, checkContractOnTestnet]);

  // Connect Wallet Handler
  const handleConnectWallet = async () => {
    try {
      if (typeof window === 'undefined' || !(window as any).ethereum) {
        if (networkMode === 'LOCAL_SIMULATION') {
          setWalletAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
          setConnectedChainId(31337);
          setStatusAlert({ type: 'info', message: 'Connected simulated test wallet (0xf39F...2266).' });
          return;
        }
        alert('MetaMask or Web3 wallet extension not detected. Running in sandbox read-only mode.');
        return;
      }

      const client = createWalletClient({
        chain: MONAD_TESTNET_CONFIG as any,
        transport: custom((window as any).ethereum),
      });

      const [address] = await client.requestAddresses();
      setWalletAddress(address);

      const chainIdHex = await (window as any).ethereum.request({ method: 'eth_chainId' });
      const chainId = parseInt(chainIdHex, 16);
      setConnectedChainId(chainId);

      if (networkMode === 'MONAD_TESTNET' && chainId !== 10143) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x279f' }], // 10143 in hex
          });
          setConnectedChainId(10143);
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await (window as any).ethereum.request({
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
      console.error('Wallet connection error:', err);
      setStatusAlert({ type: 'error', message: err.message || 'Failed to connect wallet.' });
    }
  };

  const handleToggleNetworkMode = (mode: 'LOCAL_SIMULATION' | 'MONAD_TESTNET') => {
    setNetworkMode(mode);
    setIsNetworkDropdownOpen(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('agenttrust.networkMode', mode);
    }
    setStatusAlert({
      type: 'info',
      message:
        mode === 'MONAD_TESTNET'
          ? 'Switched to Monad Testnet mode (Chain 10143). Queries routed to live RPC.'
          : 'Switched to Local Simulation sandbox mode. Offline scenario execution active.',
    });
  };

  // Revoke Mandate Handler
  const handleRevoke = async (id: bigint) => {
    setRevokingId(id);
    if (networkMode === 'MONAD_TESTNET') {
      try {
        if (!walletAddress) {
          throw new Error('Please connect your wallet to submit on-chain revocation.');
        }
        if (connectedChainId !== 10143) {
          throw new Error('Please switch network to Monad Testnet (Chain ID 10143) in your wallet.');
        }

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

        setStatusAlert({ type: 'info', message: `Revocation transaction submitted: ${hash.slice(0, 10)}... Waiting for Monad confirmation...` });
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

        // 3. Hardware Passkey Prompt
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
          const newId = (await publicClient.readContract({
            address: DEFAULT_MANDATE_MANAGER_ADDRESS,
            abi: MandateManagerABI,
            functionName: 'nextMandateId',
          })) - 1n;

          const createdMandate: MandateItem = {
            id: newId,
            owner: walletAddress,
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
              id: `tx-${txHash}`,
              type: 'executed',
              agentId: params.agentId,
              mandateId: newId,
              target: params.targets[0]?.target ?? '0x0000000000000000000000000000000000000000',
              selector: params.targets[0]?.selector ?? '0x00000000',
              value: params.depositValue ?? 0n,
              timestamp: 'Just now',
              txHash,
            },
            ...prev,
          ]);

          setStatusAlert({ type: 'success', message: `Mandate #${newId} confirmed on Monad Testnet! Tx: ${txHash}` });
        }
      } else {
        // Local simulation path
        const ownerAddress = walletAddress || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
        const nextNonce = BigInt(simulatedMandates.length);

        const challengeHash = computeMandateHash({
          chainId: 31337,
          mandateManagerAddress: DEFAULT_MANDATE_MANAGER_ADDRESS,
          owner: ownerAddress as Address,
          agentAddress: params.agentAddress,
          agentId: params.agentId,
          targets: params.targets,
          maxValuePerTx: params.maxValuePerTx,
          maxTotalValue: params.maxTotalValue,
          expiresAt: params.expiresAt,
          nonce: nextNonce,
        });

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
        message: 'Attack Simulation Lab runs against isolated local contract scenarios. Switch to LOCAL SIMULATION mode to exercise the local attack scenarios.',
      });
      return;
    }

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

  const TAB_TITLES: Record<NavTab, [string, string]> = {
    home: ['Product', 'Home'],
    passkey: ['Product', 'Passkey Mandates'],
    judge: ['Product', 'Judge Mode'],
    verify: ['Product', 'Verify an Agent'],
    docs: ['Product', 'Developers'],
    overview: ['Lab', 'Policy Overview'],
    'policy-to-proof': ['Lab', 'Policy-to-Proof'],
    mandates: ['Lab', 'Wallet Mandates'],
    copilot: ['Lab', 'Policy Builder'],
    'attack-lab': ['Lab', 'Attack Lab'],
    inspector: ['Lab', 'Receipts'],
    evidence: ['Lab', 'Evidence & Proofs'],
    activity: ['Lab', 'Security Activity'],
  };
  const [crumbGroup, crumbTitle] = TAB_TITLES[activeTab];
  const isLab = LAB_TABS.includes(activeTab);

  return (
    <div className="app-shell">
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

      <div className="main-content">
        <header className="top-bar">
          <div className="top-bar-crumbs crumbs">
            <span>{crumbGroup}</span>
            <span className="sep">/</span>
            <b>{crumbTitle}</b>
          </div>

          <div className="top-bar-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {!isLab ? (
              <>
                <span className="chip-net static">
                  <span className="net-dot" /> Monad Testnet
                </span>
                <span className="chip-net static">
                  <KeyRound size={13} /> No wallet needed
                </span>
              </>
            ) : (
              <>
                <div style={{ position: 'relative' }} ref={dropdownRef}>
                  <button className="chip-net" onClick={() => setIsNetworkDropdownOpen(!isNetworkDropdownOpen)}>
                    <span className={`status-dot ${networkMode === 'MONAD_TESTNET' ? 'emerald' : 'amber'}`} />
                    <span>{networkMode === 'MONAD_TESTNET' ? 'Monad Testnet · 10143' : 'Local Sandbox · 31337'}</span>
                    <ChevronDown size={14} />
                  </button>
                  {isNetworkDropdownOpen && (
                    <div className="dropdown">
                      <button
                        className={`dropdown-item ${networkMode === 'MONAD_TESTNET' ? 'on' : ''}`}
                        onClick={() => handleToggleNetworkMode('MONAD_TESTNET')}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="status-dot emerald" /> Monad Testnet (10143)
                        </span>
                        {networkMode === 'MONAD_TESTNET' && <Check size={14} />}
                      </button>
                      <button
                        className={`dropdown-item ${networkMode === 'LOCAL_SIMULATION' ? 'on' : ''}`}
                        onClick={() => handleToggleNetworkMode('LOCAL_SIMULATION')}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="status-dot amber" /> Local Simulation (Sandbox)
                        </span>
                        {networkMode === 'LOCAL_SIMULATION' && <Check size={14} />}
                      </button>
                    </div>
                  )}
                </div>
                <button className="btn-outline-purple" onClick={handleConnectWallet} style={{ fontSize: '0.8rem', padding: '0.42rem 0.9rem', borderRadius: 999 }}>
                  <Wallet size={15} />
                  <span>{walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : 'Connect wallet'}</span>
                </button>
              </>
            )}
          </div>
        </header>

        {statusAlert && (
          <div className={`toast toast-${statusAlert.type}`} role="status">
            <div>
              {statusAlert.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{statusAlert.message}</span>
            </div>
            <button onClick={() => setStatusAlert(null)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}

        <main className="page-container page-enter" key={activeTab}>
          {activeTab === 'home' && <HomeView onNavigate={setActiveTab} />}

          {activeTab === 'passkey' && <PasskeyConsole />}

          {activeTab === 'judge' && <JudgeMode />}

          {activeTab === 'verify' && <VerifyLab />}

          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <LegacyNote onGo={() => setActiveTab('passkey')} />
              {/* Notification Banner matching reference */}
              <div
                style={{
                  background: 'var(--accent-primary-light)',
                  border: '1px solid var(--accent-monad-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'var(--accent-primary)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  i
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  <strong style={{ color: 'var(--accent-monad)', fontWeight: 700, letterSpacing: '0.02em' }}>
                    {walletAddress ? 'ACTIVE SESSION' : 'READ-ONLY'}
                  </strong>
                  <span style={{ margin: '0 0.5rem', color: 'var(--accent-monad)' }}>·</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {walletAddress
                      ? `Wallet ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} connected on ${networkMode === 'MONAD_TESTNET' ? 'Monad Testnet (10143)' : 'Local Sandbox'}.`
                      : 'Connect a wallet to load live mandates.'}
                  </span>
                </div>
              </div>

              {/* Hero Title & Actions */}
              <div>
                <h1
                  style={{
                    fontSize: '2.5rem',
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.03em',
                    lineHeight: 1.15,
                  }}
                >
                  Agent authority, under control.
                </h1>
                <p
                  style={{
                    fontSize: '1.1rem',
                    color: 'var(--text-secondary)',
                    marginTop: '0.45rem',
                    fontWeight: 400,
                  }}
                >
                  Scope every action. Enforce every limit. Verify every receipt.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setCopilotDraft(null);
                      setIsModalOpen(true);
                    }}
                    style={{ padding: '0.65rem 1.25rem', fontSize: '0.875rem' }}
                  >
                    <Plus size={16} strokeWidth={2.5} />
                    Create mandate
                  </button>

                  <button
                    className="btn-secondary"
                    onClick={() => setActiveTab('policy-to-proof')}
                    style={{ padding: '0.65rem 1.25rem', fontSize: '0.875rem' }}
                  >
                    <Route size={16} color="var(--accent-primary)" />
                    <span>Run guided demo</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>

              {/* Central Comparison Showcase Card ("AGENT REQUEST" vs "ON-CHAIN POLICY") */}
              <div
                className="security-card"
                style={{
                  padding: '2rem 2.25rem',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(280px, 1fr) auto minmax(320px, 1.2fr)',
                  gap: '2.5rem',
                  alignItems: 'center',
                }}
              >
                {/* Left Column: AGENT REQUEST */}
                <div>
                  <div
                    style={{
                      fontSize: '0.725rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      marginBottom: '1rem',
                    }}
                  >
                    AGENT REQUEST
                  </div>

                  <div
                    style={{
                      background: 'var(--bg-canvas)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '2rem 1.75rem',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '1rem',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ flexShrink: 0, marginTop: '2px' }}>
                      <Sparkles size={20} color="var(--accent-primary)" />
                    </div>
                    <div
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        lineHeight: 1.4,
                      }}
                    >
                      Call payable execution router with selector <code>doSomething(uint256)</code> transferring up to 0.2 native MON for 1 hour.
                    </div>
                  </div>
                </div>

                {/* Center Divider with Lock Badge */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    height: '100%',
                    padding: '0 0.5rem',
                  }}
                >
                  {/* Vertical rule line */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      background: 'var(--border-subtle)',
                      zIndex: 1,
                    }}
                  />

                  {/* Circular Enforced Badge */}
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                      boxShadow: '0 4px 10px rgba(89, 68, 219, 0.3)',
                      zIndex: 2,
                    }}
                  >
                    <Lock size={18} strokeWidth={2.4} />
                  </div>

                  <div
                    style={{
                      fontSize: '0.68rem',
                      color: 'var(--text-secondary)',
                      textAlign: 'center',
                      marginTop: '0.5rem',
                      zIndex: 2,
                      background: 'var(--bg-surface)',
                      padding: '0 4px',
                      lineHeight: 1.25,
                      fontWeight: 500,
                    }}
                  >
                    Enforced by<br />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>MandateManager</span>
                  </div>
                </div>

                {/* Right Column: ON-CHAIN POLICY */}
                <div>
                  <div
                    style={{
                      fontSize: '0.725rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      marginBottom: '1rem',
                    }}
                  >
                    ON-CHAIN POLICY
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {/* Row 1: Target */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingBottom: '0.65rem',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <Target size={16} />
                        <span>Target</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Payable MockTarget Router (0x3333...3333)
                      </div>
                    </div>

                    {/* Row 2: Method & Selector */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingBottom: '0.65rem',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <Code size={16} />
                        <span>Method</span>
                      </div>
                      <div className="mono-value" style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
                        doSomething(uint256) [0x50824e4f]
                      </div>
                    </div>

                    {/* Row 3: Native Value Cap per call */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingBottom: '0.65rem',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <Coins size={16} />
                        <span>Native msg.value Cap</span>
                      </div>
                      <div className="mono-value" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        0.2 MON per call
                      </div>
                    </div>

                    {/* Row 4: Total budget */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingBottom: '0.65rem',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <CreditCard size={16} />
                        <span>Cumulative Budget</span>
                      </div>
                      <div className="mono-value" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        1.0 MON
                      </div>
                    </div>

                    {/* Row 5: Expiry */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <Clock size={16} />
                        <span>Expiry</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                        1 hour after authorization
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom 2 Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Left Card: Latest policy decisions */}
                <div
                  className="security-card"
                  style={{
                    padding: '1.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '260px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <FileText size={18} color="var(--text-primary)" />
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Latest policy decisions
                    </h2>
                  </div>

                  {currentActivities.length === 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2rem 1rem',
                        textAlign: 'center',
                      }}
                    >
                      {/* Document icon rounded box */}
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '10px',
                          background: 'var(--bg-canvas)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-muted)',
                          marginBottom: '0.75rem',
                        }}
                      >
                        <FileText size={24} />
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        No live decisions yet
                      </div>
                      <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Connect wallet or run local simulation
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {currentActivities.slice(0, 3).map((act) => (
                        <div
                          key={act.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.6rem 0.85rem',
                            background: 'var(--bg-canvas)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <span
                              className={`badge ${
                                act.type === 'executed'
                                  ? 'badge-emerald'
                                  : act.type === 'blocked'
                                  ? 'badge-rose'
                                  : 'badge-amber'
                              }`}
                              style={{ fontSize: '0.68rem' }}
                            >
                              {act.type.toUpperCase()}
                            </span>
                            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              Agent #{act.agentId.toString()}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{act.timestamp}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn-link-purple"
                      onClick={() => setActiveTab('mandates')}
                      style={{ fontSize: '0.8rem', padding: 0 }}
                    >
                      View all mandates <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Right Card: Evidence you can verify */}
                <div
                  className="security-card"
                  style={{
                    padding: '1.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '260px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                      <ShieldCheck size={18} color="var(--text-primary)" />
                      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Evidence you can verify
                      </h2>
                    </div>

                    {/* Step flow diagram matching reference */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                        marginTop: '0.75rem',
                      }}
                    >
                      {/* Step 1 */}
                      <div
                        style={{
                          background: 'var(--bg-lavender-pill)',
                          borderRadius: 'var(--radius-md)',
                          padding: '0.55rem 0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontSize: '0.785rem',
                          color: 'var(--text-primary)',
                          fontWeight: 500,
                        }}
                      >
                        <FileText size={15} color="var(--accent-primary)" />
                        <span>Transaction receipt</span>
                      </div>

                      <ArrowRight size={14} color="var(--text-muted)" />

                      {/* Step 2 */}
                      <div
                        style={{
                          background: 'var(--bg-lavender-pill)',
                          borderRadius: 'var(--radius-md)',
                          padding: '0.55rem 0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontSize: '0.785rem',
                          color: 'var(--text-primary)',
                          fontWeight: 500,
                        }}
                      >
                        <Code size={15} color="var(--accent-primary)" />
                        <span>Contract event</span>
                      </div>

                      <ArrowRight size={14} color="var(--text-muted)" />

                      {/* Step 3 */}
                      <div
                        style={{
                          background: 'var(--bg-lavender-pill)',
                          borderRadius: 'var(--radius-md)',
                          padding: '0.55rem 0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontSize: '0.785rem',
                          color: 'var(--text-primary)',
                          fontWeight: 500,
                        }}
                      >
                        <Shield size={15} color="var(--accent-primary)" />
                        <span>Policy fields</span>
                      </div>
                    </div>

                    {/* Open receipt verifier link */}
                    <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn-link-purple"
                        onClick={() => setActiveTab('policy-to-proof')}
                        style={{ padding: 0, fontSize: '0.85rem' }}
                      >
                        <Route size={14} />
                        <span>Explore Policy-to-Proof</span>
                      </button>
                      <button
                        className="btn-link-purple"
                        onClick={() => setActiveTab('inspector')}
                        style={{ padding: 0, fontSize: '0.85rem' }}
                      >
                        <ExternalLink size={14} />
                        <span>Open receipt verifier</span>
                      </button>
                    </div>
                  </div>

                  {/* Disclaimer subtext */}
                  <div
                    style={{
                      fontSize: '0.725rem',
                      color: 'var(--text-muted)',
                      marginTop: '1.25rem',
                      display: 'flex',
                      gap: '0.5rem',
                    }}
                  >
                    <span>Example policy</span>
                    <span>·</span>
                    <span>Not authorized</span>
                    <span>·</span>
                    <span>No live chain activity displayed</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: POLICY-TO-PROOF EXPLORER (JUDGE MODE) */}
          {activeTab === 'policy-to-proof' && (
            <PolicyToProofExplorer
              onAuthorizeMandate={(params) => {
                setCopilotDraft(params);
                setIsModalOpen(true);
              }}
              networkMode={networkMode}
              isJudgeMode={true}
            />
          )}

          {/* TAB: MANDATES */}
          {activeTab === 'mandates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <PageHead eyebrow="Lab · v1" title={'Mandates Ledger'} sub={'Cryptographically authorized delegation bounds enforced by Monad smart contracts.'} />
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    className="btn-secondary"
                    onClick={() => setActiveTab('copilot')}
                    style={{ fontSize: '0.85rem' }}
                  >
                    <Sparkles size={14} color="#A08FFF" />
                    Policy Builder Draft
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setCopilotDraft(null);
                      setIsModalOpen(true);
                    }}
                    style={{ fontSize: '0.85rem' }}
                  >
                    <Plus size={15} strokeWidth={2.5} />
                    Create Mandate
                  </button>
                </div>
              </div>

              {networkMode === 'MONAD_TESTNET' && isContractDeployed === false && (
                <div
                  className="security-card"
                  style={{
                    padding: '1.25rem',
                    borderLeft: '4px solid var(--accent-amber-border)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.85rem',
                    background: 'var(--accent-amber-subtle)',
                  }}
                >
                  <AlertCircle size={20} color="#FBBF24" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--accent-amber)' }}>
                      Contract Bytecode Not Deployed on Monad Testnet
                    </strong>
                    <p style={{ fontSize: '0.825rem', color: 'var(--accent-amber)', marginTop: '0.25rem' }}>
                      The configured address <code style={{ fontWeight: 600 }}>{DEFAULT_MANDATE_MANAGER_ADDRESS}</code> currently has 0 bytes bytecode on Monad Testnet RPC.
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--accent-amber)', marginTop: '0.35rem' }}>
                      You can deploy contract bytecode with <code style={{ fontWeight: 600 }}>forge script script/Deploy.s.sol</code> or switch to <strong>Local Simulation</strong> to demo the passkey authorization lifecycle instantly.
                    </p>
                  </div>
                </div>
              )}

              <MandateList
                mandates={currentMandates}
                onRevoke={handleRevoke}
                onOpenCreate={() => setIsModalOpen(true)}
                onExploreDemo={() => setActiveTab('policy-to-proof')}
                isRevokingId={revokingId}
                networkMode={networkMode}
              />
            </div>
          )}

          {/* TAB: ATTACK LAB */}
          {activeTab === 'attack-lab' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <PageHead eyebrow="Lab · v1" title={'Attack Simulation Lab'} sub={'Test contract security invariants against prompt injection, unapproved targets, ceiling violations, and stranger hijacking.'} />

              <AttackLab onScenarioExecuted={handleScenarioRun} />
            </div>
          )}

          {/* TAB: RECEIPTS (INSPECTOR) */}
          {activeTab === 'inspector' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <PageHead eyebrow="Lab · v1" title={'Trust & Receipt Explorer'} sub={'Independently audit transaction receipts, contract logs, and cryptographic bounds against the Monad RPC.'} />

              <ReceiptInspector />
            </div>
          )}

          {/* TAB: EVIDENCE & TESTNET PROOFS */}
          {activeTab === 'evidence' && (
            <EvidenceHub />
          )}

          {/* TAB: DEVELOPERS */}
          {activeTab === 'docs' && <Developers />}

          {/* TAB: COPILOT */}
          {activeTab === 'copilot' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <PageHead eyebrow="Lab · v1" title={'Policy Builder (rule-based parser)'} sub={'Translate plain English agent permissions into deterministic on-chain mandate parameters.'} />

              <AiPolicyCopilot onDraftApproved={handleCopilotDraftApproved} />
            </div>
          )}

          {/* TAB: ACTIVITY */}
          {activeTab === 'activity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <PageHead eyebrow="Lab · v1" title={'Security Activity Feed'} sub={'Full audit trail of passkey creations, executed actions, and blocked invariants.'} />

              <SecurityActivityFeed
                activities={currentActivities}
                networkMode={networkMode}
              />
            </div>
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
