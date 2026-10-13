import { createPublicClient, createWalletClient, http, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { MONAD_TESTNET_ERC8004_REGISTRY, ERC8004_IDENTITY_REGISTRY_ABI } from '@agenttrust/sdk';

const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const AGENT_PRIVATE_KEY = (process.env.AGENT_PRIVATE_KEY ||
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d') as Hex;

async function main() {
  console.log('================================================================');
  console.log('   🤖 REGISTER DEMO AGENT ON MONAD ERC-8004 IDENTITY REGISTRY');
  console.log('================================================================\n');

  const publicClient = createPublicClient({ transport: http(RPC_URL) });
  const account = privateKeyToAccount(AGENT_PRIVATE_KEY);
  const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

  console.log(`🌐 RPC URL: ${RPC_URL}`);
  console.log(`📍 Registry: ${MONAD_TESTNET_ERC8004_REGISTRY}`);
  console.log(`👤 Agent Wallet Address: ${account.address}\n`);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`💰 Agent Wallet Balance: ${balance.toString()} wei`);

  if (balance === 0n) {
    console.error('⚠️ Agent wallet has 0 MON. Please fund this account or use deployer relayer to register.');
    process.exit(1);
  }

  console.log('Broadcasting registration to ERC-8004 Identity Registry...');
  const txHash = await walletClient.writeContract({
    address: MONAD_TESTNET_ERC8004_REGISTRY,
    abi: ERC8004_IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: ['https://agenttrust.org/agent-metadata.json'],
  });

  console.log(`Tx broadcasted: ${txHash}`);
  console.log('Waiting for receipt...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`✓ Confirmed in block: ${receipt.blockNumber}`);
  console.log(`Explorer Link: https://testnet.monadexplorer.com/tx/${txHash}`);

  // In ERC-721, Transfer event is topic 0: Transfer(address,address,uint256)
  const transferLog = receipt.logs.find(
    (l) => l.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  );
  if (transferLog && transferLog.topics[3]) {
    const mintedAgentId = BigInt(transferLog.topics[3]);
    console.log(`🎉 Minted Agent ID: #${mintedAgentId.toString()}`);
  }
}

main().catch((err) => {
  console.error('Error during registration:', err.message || err);
  process.exit(1);
});
