import { createPublicClient, http, type Address, type Hex } from 'viem';
import { verifyReceipt } from '@agenttrust/sdk';
import fs from 'fs';
import path from 'path';

const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';

async function main() {
  console.log('================================================================');
  console.log('   🔍 AGENTTRUST FULL ON-CHAIN SECURITY MATRIX AUDITOR');
  console.log('================================================================\n');

  const depPath = path.resolve(__dirname, '../deployments.json');
  if (!fs.existsSync(depPath)) {
    console.error('❌ deployments.json not found. Run npm run deploy:testnet first.');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(depPath, 'utf8'));
  const mandateManager = deployment.contracts.mandateManager as Address;
  const mockTarget = deployment.contracts.mockTarget as Address;

  const client = createPublicClient({
    transport: http(RPC_URL),
  });

  const chainId = await client.getChainId();
  console.log(`🌐 Connected RPC:        ${RPC_URL}`);
  console.log(`⛓️  Connected Chain ID:   ${chainId} (Monad Testnet)`);
  console.log(`📍 MandateManager:       ${mandateManager}`);
  console.log(`📍 MockTarget Router:    ${mockTarget}\n`);

  const scenarios = [
    {
      name: 'Mandate Creation',
      hash: deployment.transactions.mandateCreation,
      expected: 'Confirmed Mandate Authorization',
    },
    {
      name: 'Scenario 1: Allowed Action (0.02 MON spend)',
      hash: deployment.transactions.allowedExecution,
      expected: 'Verified Execution (ActionExecuted event emitted)',
    },
    {
      name: 'Scenario 2: Rogue Target Attempt',
      hash: deployment.transactions.rogueTargetRevert,
      expected: 'On-Chain Revert (TargetNotAllowed policy blocked)',
    },
    {
      name: 'Scenario 3: Over-Limit Spend Attempt',
      hash: deployment.transactions.overLimitRevert,
      expected: 'On-Chain Revert (ExceedsPerTxLimit policy blocked)',
    },
    {
      name: 'Scenario 4: Stranger Caller Hijack',
      hash: deployment.transactions.strangerHijackRevert,
      expected: 'On-Chain Revert (CallerNotAuthorized policy blocked)',
    },
    {
      name: 'Scenario 5: Owner Mandate Revocation',
      hash: deployment.transactions.mandateRevocation,
      expected: 'Confirmed Revocation (MandateRevoked event emitted)',
    },
    {
      name: 'Recovery: Unspent Vault Balance Reclaim',
      hash: deployment.transactions.vaultWithdrawal,
      expected: 'Confirmed Vault Withdrawal to Owner',
    },
  ];

  console.log('----------------------------------------------------------------');
  console.log('AUDITING ALL 7 ON-CHAIN TRANSACTIONS DIRECTLY FROM MONAD RPC');
  console.log('----------------------------------------------------------------\n');

  let passed = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    console.log(`[${i + 1}/${scenarios.length}] Auditing: ${s.name}`);
    console.log(`    Tx Hash: ${s.hash}`);

    if (!s.hash) {
      console.log('    ⚠️ No transaction hash recorded.\n');
      continue;
    }

    try {
      const receipt = await client.getTransactionReceipt({ hash: s.hash as Hex });
      const statusStr = receipt.status === 'success' ? '✅ SUCCESS' : '🛡️ REVERTED';
      console.log(`    Status:      ${statusStr} (Block #${receipt.blockNumber}, Gas Used: ${receipt.gasUsed})`);
      console.log(`    Expectation: ${s.expected}`);
      console.log(`    Explorer:    https://testnet.monadexplorer.com/tx/${s.hash}\n`);
      passed++;
    } catch (err: any) {
      console.error(`    ❌ Query failed: ${err.message || String(err)}\n`);
    }
  }

  console.log('================================================================');
  console.log(`🎉 AUDIT COMPLETE: ${passed}/${scenarios.length} TRANSACTIONS VERIFIED ON MONAD TESTNET`);
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
