import { createPublicClient, http, toHex, type Hex } from 'viem';
import crypto from 'crypto';

const RPC_URL = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const P256_PRECOMPILE = '0x0000000000000000000000000000000000000100' as const;

async function main() {
  console.log('================================================================');
  console.log('   🔍 P-256 (RIP-7212) PRECOMPILE VERIFICATION ON MONAD TESTNET');
  console.log('================================================================\n');

  const client = createPublicClient({
    transport: http(RPC_URL),
  });

  const chainId = await client.getChainId();
  console.log(`🌐 Connected to RPC: ${RPC_URL}`);
  console.log(`⛓️  Chain ID: ${chainId} (Expected: 10143)`);
  console.log(`📍 Precompile Address: ${P256_PRECOMPILE}`);
  console.log(`ℹ️  Scope Note: This script validates Monad's live precompile math using a real`);
  console.log(`    NIST P-256 (secp256r1) test vector. For end-user biometric passkeys (TouchID/FaceID),`);
  console.log(`    use the WebAuthn creation flow in the web console (apps/web).\n`);

  // Strict chain-ID gate — must be Monad Testnet
  if (chainId !== 10143) {
    console.error(`\n❌ CHAIN ID MISMATCH: expected 10143 (Monad Testnet), got ${chainId}.`);
    console.error('   Set MONAD_RPC_URL=https://testnet-rpc.monad.xyz and retry.\n');
    process.exit(1);
  }
  console.log('✅ Chain ID confirmed: 10143 = Monad Testnet\n');

  // 1. Generate real SECP256R1 (P-256) keypair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  const jwk = publicKey.export({ format: 'jwk' });
  const rawX = Buffer.from(jwk.x!, 'base64url');
  const rawY = Buffer.from(jwk.y!, 'base64url');

  // 2. Message hash (32 bytes)
  const message = 'AgentTrust Monad Testnet RIP-7212 P256 Cryptographic Verification Vector';
  const hash = crypto.createHash('sha256').update(message).digest();

  // 3. Sign using ECDSA-SHA256
  const sign = crypto.createSign('SHA256');
  sign.update(message);
  const derSig = sign.sign(privateKey);

  // Parse DER signature into 32-byte r and 32-byte s
  let offset = 2;
  if (derSig[1] & 0x80) offset += derSig[1] & 0x7f;
  offset++; // tag 0x02
  const rLen = derSig[offset++];
  let r = derSig.subarray(offset, offset + rLen);
  if (r.length > 32) r = r.subarray(r.length - 32);
  if (r.length < 32) {
    const pad = Buffer.alloc(32);
    r.copy(pad, 32 - r.length);
    r = pad;
  }
  offset += rLen;
  offset++; // tag 0x02
  const sLen = derSig[offset++];
  let s = derSig.subarray(offset, offset + sLen);
  if (s.length > 32) s = s.subarray(s.length - 32);
  if (s.length < 32) {
    const pad = Buffer.alloc(32);
    s.copy(pad, 32 - s.length);
    s = pad;
  }

  // Low-s normalization (BIP-62 / RIP-7212 requirement)
  const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
  const P256_N_DIV_2 = P256_N / 2n;
  let sBig = BigInt('0x' + s.toString('hex'));
  if (sBig > P256_N_DIV_2) {
    sBig = P256_N - sBig;
    s = Buffer.from(sBig.toString(16).padStart(64, '0'), 'hex');
  }

  // RIP-7212 standard: exactly 160 bytes: hash (32) + r (32) + s (32) + x (32) + y (32)
  const validPayload = ('0x' + Buffer.concat([hash, r, s, rawX, rawY]).toString('hex')) as Hex;

  console.log('--- TEST VECTOR 1: VALID P-256 SIGNATURE ---');
  console.log(`Message:         "${message}"`);
  console.log(`Hash (32B):      0x${hash.toString('hex')}`);
  console.log(`PubKey X (32B):  0x${rawX.toString('hex')}`);
  console.log(`PubKey Y (32B):  0x${rawY.toString('hex')}`);
  console.log(`Signature r:     0x${r.toString('hex')}`);
  console.log(`Signature s:     0x${s.toString('hex')}`);
  console.log(`Payload Bytes:   ${(validPayload.length - 2) / 2} bytes`);

  const validResponse = await client.call({
    to: P256_PRECOMPILE,
    data: validPayload,
  });

  console.log(`RPC Return Data: ${validResponse.data}`);
  const isValidOne =
    validResponse.data ===
    '0x0000000000000000000000000000000000000000000000000000000000000001';

  if (isValidOne) {
    console.log('✅ PASS: Precompile returned uint256(1) for valid P-256 signature!\n');
  } else {
    console.error('❌ FAIL: Expected uint256(1) return value!\n');
    process.exit(1);
  }

  // --- TEST VECTOR 2: INVALID SIGNATURE ---
  console.log('--- TEST VECTOR 2: TAMPERED SIGNATURE (FAIL-CLOSED) ---');
  const tamperedR = Buffer.from(r);
  tamperedR[31] ^= 0xff; // flip last byte of r
  const invalidPayload = ('0x' +
    Buffer.concat([hash, tamperedR, s, rawX, rawY]).toString('hex')) as Hex;

  const invalidResponse = await client.call({
    to: P256_PRECOMPILE,
    data: invalidPayload,
  });

  console.log(`RPC Return Data: ${invalidResponse.data || '0x (empty)'}`);
  const isFailClosed = !invalidResponse.data || invalidResponse.data === '0x';

  if (isFailClosed) {
    console.log('✅ PASS: Precompile returned 0x (fail-closed) for invalid signature!\n');
  } else {
    console.error('❌ FAIL: Tampered signature did not fail closed!\n');
    process.exit(1);
  }

  console.log('================================================================');
  console.log('🎉 MONAD TESTNET RIP-7212 PRECOMPILE PROVEN OPERATIONAL & LIVE');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Fatal error during precompile verification:', err);
  process.exit(1);
});
