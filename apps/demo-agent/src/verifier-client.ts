import { createPublicClient, http, type Address, type Hex } from 'viem';
import { AgentTrustClient } from '@agenttrust/sdk';

// Third-party verifier: anyone with an RPC connection can audit agent executions
const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const MANDATE_MANAGER_ADDRESS = (process.env.MANDATE_MANAGER_ADDRESS ||
  '0x1234567890123456789012345678901234567890') as Address;

console.log('🔍 [AgentTrust Independent Verifier Client]');
console.log('Third-party protocol auditing mandate compliance and execution receipts.');

async function auditTransaction(txHash: Hex) {
  const publicClient = createPublicClient({
    transport: http(RPC_URL),
  });

  const sdk = new AgentTrustClient({
    contractAddress: MANDATE_MANAGER_ADDRESS,
    publicClient,
  });

  console.log(`\nAuditing transaction hash: ${txHash}`);
  try {
    const result = await sdk.verifyReceipt(txHash);

    if (result.verified && result.status === 'success') {
      console.log('✅ VERIFICATION RESULT: AUTHENTIC ON-CHAIN EXECUTION');
      console.log(`   Mandate ID:      #${result.mandateId?.toString()}`);
      console.log(`   Target Contract: ${result.target}`);
      console.log(`   Selector:        ${result.selector}`);
      console.log(`   Value Forwarded: ${result.value?.toString()} wei`);
      console.log(`   Block Number:    ${result.blockNumber.toString()}`);
    } else {
      console.log('❌ VERIFICATION RESULT: UNVERIFIED OR REVERTED');
      console.log(`   Status:          ${result.status}`);
      console.log(`   Reason:          ${result.revertReason}`);
    }
  } catch (err: any) {
    console.log(`Verification query error: ${err.message || String(err)}`);
  }
}

const sampleTx = (process.argv[2] ||
  '0x0000000000000000000000000000000000000000000000000000000000000000') as Hex;
auditTransaction(sampleTx).catch(console.error);
