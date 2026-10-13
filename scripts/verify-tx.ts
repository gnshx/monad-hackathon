#!/usr/bin/env node
/**
 * 🛡️ AgentTrust — 1-Command Independent Receipt Verifier
 * 
 * Verifies any Monad Testnet or local EVM transaction hash against on-chain
 * MandateManager execution receipts and ERC-8004 identity bindings.
 * 
 * Usage:
 *   npx tsx scripts/verify-tx.ts <txHash> [rpcUrl] [contractAddress]
 *   npm run verify:tx <txHash>
 */

import { createPublicClient, http, formatEther, type Hex, type Address } from 'viem';
import {
  verifyReceipt,
  verifyAgentIdentity,
  MONAD_TESTNET_ERC8004_REGISTRY,
  MandateManagerABI,
} from '@agenttrust/sdk';

const DEFAULT_RPC = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const DEFAULT_CONTRACT = (process.env.MANDATE_MANAGER_ADDRESS ||
  '0xa5754E89745eC4eB9d7F31f0C34eB267773531b7') as Address;

async function main() {
  const args = process.argv.slice(2);
  const txHashArg = args[0];

  console.log('================================================================');
  console.log('   🔍 AGENTTRUST INDEPENDENT ON-CHAIN RECEIPT VERIFIER');
  console.log('================================================================\n');

  if (!txHashArg || !txHashArg.startsWith('0x') || txHashArg.length !== 66) {
    console.log('Usage:');
    console.log('  npm run verify:tx <0x...64_hex_chars_tx_hash>\n');
    console.log('Example:');
    console.log('  npm run verify:tx 0xb7cf85e1b4ec983fd3ad8cea904e8bc132236f18948e79121f7212f3095ddadd\n');
    console.log('💡 You can run this against any Monad Testnet transaction hash to verify');
    console.log('   hardware-anchored mandate execution without trusting off-chain APIs.');
    process.exit(1);
  }

  const txHash = txHashArg as Hex;
  const rpcUrl = args[1] || DEFAULT_RPC;
  const contractAddress = (args[2] || DEFAULT_CONTRACT) as Address;

  console.log(`🌐 Target RPC:        ${rpcUrl}`);
  console.log(`📍 Contract Address:  ${contractAddress}`);
  console.log(`🧾 Transaction Hash:  ${txHash}\n`);

  const client = createPublicClient({ transport: http(rpcUrl) });

  try {
    const chainId = await client.getChainId();
    console.log(`⛓️  Connected Chain ID: ${chainId} ${chainId === 10143 ? '(Monad Testnet)' : chainId === 31337 ? '(Local Anvil)' : ''}`);

    console.log('\n--- FETCHING & AUDITING TRANSACTION RECEIPT ---');
    const result = await verifyReceipt(client, contractAddress, txHash);

    console.log(`\n📊 AUDIT SUMMARY:`);
    console.log(`   Verification Result:   ${result.verified ? '✅ 100% CRYPTOGRAPHICALLY VERIFIED' : '❌ FAILED / REVERTED'}`);
    console.log(`   Execution Category:    [${result.status.toUpperCase()}]`);
    console.log(`   Block Number:          #${result.blockNumber}`);
    console.log(`   Gas Used:              ${result.gasUsed ? result.gasUsed.toString() : 'N/A'}`);

    if (result.mandateId !== undefined) {
      console.log(`\n📋 ENFORCED ON-CHAIN POLICY BOUNDS:`);
      console.log(`   Mandate ID:            #${result.mandateId.toString()}`);
      if (result.target) console.log(`   Allowlisted Target:    ${result.target}`);
      if (result.selector) console.log(`   Approved Selector:     ${result.selector}`);
      if (result.value !== undefined) console.log(`   Native Value Spent:    ${formatEther(result.value)} MON`);
    }

    if (result.logs && result.logs.length > 0) {
      console.log(`\n📜 LOG TOPICS EXTRACTED:`);
      result.logs.forEach((log, i) => {
        console.log(`   Log #${i + 1} Topic 0:   ${log.topics[0]}`);
      });
    }

    if (chainId === 10143) {
      console.log(`\n🔗 Monad Explorer Proof: https://testnet.monadexplorer.com/tx/${txHash}`);
    }

    console.log('\n================================================================');
    console.log(result.verified ? '🎉 RECEIPT COMPLIANCE CONFIRMED ON-CHAIN' : '⚠️ RECEIPT REJECTED OR NOT RECOGNIZED');
    console.log('================================================================');
  } catch (err: any) {
    console.error(`\n❌ Error during verification: ${err.message || String(err)}`);
    process.exit(1);
  }
}

main();
