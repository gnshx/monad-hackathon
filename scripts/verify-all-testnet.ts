/**
 * AgentTrust On-Chain Security Matrix Auditor
 *
 * Strict mode:
 *  1. Fails immediately if the RPC chain ID is not 10143 (Monad Testnet).
 *  2. Every scenario carries an explicit expectedStatus: 'success' | 'reverted'.
 *  3. For scenarios that should succeed and emit a named event, the topic-0 of
 *     that event is verified against the logs of the receipt.
 *  4. Any mismatch between actual and expected causes the process to exit 1.
 *  5. A missing tx hash in deployments.json is a hard failure, not a skip.
 */

import { createPublicClient, http, keccak256, toBytes, type Address, type Hex } from 'viem';
import fs from 'fs';
import path from 'path';

// ─── Constants ────────────────────────────────────────────────────────────────
const EXPECTED_CHAIN_ID = 10143; // Monad Testnet
const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';

// Keccak-256 topic-0 of each event we validate.
// Computed from the canonical Solidity signature so there is no hardcoded magic.
function eventTopic(sig: string): Hex {
  return keccak256(toBytes(sig)) as Hex;
}

const TOPICS = {
  MandateCreated:  eventTopic('MandateCreated(uint256,address,address,uint256,uint256)'),
  ActionExecuted:  eventTopic('ActionExecuted(uint256,address,bytes4,uint256,bytes)'),
  MandateRevoked:  eventTopic('MandateRevoked(uint256,address)'),
  FundsWithdrawn:  eventTopic('FundsWithdrawn(uint256,address,uint256)'),
  CredentialRegistered: eventTopic('CredentialRegistered(address,bytes32,bytes32)'),
};

// ─── Scenario definition ──────────────────────────────────────────────────────
interface Scenario {
  name: string;
  /** Key inside deployments.json → transactions */
  txKey: string;
  /** What the chain must show for this tx. */
  expectedStatus: 'success' | 'reverted';
  /**
   * If set, at least one log in the receipt must carry this topic-0 from
   * the stated emitter contract key ('mandateManager' | 'mockTarget').
   * Only checked when expectedStatus === 'success'.
   */
  expectedEvent?: {
    topic0: Hex;
    /** Key inside deployments.json → contracts */
    emitterKey: string;
    humanLabel: string;
  };
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Credential Registration',
    txKey: 'credentialRegistration',
    expectedStatus: 'success',
    expectedEvent: {
      topic0: TOPICS.CredentialRegistered,
      emitterKey: 'mandateManager',
      humanLabel: 'CredentialRegistered',
    },
  },
  {
    name: 'Mandate Creation',
    txKey: 'mandateCreation',
    expectedStatus: 'success',
    expectedEvent: {
      topic0: TOPICS.MandateCreated,
      emitterKey: 'mandateManager',
      humanLabel: 'MandateCreated',
    },
  },
  {
    name: 'Scenario 1 – Allowed Action (0.02 MON spend)',
    txKey: 'allowedExecution',
    expectedStatus: 'success',
    expectedEvent: {
      topic0: TOPICS.ActionExecuted,
      emitterKey: 'mandateManager',
      humanLabel: 'ActionExecuted',
    },
  },
  {
    name: 'Scenario 2 – Rogue Target Attempt (TargetNotAllowed)',
    txKey: 'rogueTargetRevert',
    expectedStatus: 'reverted',
  },
  {
    name: 'Scenario 3 – Over-Limit Spend (ExceedsPerTxLimit)',
    txKey: 'overLimitRevert',
    expectedStatus: 'reverted',
  },
  {
    name: 'Scenario 4 – Stranger Caller Hijack (CallerNotAuthorized)',
    txKey: 'strangerHijackRevert',
    expectedStatus: 'reverted',
  },
  {
    name: 'Scenario 5 – Owner Mandate Revocation',
    txKey: 'mandateRevocation',
    expectedStatus: 'success',
    expectedEvent: {
      topic0: TOPICS.MandateRevoked,
      emitterKey: 'mandateManager',
      humanLabel: 'MandateRevoked',
    },
  },
  {
    name: 'Recovery – Vault Balance Reclaim',
    txKey: 'vaultWithdrawal',
    expectedStatus: 'success',
    expectedEvent: {
      topic0: TOPICS.FundsWithdrawn,
      emitterKey: 'mandateManager',
      humanLabel: 'FundsWithdrawn',
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pass(msg: string) { console.log(`    ✅ PASS  ${msg}`); }
function fail(msg: string) { console.log(`    ❌ FAIL  ${msg}`); }

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('================================================================');
  console.log('   🔍 AGENTTRUST STRICT ON-CHAIN SECURITY MATRIX AUDITOR');
  console.log('================================================================\n');

  // 1. Load deployments
  const depPath = path.resolve(__dirname, '../deployments.json');
  if (!fs.existsSync(depPath)) {
    console.error('❌ deployments.json not found. Run npm run deploy:testnet first.');
    process.exit(1);
  }
  const deployment = JSON.parse(fs.readFileSync(depPath, 'utf8'));
  const contracts: Record<string, Address> = deployment.contracts;
  const transactions: Record<string, Hex>  = deployment.transactions;

  // 2. Connect and assert chain ID
  const client = createPublicClient({ transport: http(RPC_URL) });
  const chainId = await client.getChainId();

  console.log(`🌐 RPC:               ${RPC_URL}`);
  console.log(`⛓️  Chain ID:          ${chainId}`);
  console.log(`📍 MandateManager:    ${contracts.mandateManager}`);
  console.log(`📍 MockTarget:        ${contracts.mockTarget}\n`);

  if (chainId !== EXPECTED_CHAIN_ID) {
    console.error(`\n❌ CHAIN ID MISMATCH: expected ${EXPECTED_CHAIN_ID} (Monad Testnet), got ${chainId}.`);
    console.error('   Point MONAD_RPC_URL at the Monad Testnet endpoint and retry.\n');
    process.exit(1);
  }
  console.log(`✅ Chain ID confirmed: ${chainId} = Monad Testnet\n`);

  // 3. Verify bytecode is non-empty for both deployed contracts
  console.log('── Bytecode presence check ─────────────────────────────────────');
  for (const [label, addr] of [['MandateManager', contracts.mandateManager], ['MockTarget', contracts.mockTarget]] as [string, Address][]) {
    const code = await client.getBytecode({ address: addr });
    if (!code || code === '0x') {
      console.error(`❌ No bytecode at ${label} (${addr}). Deployment may have failed.`);
      process.exit(1);
    }
    console.log(`✅ ${label} has bytecode at ${addr} (${Math.floor((code.length - 2) / 2)} bytes)`);
  }
  console.log();

  // 4. Audit each scenario
  console.log('── Transaction assertions ──────────────────────────────────────');
  let assertionsPassed = 0;
  let assertionsFailed = 0;

  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    console.log(`\n[${i + 1}/${SCENARIOS.length}] ${s.name}`);

    // 4a. Hash must exist
    const hash = transactions[s.txKey];
    if (!hash) {
      fail(`No tx hash for key "${s.txKey}" in deployments.json`);
      assertionsFailed++;
      continue;
    }
    console.log(`    Tx:       ${hash}`);
    console.log(`    Expected: ${s.expectedStatus.toUpperCase()}`);

    // 4b. Fetch receipt
    let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>>;
    try {
      receipt = await client.getTransactionReceipt({ hash });
    } catch (err: any) {
      fail(`Receipt fetch failed: ${err.message || String(err)}`);
      assertionsFailed++;
      continue;
    }

    // 4c. Status assertion
    const actualStatus = receipt.status; // 'success' | 'reverted'
    if (actualStatus !== s.expectedStatus) {
      fail(`Status mismatch – got ${actualStatus.toUpperCase()}, expected ${s.expectedStatus.toUpperCase()}`);
      assertionsFailed++;
    } else {
      pass(`Status = ${actualStatus.toUpperCase()} as expected`);
      assertionsPassed++;
    }

    // 4d. Event assertion (only for success scenarios with an expected event)
    if (s.expectedEvent && s.expectedStatus === 'success') {
      const { topic0, emitterKey, humanLabel } = s.expectedEvent;
      const emitterAddr = contracts[emitterKey]?.toLowerCase();
      const found = receipt.logs.some(
        (log) =>
          log.topics[0]?.toLowerCase() === topic0.toLowerCase() &&
          log.address.toLowerCase() === emitterAddr,
      );
      if (!found) {
        fail(`Event "${humanLabel}" NOT found in logs from ${contracts[emitterKey]}`);
        assertionsFailed++;
      } else {
        pass(`Event "${humanLabel}" emitted by ${contracts[emitterKey]}`);
        assertionsPassed++;
      }
    }

    console.log(`    Explorer: https://testnet.monadexplorer.com/tx/${hash}`);
  }

  // 5. Final report
  const total = assertionsPassed + assertionsFailed;
  console.log('\n================================================================');
  if (assertionsFailed === 0) {
    console.log(`🎉 ALL ASSERTIONS PASSED: ${assertionsPassed}/${total}`);
    console.log('   AgentTrust on-chain security matrix is fully verified.');
  } else {
    console.log(`🚨 AUDIT FAILED: ${assertionsFailed} assertion(s) failed out of ${total}`);
  }
  console.log('================================================================\n');

  if (assertionsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal audit error:', err);
  process.exit(1);
});
