import { NextRequest, NextResponse } from 'next/server';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  checkJudgeStatus,
  runJudgeModeSequence,
} from '@/lib/judge-mode-runner';
import { checkRateLimit, recordExecution } from '@/lib/rate-limit';
import {
  DEFAULT_MANDATE_MANAGER_ADDRESS,
  DEFAULT_MOCK_TARGET_ADDRESS,
} from '@/lib/contracts';

const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';

function getRelayerKey(): Hex | undefined {
  return (
    (process.env.RELAYER_PRIVATE_KEY as Hex) ||
    (process.env.DEPLOYER_PRIVATE_KEY as Hex) ||
    (process.env.PRIVATE_KEY as Hex)
  );
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

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { allowed, retryAfterSeconds } = checkRateLimit(ip);
    const relayerKey = getRelayerKey();

    const publicClient = createPublicClient({ transport: http(RPC_URL) });
    const status = await checkJudgeStatus(
      publicClient,
      DEFAULT_MANDATE_MANAGER_ADDRESS,
      DEFAULT_MOCK_TARGET_ADDRESS,
      relayerKey
    );

    return NextResponse.json({
      ...status,
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

    const publicClient = createPublicClient({ transport: http(RPC_URL) });

    // Enforce bytecode and chain ID honesty checks
    const status = await checkJudgeStatus(
      publicClient,
      DEFAULT_MANDATE_MANAGER_ADDRESS,
      DEFAULT_MOCK_TARGET_ADDRESS,
      relayerKey
    );

    if (!status.deployed) {
      return NextResponse.json(
        {
          error: status.message || 'Not deployed on Monad testnet',
          deployed: false,
        },
        { status: 503 }
      );
    }

    if (status.lowFunds) {
      return NextResponse.json(
        {
          error: 'Server relayer low on funds. Please fund the relayer account with MON before testing.',
          lowFunds: true,
          relayerAddress: status.relayerAddress,
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

    const steps = await runJudgeModeSequence(
      publicClient,
      walletClient,
      DEFAULT_MANDATE_MANAGER_ADDRESS,
      DEFAULT_MOCK_TARGET_ADDRESS
    );

    return NextResponse.json({
      success: true,
      message: 'Judge Mode sequence executed live on Monad Testnet',
      chainId: 10143,
      relayerAddress: account.address,
      steps,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err.message || 'Failed to execute Judge Mode sequence',
        details: String(err),
      },
      { status: 500 }
    );
  }
}
