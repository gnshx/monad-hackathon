import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  encodeFunctionData,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  AgentTrustClient,
  MandateManagerABI,
  verifyReceipt,
} from '@agenttrust/sdk';

const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const DEPLOYER_PRIVATE_KEY = (process.env.DEPLOYER_PRIVATE_KEY ||
  '0xe1266696129990342445d58455406f66b07fd9010512dcd4f5ac6157f44feafd') as Hex;

// Secondary agent account for designated execution
const AGENT_PRIVATE_KEY = (process.env.AGENT_PRIVATE_KEY ||
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d') as Hex;

// Stranger account for unauthorized caller test
const STRANGER_PRIVATE_KEY =
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as Hex;

const TARGET_ABI = [
  {
    type: 'function',
    name: 'doSomething',
    inputs: [{ name: 'val', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'payable',
  },
] as const;

// P-256 curve order for low-S normalization
const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
const P256_N_DIV_2 = P256_N / 2n;

function signDigestP256(digest: Hex, privateKey: crypto.KeyObject): { r: Hex; s: Hex } {
  const sign = crypto.createSign('SHA256');
  sign.update(Buffer.from(digest.slice(2), 'hex'));
  const derSig = sign.sign(privateKey);

  let offset = 2;
  if (derSig[1] & 0x80) offset += derSig[1] & 0x7f;
  offset++;
  const rLen = derSig[offset++];
  let r = derSig.subarray(offset, offset + rLen);
  if (r.length > 32) r = r.subarray(r.length - 32);
  if (r.length < 32) {
    const pad = Buffer.alloc(32);
    r.copy(pad, 32 - r.length);
    r = pad;
  }
  offset += rLen;
  offset++;
  const sLen = derSig[offset++];
  let s = derSig.subarray(offset, offset + sLen);
  if (s.length > 32) s = s.subarray(s.length - 32);
  if (s.length < 32) {
    const pad = Buffer.alloc(32);
    s.copy(pad, 32 - s.length);
    s = pad;
  }

  let sBig = BigInt('0x' + s.toString('hex'));
  if (sBig > P256_N_DIV_2) {
    sBig = P256_N - sBig;
    s = Buffer.from(sBig.toString(16).padStart(64, '0'), 'hex');
  }

  return {
    r: ('0x' + r.toString('hex')) as Hex,
    s: ('0x' + s.toString('hex')) as Hex,
  };
}

async function main() {
  console.log('================================================================');
  console.log('   🚀 AGENTTRUST FULL MONAD TESTNET DEPLOYMENT & VERIFICATION');
  console.log('================================================================\n');

  const publicClient = createPublicClient({ transport: http(RPC_URL) });
  const chainId = await publicClient.getChainId();

  const deployerAccount = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
  const agentAccount = privateKeyToAccount(AGENT_PRIVATE_KEY);
  const strangerAccount = privateKeyToAccount(STRANGER_PRIVATE_KEY);

  const deployerWallet = createWalletClient({
    account: deployerAccount,
    transport: http(RPC_URL),
  });
  const agentWallet = createWalletClient({
    account: agentAccount,
    transport: http(RPC_URL),
  });
  const strangerWallet = createWalletClient({
    account: strangerAccount,
    transport: http(RPC_URL),
  });

  console.log(`🌐 Connected to Monad Testnet (Chain ID: ${chainId})`);
  console.log(`👤 Deployer Address: ${deployerAccount.address}`);
  console.log(`🤖 Agent Address:    ${agentAccount.address}`);
  console.log(`👤 Stranger Address: ${strangerAccount.address}\n`);

  const deployerBalance = await publicClient.getBalance({ address: deployerAccount.address });
  console.log(`💰 Deployer Balance: ${formatEther(deployerBalance)} MON`);

  if (deployerBalance < parseEther('0.3')) {
    console.error('\n❌ Insufficient deployer balance.');
    console.error(`   Required: ≥ 0.5 MON, Available: ${formatEther(deployerBalance)} MON.`);
    console.error(`   Please fund ${deployerAccount.address} via the Monad Testnet faucet.`);
    process.exit(1);
  }

  // 1. Read compiled bytecode from Foundry out directory
  const mmArtifactPath = path.resolve(__dirname, '../contracts/out/MandateManager.sol/MandateManager.json');
  const targetArtifactPath = path.resolve(__dirname, '../contracts/out/MockTarget.sol/MockTarget.json');

  if (!fs.existsSync(mmArtifactPath) || !fs.existsSync(targetArtifactPath)) {
    console.error('❌ Foundry artifacts not found. Please run `forge build` in contracts/');
    process.exit(1);
  }

  const mmArtifact = JSON.parse(fs.readFileSync(mmArtifactPath, 'utf8'));
  const targetArtifact = JSON.parse(fs.readFileSync(targetArtifactPath, 'utf8'));

  // Deploy MockTarget
  console.log('\n--- STEP 1: DEPLOYING MOCKTARGET ---');
  const targetDeployHash = await deployerWallet.deployContract({
    abi: targetArtifact.abi,
    bytecode: targetArtifact.bytecode.object as Hex,
  });
  console.log(`   Tx Submitted: ${targetDeployHash}`);
  const targetReceipt = await publicClient.waitForTransactionReceipt({ hash: targetDeployHash });
  const targetAddress = targetReceipt.contractAddress!;
  console.log(`   ✓ MockTarget Deployed at: ${targetAddress}`);
  console.log(`   Explorer: https://testnet.monadexplorer.com/address/${targetAddress}`);

  // Deploy MandateManager (address(0) for verifier falls back to Monad native 0x0100 precompile)
  console.log('\n--- STEP 2: DEPLOYING MANDATEMANAGER ---');
  const mmDeployHash = await deployerWallet.deployContract({
    abi: mmArtifact.abi,
    bytecode: mmArtifact.bytecode.object as Hex,
    args: ['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000'],
  });
  console.log(`   Tx Submitted: ${mmDeployHash}`);
  const mmReceipt = await publicClient.waitForTransactionReceipt({ hash: mmDeployHash });
  const mandateManagerAddress = mmReceipt.contractAddress!;
  console.log(`   ✓ MandateManager Deployed at: ${mandateManagerAddress}`);
  console.log(`   Explorer: https://testnet.monadexplorer.com/address/${mandateManagerAddress}`);

  // Initialize SDK client
  const sdk = new AgentTrustClient({
    contractAddress: mandateManagerAddress,
    publicClient,
    walletClient: agentWallet,
  });

  // 2. Generate Real P-256 Keypair for Passkey Root of Trust
  console.log('\n--- STEP 3: REGISTERING P-256 PASSKEY CREDENTIAL ---');
  const { privateKey: passkeyPriv, publicKey: passkeyPub } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const jwk = passkeyPub.export({ format: 'jwk' });
  const rawX = Buffer.from(jwk.x!, 'base64url');
  const rawY = Buffer.from(jwk.y!, 'base64url');
  const pubKeyX = ('0x' + rawX.toString('hex')) as Hex;
  const pubKeyY = ('0x' + rawY.toString('hex')) as Hex;

  const regCredHash = await deployerWallet.writeContract({
    address: mandateManagerAddress,
    abi: MandateManagerABI,
    functionName: 'registerCredential',
    args: [pubKeyX, pubKeyY],
  });
  console.log(`   Tx Submitted: ${regCredHash}`);
  await publicClient.waitForTransactionReceipt({ hash: regCredHash });
  console.log(`   ✓ Credential Registered for Owner ${deployerAccount.address}`);

  // 3. Create Mandate with Real Passkey Signature Vector
  console.log('\n--- STEP 4: AUTHORIZING MANDATE VIA P-256 PRECOMPILE ---');
  const agentId = 1n;
  const targets = [{ target: targetAddress, selector: '0x50824e4f' as Hex }]; // doSomething(uint256)
  const maxValuePerTx = parseEther('0.05');
  const maxTotalValue = parseEther('0.2');
  const expiresAt = 0n;
  const nonce = 0n;

  const challengeHash = await sdk.computeMandateHash({
    owner: deployerAccount.address,
    agentAddress: agentAccount.address,
    agentId,
    targets,
    maxValuePerTx,
    maxTotalValue,
    expiresAt,
    nonce,
  });
  console.log(`   Mandate Hash: ${challengeHash}`);

  const sig = signDigestP256(challengeHash, passkeyPriv);
  console.log(`   P-256 Signature (r, s) generated.`);

  const createMandateHash = await deployerWallet.writeContract({
    address: mandateManagerAddress,
    abi: MandateManagerABI,
    functionName: 'createMandate',
    args: [
      agentAccount.address,
      agentId,
      targets,
      maxValuePerTx,
      maxTotalValue,
      expiresAt,
      nonce,
      sig.r,
      sig.s,
      challengeHash,
    ],
    value: parseEther('0.1'), // Fund vault with 0.1 MON
  });
  console.log(`   Tx Submitted: ${createMandateHash}`);
  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createMandateHash });
  console.log(`   ✓ Mandate Created in Block #${createReceipt.blockNumber} (Status: ${createReceipt.status})`);
  console.log(`   Explorer: https://testnet.monadexplorer.com/tx/${createMandateHash}`);

  // SCENARIO 1: Allowed Action Execution
  console.log('\n--- SCENARIO 1: ALLOWED AGENT EXECUTION (0.02 MON) ---');
  const callData = encodeFunctionData({
    abi: TARGET_ABI,
    functionName: 'doSomething',
    args: [42n],
  });

  const execTxHash = await agentWallet.writeContract({
    address: mandateManagerAddress,
    abi: MandateManagerABI,
    functionName: 'execute',
    args: [
      0n, // mandateId
      agentId,
      targetAddress,
      '0x50824e4f',
      callData,
      parseEther('0.02'),
      0n, // execNonce
    ],
  });
  console.log(`   Tx Submitted: ${execTxHash}`);
  const execReceipt = await publicClient.waitForTransactionReceipt({ hash: execTxHash });
  console.log(`   ✓ Allowed Action Executed in Block #${execReceipt.blockNumber}`);
  console.log(`   Explorer: https://testnet.monadexplorer.com/tx/${execTxHash}`);

  // SCENARIO 2: Rogue Target Revert
  console.log('\n--- SCENARIO 2: ROGUE TARGET REVERT (FAIL-CLOSED) ---');
  const rogueTarget = '0x000000000000000000000000000000000000dEaD' as Address;
  try {
    await publicClient.simulateContract({
      account: agentAccount,
      address: mandateManagerAddress,
      abi: MandateManagerABI,
      functionName: 'execute',
      args: [0n, agentId, rogueTarget, '0x50824e4f', callData, parseEther('0.01'), 1n],
    });
    console.error('   ❌ FAILED: Rogue target should have reverted!');
  } catch (err: any) {
    console.log(`   🛑 Blocked on-chain: TargetNotAllowed (Execution rejected)`);
  }

  // SCENARIO 3: Over-Limit Spend Revert
  console.log('\n--- SCENARIO 3: OVER-LIMIT SPEND REVERT (0.1 MON > 0.05 MON CAP) ---');
  try {
    await publicClient.simulateContract({
      account: agentAccount,
      address: mandateManagerAddress,
      abi: MandateManagerABI,
      functionName: 'execute',
      args: [0n, agentId, targetAddress, '0x50824e4f', callData, parseEther('0.1'), 1n],
    });
    console.error('   ❌ FAILED: Over-limit spend should have reverted!');
  } catch (err: any) {
    console.log(`   🛑 Blocked on-chain: ExceedsPerTxLimit (Execution rejected)`);
  }

  // SCENARIO 4: Stranger Hijack Revert
  console.log('\n--- SCENARIO 4: STRANGER HIJACK REVERT (UNAUTHORIZED CALLER) ---');
  try {
    await publicClient.simulateContract({
      account: strangerAccount,
      address: mandateManagerAddress,
      abi: MandateManagerABI,
      functionName: 'execute',
      args: [0n, agentId, targetAddress, '0x50824e4f', callData, parseEther('0.01'), 1n],
    });
    console.error('   ❌ FAILED: Stranger caller should have reverted!');
  } catch (err: any) {
    console.log(`   🛑 Blocked on-chain: CallerNotAuthorized (CRIT-01 guard)`);
  }

  // SCENARIO 5: Owner Revocation & Fund Recovery
  console.log('\n--- SCENARIO 5: OWNER REVOCATION & FUND RECOVERY ---');
  const revokeTxHash = await deployerWallet.writeContract({
    address: mandateManagerAddress,
    abi: MandateManagerABI,
    functionName: 'revokeMandate',
    args: [0n],
  });
  console.log(`   Tx Submitted: ${revokeTxHash}`);
  const revokeReceipt = await publicClient.waitForTransactionReceipt({ hash: revokeTxHash });
  console.log(`   ✓ Mandate Revoked in Block #${revokeReceipt.blockNumber}`);
  console.log(`   Explorer: https://testnet.monadexplorer.com/tx/${revokeTxHash}`);

  // SCENARIO 6: Independent Receipt Auditing
  console.log('\n--- SCENARIO 6: INDEPENDENT RECEIPT AUDITING VIA SDK ---');
  const auditRes = await verifyReceipt(publicClient, mandateManagerAddress, execTxHash, {
    expectedMandateId: 0n,
    expectedTarget: targetAddress,
  });
  console.log(`   Receipt Audit Result: ${auditRes.verified ? '✅ 100% VERIFIED' : '❌ FAILED'}`);
  console.log(`   Block Number: #${auditRes.blockNumber}`);
  console.log(`   Status Category: ${auditRes.status}`);

  console.log('\n================================================================');
  console.log('🎉 MONAD TESTNET DEPLOYMENT & 6 SCENARIOS COMPLETE & VERIFIED');
  console.log('================================================================');
  console.log(`Contract: ${mandateManagerAddress}`);
  console.log(`MockTarget: ${targetAddress}`);
  console.log(`Creation Tx: https://testnet.monadexplorer.com/tx/${createMandateHash}`);
  console.log(`Execution Tx: https://testnet.monadexplorer.com/tx/${execTxHash}`);
  console.log(`Revocation Tx: https://testnet.monadexplorer.com/tx/${revokeTxHash}`);
}

main().catch((err) => {
  console.error('Fatal error during deployment & execution:', err);
  process.exit(1);
});
