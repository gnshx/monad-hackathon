import { createPublicClient, http } from 'viem';
import { verifyAgentIdentity, MONAD_TESTNET_ERC8004_REGISTRY } from '@agenttrust/sdk';

const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';

async function main() {
  console.log('================================================================');
  console.log('   🤖 ERC-8004 AGENT IDENTITY REGISTRY CHECK ON MONAD TESTNET');
  console.log('================================================================\n');

  const client = createPublicClient({
    transport: http(RPC_URL),
  });

  const chainId = await client.getChainId();
  console.log(`🌐 Connected to RPC: ${RPC_URL}`);
  console.log(`⛓️  Chain ID: ${chainId} (Expected: 10143)`);
  console.log(`📍 Registry Address: ${MONAD_TESTNET_ERC8004_REGISTRY}\n`);

  // Test 1: Verify Agent #1 on Monad Testnet
  const agentId = 1n;
  const expectedAgentAddress = '0x133603465aDdE7C39fa0E6E34b264E1573e1FD08';

  console.log(`--- TEST 1: VERIFYING REGISTERED AGENT #${agentId} ---`);
  console.log(`Expected Designated Wallet: ${expectedAgentAddress}`);

  const res1 = await verifyAgentIdentity(
    client,
    agentId,
    expectedAgentAddress,
    MONAD_TESTNET_ERC8004_REGISTRY
  );

  console.log(`Verification Result:`, res1);
  if (res1.verified) {
    console.log(`✅ PASS: Agent #${agentId} successfully bound to designated wallet on-chain!\n`);
  } else {
    console.error(`❌ FAIL: Agent #${agentId} identity check failed: ${res1.error}\n`);
    process.exit(1);
  }

  // Test 2: Mismatch Detection (Fail-Closed)
  console.log(`--- TEST 2: MISMATCH DETECTION (IMPOSTOR ADDRESS) ---`);
  const impostorAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const res2 = await verifyAgentIdentity(
    client,
    agentId,
    impostorAddress,
    MONAD_TESTNET_ERC8004_REGISTRY
  );

  console.log(`Mismatch Result:`, res2);
  if (!res2.verified) {
    console.log(`✅ PASS: Correctly blocked unbound agent address!\n`);
  } else {
    console.error(`❌ FAIL: Impostor address should not have verified!\n`);
    process.exit(1);
  }

  console.log('================================================================');
  console.log('🎉 ERC-8004 IDENTITY REGISTRY COMPOSABILITY VERIFIED ON MONAD');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Fatal error during ERC-8004 verification:', err);
  process.exit(1);
});
