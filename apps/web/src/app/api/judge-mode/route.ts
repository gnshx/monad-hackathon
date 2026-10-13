import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  checkJudgeStatus,
  explainRelayerError,
  runJudgeModeSequence,
  type JudgeStatusResult,
} from '@/lib/judge-mode-runner';
import { judgeV2RunCost, runJudgeModeV2 } from '@/lib/judge-v2-runner';
import { checkRateLimit, recordExecution } from '@/lib/rate-limit';
import {
  DEFAULT_MANDATE_MANAGER_ADDRESS,
  DEFAULT_MOCK_TARGET_ADDRESS,
} from '@/lib/contracts';
import { AGENT_MANDATES_ADDRESS } from '@/lib/agentMandates';

export const dynamic = 'force-dynamic';
// Six to seven transactions with receipts; Vercel's default function timeout can be shorter.
export const maxDuration = 60;

const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';

/** v2 (AgentMandates, the passkey primitive) unless explicitly pinned to the v1 MandateManager. */
const USE_V1 = process.env.JUDGE_MODE_VERSION === 'v1';
/** MockTarget deployed with AgentMandates on testnet (deployments.mandates.json). */
const V2_DEFAULT_TARGET = '0xd856e20dbf9280299739efdc0082e431fa644e73' as Address;
const V2_TARGET = (process.env.JUDGE_TARGET || process.env.NEXT_PUBLIC_DEMO_TARGET || V2_DEFAULT_TARGET) as Address;

function getRelayerKey(): Hex | undefined {
  return (
    (process.env.RELAYER_PRIVATE_KEY as Hex) ||
    (process.env.DEPLOYER_PRIVATE_KEY as Hex) ||
    (process.env.PRIVATE_KEY as Hex)
  );
}

function relayerAddressOrUndefined(): Address | undefined {
  const key = getRelayerKey();
  try {
    return key ? privateKeyToAccount(key).address : undefined;
  } catch {
    return undefined;
  }
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '127.0.0.1';
}

type Status = JudgeStatusResult & { version: 'v1' | 'v2'; agentMandates?: Address; target?: Address };

/** Same honesty checks as v1 (chain id, bytecode, funded relayer), against AgentMandates. */
async function checkV2Status(publicClient: PublicClient, relayerKey?: Hex): Promise<Status> {
  const base = {
    version: 'v2' as const,
    contracts: { mandateManager: AGENT_MANDATES_ADDRESS, mockTarget: V2_TARGET },
    agentMandates: AGENT_MANDATES_ADDRESS,
    target: V2_TARGET,
  };
  let chainId = 0;
  try {
    chainId = await publicClient.getChainId();
  } catch {
    return { ...base, deployed: false, chainId: 0, lowFunds: true, message: 'Failed to connect to Monad testnet RPC' };
  }
  if (chainId !== 10143) {
    return { ...base, deployed: false, chainId, lowFunds: true, message: `Connected chain ID is ${chainId}, expected 10143 (Monad Testnet)` };
  }
  const [code, targetCode] = await Promise.all([
    publicClient.getBytecode({ address: AGENT_MANDATES_ADDRESS }).catch(() => null),
    publicClient.getBytecode({ address: V2_TARGET }).catch(() => null),
  ]);
  if (!code || code === '0x' || !targetCode || targetCode === '0x') {
    return { ...base, deployed: false, chainId, lowFunds: false, message: 'Not deployed on Monad testnet' };
  }
  if (!relayerKey) {
    return { ...base, deployed: true, chainId, lowFunds: true, message: 'Server relayer key not configured' };
  }
  const relayerAddress = privateKeyToAccount(relayerKey).address;
  const [balance, required] = await Promise.all([
    publicClient.getBalance({ address: relayerAddress }),
    judgeV2RunCost(publicClient),
  ]);
  const lowFunds = balance < required;
  return {
    ...base,
    deployed: true,
    chainId,
    relayerAddress,
    relayerBalance: `${formatEther(balance)} MON`,
    requiredBalance: `${formatEther(required)} MON`,
    lowFunds,
    message: lowFunds ? 'Relayer low on funds' : 'Ready for Judge Mode execution',
  };
}

async function status(publicClient: PublicClient, relayerKey?: Hex): Promise<Status> {
  if (!USE_V1) return checkV2Status(publicClient, relayerKey);
  const s = await checkJudgeStatus(publicClient, DEFAULT_MANDATE_MANAGER_ADDRESS, DEFAULT_MOCK_TARGET_ADDRESS, relayerKey);
  return { ...s, version: 'v1' };
}

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { allowed, retryAfterSeconds } = checkRateLimit(ip);
    const publicClient = createPublicClient({ transport: http(RPC_URL) }) as PublicClient;
    const s = await status(publicClient, getRelayerKey());

    return NextResponse.json({
      ...s,
      isRateLimited: !allowed,
      retryAfterSeconds,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        deployed: false,
        chainId: 0,
        lowFunds: true,
        message: err.message || 'Error checking Judge Mode status',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { allowed, retryAfterSeconds } = checkRateLimit(ip);

    if (!allowed) {
      return NextResponse.json(
        {
          error: `Rate limit active: please wait ${retryAfterSeconds} seconds before running Judge Mode again.`,
          retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const relayerKey = getRelayerKey();
    if (!relayerKey) {
      return NextResponse.json(
        {
          error: 'Server relayer key is not configured. Live testnet execution requires RELAYER_PRIVATE_KEY.',
          lowFunds: true,
        },
        { status: 503 }
      );
    }

    const publicClient = createPublicClient({ transport: http(RPC_URL) }) as PublicClient;

    // Enforce bytecode, chain ID and funding honesty checks
    const s = await status(publicClient, relayerKey);

    if (!s.deployed) {
      return NextResponse.json(
        {
          error: s.message || 'Not deployed on Monad testnet',
          deployed: false,
        },
        { status: 503 }
      );
    }

    if (s.lowFunds) {
      return NextResponse.json(
        {
          error: `Relayer low on funds: it has ${s.relayerBalance} and one run needs about ${s.requiredBalance}. Send testnet MON to ${s.relayerAddress}.`,
          lowFunds: true,
          relayerAddress: s.relayerAddress,
        },
        { status: 503 }
      );
    }

    // Fixed scenario only: no client-specified calldata, target, or value
    const account = privateKeyToAccount(relayerKey);
    const walletClient = createWalletClient({
      account,
      transport: http(RPC_URL),
    });

    // Record rate limit before execution to prevent concurrent replay
    recordExecution(ip);

    if (USE_V1) {
      const steps = await runJudgeModeSequence(
        publicClient,
        walletClient,
        DEFAULT_MANDATE_MANAGER_ADDRESS,
        DEFAULT_MOCK_TARGET_ADDRESS
      );
      return NextResponse.json({
        success: true,
        version: 'v1',
        message: 'Judge Mode sequence executed live on Monad Testnet',
        chainId: 10143,
        relayerAddress: account.address,
        steps,
      });
    }

    const run = await runJudgeModeV2(publicClient, walletClient, {
      mandates: AGENT_MANDATES_ADDRESS,
      target: V2_TARGET,
      agentId: process.env.JUDGE_AGENT_ID,
    });
    return NextResponse.json({
      success: true,
      version: 'v2',
      message: 'Judge Mode sequence executed live on Monad Testnet',
      chainId: 10143,
      relayerAddress: account.address,
      agentMandates: AGENT_MANDATES_ADDRESS,
      agentId: run.agentId,
      mandateId: run.mandateId,
      setupTx: run.setupTx,
      steps: run.steps,
    });
  } catch (err: any) {
    console.error('[judge-mode]', err?.shortMessage || err?.message || err);
    return NextResponse.json(
      {
        error: explainRelayerError(err, relayerAddressOrUndefined()),
      },
      { status: 500 }
    );
  }
}
