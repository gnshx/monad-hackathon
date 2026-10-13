import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  type Hex,
  type Address,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import fs from 'fs';
import path from 'path';
import {
  MONAD_TESTNET_ERC8004_REGISTRY,
  ERC8004_IDENTITY_REGISTRY_ABI,
} from '@agenttrust/sdk';

// Load .env file safely if present
const envFilePath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envFilePath)) {
  const envContent = fs.readFileSync(envFilePath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const DEPLOYER_PRIVATE_KEY = (process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY) as Hex | undefined;
const AGENT_PRIVATE_KEY = (process.env.AGENT_PRIVATE_KEY as Hex) || generatePrivateKey();

async function main() {
  console.log('================================================================');
  console.log('   🤖 REGISTER DEMO AGENT ON MONAD ERC-8004 IDENTITY REGISTRY');
  console.log('================================================================\n');

  const publicClient = createPublicClient({ transport: http(RPC_URL) });
  const agentAccount = privateKeyToAccount(AGENT_PRIVATE_KEY);
  const agentWallet = createWalletClient({ account: agentAccount, transport: http(RPC_URL) });

  console.log(`🌐 RPC URL: ${RPC_URL}`);
  console.log(`📍 Registry: ${MONAD_TESTNET_ERC8004_REGISTRY}`);
  console.log(`👤 Target Agent Wallet: ${agentAccount.address}\n`);

  let balance = await publicClient.getBalance({ address: agentAccount.address });
  console.log(`💰 Agent Current Balance: ${formatEther(balance)} MON`);

  // If agent needs funding and deployer is available, deployer funds agent with 0.05 MON
  if (balance < parseEther('0.01')) {
    if (DEPLOYER_PRIVATE_KEY) {
      console.log('⛽ Sponsoring agent registration gas from deployer account...');
      const deployerAccount = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
      const deployerWallet = createWalletClient({ account: deployerAccount, transport: http(RPC_URL) });
      const fundTx = await deployerWallet.sendTransaction({
        to: agentAccount.address,
        value: parseEther('0.05'),
      });
      console.log(`   Tx Submitted: ${fundTx}`);
      await publicClient.waitForTransactionReceipt({ hash: fundTx });
      balance = await publicClient.getBalance({ address: agentAccount.address });
      console.log(`   ✓ Funded agent. New balance: ${formatEther(balance)} MON\n`);
    } else {
      console.error('❌ Agent wallet has insufficient MON and DEPLOYER_PRIVATE_KEY is not set.');
      console.error(`   Please fund ${agentAccount.address} or export DEPLOYER_PRIVATE_KEY.`);
      process.exit(1);
    }
  }

  console.log('Broadcasting registration transaction to ERC-8004 Registry...');
  const txHash = await agentWallet.writeContract({
    address: MONAD_TESTNET_ERC8004_REGISTRY,
    abi: ERC8004_IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: ['https://agenttrust.org/agent-metadata.json'],
  });

  console.log(`Tx submitted: ${txHash}`);
  console.log('Waiting for Monad block confirmation...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`✓ Confirmed in block: ${receipt.blockNumber}`);
  console.log(`Explorer Link: https://testnet.monadexplorer.com/tx/${txHash}\n`);

  // In ERC-721, Transfer event is topic 0: Transfer(address,address,uint256)
  const transferLog = receipt.logs.find(
    (l) => l.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  );

  let mintedAgentId = 1n;
  if (transferLog && transferLog.topics[3]) {
    mintedAgentId = BigInt(transferLog.topics[3]);
    console.log(`🎉 Minted Agent ID: #${mintedAgentId.toString()}`);
  }

  // Verify on-chain status
  const verifiedWallet = await publicClient.readContract({
    address: MONAD_TESTNET_ERC8004_REGISTRY,
    abi: ERC8004_IDENTITY_REGISTRY_ABI,
    functionName: 'getAgentWallet',
    args: [mintedAgentId],
  });

  const verifiedOwner = await publicClient.readContract({
    address: MONAD_TESTNET_ERC8004_REGISTRY,
    abi: ERC8004_IDENTITY_REGISTRY_ABI,
    functionName: 'ownerOf',
    args: [mintedAgentId],
  });

  console.log(`✓ Verified Registry getAgentWallet: ${verifiedWallet}`);
  console.log(`✓ Verified Registry ownerOf:        ${verifiedOwner}`);

  const registrationRecord = {
    agentId: mintedAgentId.toString(),
    agentAddress: agentAccount.address,
    ownerAddress: verifiedOwner,
    txHash,
    blockNumber: receipt.blockNumber.toString(),
    registeredAt: new Date().toISOString(),
    explorerUrl: `https://testnet.monadexplorer.com/tx/${txHash}`,
  };

  fs.writeFileSync(
    path.resolve(__dirname, '../demo-agent.json'),
    JSON.stringify(registrationRecord, null, 2)
  );
  console.log('💾 Saved registration record to demo-agent.json');
}

main().catch((err) => {
  console.error('Error during registration:', err.message || err);
  process.exit(1);
});
