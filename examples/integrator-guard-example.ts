/**
 * 🛡️ AgentTrust — 15-Minute Drop-in Integrator Example
 * 
 * Demonstrates how any external hackathon team building an autonomous AI agent
 * (LangChain, Eliza, CrewAI, AutoGPT, or custom script) can guard their tool calls
 * with hardware-anchored spending limits and target allowlists on Monad.
 */

import { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createAgentGuard } from '@agenttrust/sdk';

// 1. Setup Monad Testnet clients
const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const publicClient = createPublicClient({ transport: http(RPC_URL) });

// Autonomous agent hot wallet (can be ephemeral or stored in agent keystore)
const agentAccount = privateKeyToAccount(
  (process.env.AGENT_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d') as Hex
);
const walletClient = createWalletClient({ account: agentAccount, transport: http(RPC_URL) });

// 2. Initialize AgentTrust Guard with human owner's authorized mandate
const guard = createAgentGuard({
  contractAddress: '0xa5754E89745eC4eB9d7F31f0C34eB267773531b7' as Address, // MandateManager on Monad
  mandateId: 0n, // Mandate authorized by human via TouchID / FaceID
  agentId: 1n,   // ERC-8004 registered agent identity
  publicClient,
  walletClient,
});

// Target protocol ABI (e.g. DEX Router, Vault, or Payment Receiver)
const DEX_ABI = [
  {
    type: 'function',
    name: 'swapExactETHForTokens',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'payable',
  },
] as const;

/**
 * 🤖 YOUR AGENT TOOL CALL:
 * Instead of agent calling router directly with raw private key,
 * route it through `guard.execute()`.
 */
async function executeGuardedSwap(tokenOut: Address, amountInMON: string) {
  console.log(`🤖 Agent requesting DEX swap of ${amountInMON} MON...`);

  const routerAddress = '0x1234567890123456789012345678901234567890' as Address;
  const selector = '0x7ff36ab5' as Hex; // swapExactETHForTokens selector

  const callData = encodeFunctionData({
    abi: DEX_ABI,
    functionName: 'swapExactETHForTokens',
    args: [
      0n, // min out
      ['0x0000000000000000000000000000000000000000' as Address, tokenOut],
      agentAccount.address,
      BigInt(Math.floor(Date.now() / 1000) + 1200),
    ],
  });

  try {
    // 🛡️ All constraints enforced on-chain by Monad MandateManager
    const result = await guard.execute({
      target: routerAddress,
      selector,
      callData,
      value: parseEther(amountInMON),
    });

    console.log(`✅ Guard passed! Tx broadcasted: ${result.transactionHash}`);
    console.log(`🧾 Cryptographic Receipt Verified: ${result.receipt.verified}`);
    console.log(`🔗 Monad Explorer: https://testnet.monadexplorer.com/tx/${result.transactionHash}`);
    return result;
  } catch (error: any) {
    // If prompt-injected or exceeding cap, it is stopped fail-closed BEFORE draining funds
    console.error(`🛑 BLOCKED BY AGENTTRUST GUARD: ${error.message}`);
    throw error;
  }
}

export { guard, executeGuardedSwap };
