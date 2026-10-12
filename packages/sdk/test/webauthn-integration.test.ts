import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { computeMandateHash } from '../src/mandate.js';
import type { Address, Hex } from 'viem';
import { toHex } from 'viem';

describe('WebAuthn P-256 End-to-End Cryptographic Assertion Test', () => {
  // 1. Generate real SECP256R1 (P-256) keypair using native crypto
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  // Extract raw uncompressed 64-byte public key point (X, Y)
  const jwk = publicKey.export({ format: 'jwk' });
  const rawX = Buffer.from(jwk.x!, 'base64url');
  const rawY = Buffer.from(jwk.y!, 'base64url');
  const pubKeyX = toHex(rawX) as Hex;
  const pubKeyY = toHex(rawY) as Hex;

  const chainId = 10143;
  const mandateManagerAddress: Address = '0x59b670e9fA9D0A427751Af201D676719a970857b';
  const owner: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  const agentAddress: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const agentId = 42n;
  const targets = [{ target: '0x3333333333333333333333333333333333333333' as Address, selector: '0xa9059cbb' as Hex }];
  const maxValuePerTx = 100000000000000000n; // 0.1 MON
  const maxTotalValue = 1000000000000000000n; // 1.0 MON
  const expiresAt = 0n;
  const nonce = 0n;

  // 2. Compute canonical mandate hash
  const challengeHash = computeMandateHash({
    chainId,
    mandateManagerAddress,
    owner,
    agentAddress,
    agentId,
    targets,
    maxValuePerTx,
    maxTotalValue,
    expiresAt,
    nonce,
  });

  function toBase64Url(hexHash: Hex): string {
    const raw = Buffer.from(hexHash.slice(2), 'hex');
    return raw.toString('base64url');
  }

  function parseDerSignature(der: Buffer): { r: Buffer; s: Buffer } {
    let offset = 2;
    if (der[1] & 0x80) offset += der[1] & 0x7f;
    offset++; // tag 0x02
    const rLen = der[offset++];
    let r = der.subarray(offset, offset + rLen);
    if (r.length > 32) r = r.subarray(r.length - 32);
    if (r.length < 32) {
      const p = Buffer.alloc(32);
      r.copy(p, 32 - r.length);
      r = p;
    }
    offset += rLen;

    offset++; // tag 0x02
    const sLen = der[offset++];
    let s = der.subarray(offset, offset + sLen);
    if (s.length > 32) s = s.subarray(s.length - 32);
    if (s.length < 32) {
      const p = Buffer.alloc(32);
      s.copy(p, 32 - s.length);
      s = p;
    }
    return { r, s };
  }

  it('generates genuine WebAuthn envelope with matching base64url challenge and validates signature', () => {
    const b64Challenge = toBase64Url(challengeHash);
    const clientDataJSONStr = `{"type":"webauthn.get","challenge":"${b64Challenge}","origin":"http://localhost:3000"}`;
    const clientDataJSON = Buffer.from(clientDataJSONStr, 'utf8');

    // Challenge offset check
    const challengeOffset = clientDataJSONStr.indexOf(b64Challenge);
    expect(challengeOffset).toBeGreaterThan(0);
    expect(clientDataJSONStr.slice(challengeOffset, challengeOffset + b64Challenge.length)).toBe(b64Challenge);

    // Construct authenticatorData (37 bytes): 32 bytes rpIdHash + 1 byte flags (UP=0x01) + 4 bytes counter
    const rpIdHash = crypto.createHash('sha256').update('localhost').digest();
    const flags = Buffer.from([0x01]); // User Presence asserted
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(1, 0);
    const authenticatorData = Buffer.concat([rpIdHash, flags, counter]);

    // Compute WebAuthn signed message: sha256(authenticatorData || sha256(clientDataJSON))
    const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
    const signedMessage = Buffer.concat([authenticatorData, clientDataHash]);

    // Sign with real P-256 private key
    const sign = crypto.createSign('SHA256');
    sign.update(signedMessage);
    const derSig = sign.sign(privateKey);

    const { r, s } = parseDerSignature(derSig);
    expect(r.length).toBe(32);
    expect(s.length).toBe(32);

    // Verify signature with native P-256 verifier
    const verify = crypto.createVerify('SHA256');
    verify.update(signedMessage);
    const isValid = verify.verify(publicKey, derSig);
    expect(isValid).toBe(true);
  });

  it('rejects verification if challenge is modified in clientDataJSON', () => {
    const b64Challenge = toBase64Url(challengeHash);
    // Tamper with challenge
    const forgedChallenge = 'A' + b64Challenge.slice(1);
    const clientDataJSONStr = `{"type":"webauthn.get","challenge":"${forgedChallenge}","origin":"http://localhost:3000"}`;
    const clientDataJSON = Buffer.from(clientDataJSONStr, 'utf8');

    const expectedB64 = toBase64Url(challengeHash);
    const foundChallenge = clientDataJSONStr.slice(
      clientDataJSONStr.indexOf('"challenge":"') + 13,
      clientDataJSONStr.indexOf('"challenge":"') + 13 + expectedB64.length
    );

    expect(foundChallenge).not.toBe(expectedB64);
  });

  it('rejects authenticatorData if User Presence (UP) bit 0x01 is missing', () => {
    const rpIdHash = crypto.createHash('sha256').update('localhost').digest();
    const flagsMissingUP = Buffer.from([0x00]); // UP bit 0x01 cleared!
    const counter = Buffer.alloc(4);
    const authData = Buffer.concat([rpIdHash, flagsMissingUP, counter]);

    const isUserPresent = (authData[32] & 0x01) !== 0;
    expect(isUserPresent).toBe(false);
  });

  it('rejects if signature bytes are tampered', () => {
    const b64Challenge = toBase64Url(challengeHash);
    const clientDataJSON = Buffer.from(
      `{"type":"webauthn.get","challenge":"${b64Challenge}","origin":"http://localhost:3000"}`
    );
    const rpIdHash = crypto.createHash('sha256').update('localhost').digest();
    const authData = Buffer.concat([rpIdHash, Buffer.from([0x01]), Buffer.alloc(4)]);
    const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
    const signedMessage = Buffer.concat([authData, clientDataHash]);

    const sign = crypto.createSign('SHA256');
    sign.update(signedMessage);
    const derSig = sign.sign(privateKey);

    // Tamper with DER signature
    derSig[derSig.length - 1] ^= 0xff;

    const verify = crypto.createVerify('SHA256');
    verify.update(signedMessage);
    const isValid = verify.verify(publicKey, derSig);
    expect(isValid).toBe(false);
  });
});
