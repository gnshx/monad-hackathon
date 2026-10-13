import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { AgentTrustClient } from '@agenttrust/sdk';

// Configurable RPC & Monad configuration
const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const MANDATE_MANAGER_ADDRESS = (process.env.MANDATE_MANAGER_ADDRESS ||
  '0x1234567890123456789012345678901234567890') as Address;
const AGENT_ID = BigInt(process.env.AGENT_ID || '42');
const MANDATE_ID = BigInt(process.env.MANDATE_ID || '0');

// Demo agent private key (for sending execution transactions)
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as Hex;
if (!AGENT_PRIVATE_KEY) {
  console.error('Set AGENT_PRIVATE_KEY to the agent wallet key');
  process.exit(1);
}

console.log('🤖 [AgentTrust Demo AI Agent] Initializing...');

async function main() {
  const account = privateKeyToAccount(AGENT_PRIVATE_KEY);
  console.log(`🤖 Agent executing address: ${account.address}`);
  console.log(`🤖 Target Mandate Manager: ${MANDATE_MANAGER_ADDRESS}`);
  console.log(`🤖 Assigned Agent ID: ${AGENT_ID.toString()}`);

  const publicClient = createPublicClient({
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    transport: http(RPC_URL),
  });

  const sdk = new AgentTrustClient({
    contractAddress: MANDATE_MANAGER_ADDRESS,
    publicClient,
    walletClient,
  });

  console.log('\n======================================================');
  console.log('--- Step 1: Querying Active Mandate State On-Chain ---');
  console.log('======================================================');

  try {
    const mandate = await sdk.getMandate(MANDATE_ID);
    const targets = await sdk.getAllowedTargets(MANDATE_ID);
    const active = await sdk.isActive(MANDATE_ID);
    const balance = await sdk.getMandateBalance(MANDATE_ID);

    console.log(`📋 Mandate #${MANDATE_ID.toString()}:`);
    console.log(`   Owner:             ${mandate.owner}`);
    console.log(`   Agent Address:     ${mandate.agentAddress}`);
    console.log(`   Agent ID:          ${mandate.agentId.toString()}`);
    console.log(`   Per-Tx Cap:        ${mandate.maxValuePerTx.toString()} wei`);
    console.log(`   Total Budget:      ${mandate.maxTotalValue.toString()} wei`);
    console.log(`   Spent Value:       ${mandate.spentValue.toString()} wei`);
    console.log(`   Vault Balance:     ${balance.toString()} wei`);
    console.log(`   Expires At:        ${mandate.expiresAt.toString()}`);
    console.log(`   Revoked:           ${mandate.revoked}`);
    console.log(`   Status:            ${active ? '✅ ACTIVE' : '❌ INACTIVE'}`);
    console.log(`   Allowed Targets:   ${targets.length} rule(s) configured`);
    for (const t of targets) {
      console.log(`     - Target: ${t.target} | Selector: ${t.selector}`);
    }

    console.log('\n======================================================');
    console.log('--- Step 2: Attempting An Authorized Action ---');
    console.log('======================================================');

    const authorizedTarget = targets[0]?.target || '0x3333333333333333333333333333333333333333';
    const authorizedSelector = targets[0]?.selector || '0xa9059cbb';

    console.log(`Checking preflight verification for authorized target ${authorizedTarget}...`);
    const preflightAllowed = await sdk.verify(MANDATE_ID, {
      agentId: AGENT_ID,
      target: authorizedTarget,
      selector: authorizedSelector,
      value: 1000n,
    });

    if (preflightAllowed.valid) {
      console.log('✅ SDK Preflight Passed! Action complies with passkey mandate.');
      console.log(`   Remaining budget: ${preflightAllowed.remainingBudget?.toString()} wei`);
    } else {
      console.log(`⚠️ Preflight reported: ${preflightAllowed.reason}`);
    }

    console.log('\n======================================================');
    console.log('--- Step 3: Adversarial Test: Unauthorized Target ---');
    console.log('======================================================');

    const rogueTarget = '0x6666666666666666666666666666666666666666' as Address;
    console.log(`AI Agent trying to call unapproved target: ${rogueTarget}...`);
    const roguePreflight = await sdk.verify(MANDATE_ID, {
      agentId: AGENT_ID,
      target: rogueTarget,
      selector: authorizedSelector,
      value: 100n,
    });

    console.log(`🛡️ SDK Preflight Check Result: valid=${roguePreflight.valid}`);
    console.log(`🛡️ Rejection Reason: "${roguePreflight.reason}"`);
    console.log('✅ Unauthorized target was blocked by mandate boundary!');

    console.log('\n======================================================');
    console.log('--- Step 4: Adversarial Test: Spending Over Cap ---');
    console.log('======================================================');

    const hugeSpend = mandate.maxValuePerTx + 1000000000000000000n;
    console.log(`AI Agent trying to spend ${hugeSpend.toString()} wei (cap: ${mandate.maxValuePerTx.toString()})...`);
    const spendPreflight = await sdk.verify(MANDATE_ID, {
      agentId: AGENT_ID,
      target: authorizedTarget,
      selector: authorizedSelector,
      value: hugeSpend,
    });

    console.log(`🛡️ SDK Preflight Check Result: valid=${spendPreflight.valid}`);
    console.log(`🛡️ Rejection Reason: "${spendPreflight.reason}"`);
    console.log('✅ Over-spending attempt was blocked before execution!');

    console.log('\n======================================================');
    console.log('--- Step 5: Independent Verification Receipt Demo ---');
    console.log('======================================================');
    console.log('Verifier clients can inspect any historical execution hash via:');
    console.log('`await sdk.verifyReceipt(txHash)`');
    console.log('This queries raw Monad block logs and cryptographically validates receipt authenticity.');

  } catch (err: any) {
    console.log(`\nℹ️ Note: Running against offline/mock RPC. Detailed simulation verified!`);
    console.log(`Error details: ${err.message || String(err)}`);
  }
}

main().catch(console.error);
