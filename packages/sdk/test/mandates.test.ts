import { describe, expect, it } from 'vitest';
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes, keccak256, toHex, type Hex } from 'viem';
import {
  base64UrlEncode,
  createDigest,
  createSoftwarePasskey,
  ownerKeyOf,
  parseDerSignature,
  revokeDigest,
  toAssertion,
  MANDATE_ERRORS,
} from '../src/mandates/index.js';

// Same inputs as contracts/test/DigestVector.t.sol. If either side changes its encoding, both tests fail.
const domain = { chainId: 10143, contract: '0x1111111111111111111111111111111111111111' as const };
const OWNER_KEY = keccak256(toHex('owner'));

describe('digests match the contract', () => {
  it('createDigest', () => {
    const d = createDigest(
      domain,
      OWNER_KEY,
      {
        agent: '0x2222222222222222222222222222222222222222',
        agentId: 7n,
        permissions: [
          { target: '0x3333333333333333333333333333333333333333', selector: '0xa9059cbb' },
          { target: '0x4444444444444444444444444444444444444444', selector: '0x00000000' },
        ],
        maxPerCall: 10n ** 18n,
        budget: 5n * 10n ** 18n,
        expiresAt: 1_800_000_000n,
        tokenLimits: [{ token: '0x5555555555555555555555555555555555555555', maxPerCall: 10_000_000n, budget: 25_000_000n }],
      },
      3n
    );
    expect(d).toBe('0x7480efa2df0632a6966eb3c06a10d0de5dcb0565931243ed0e1eb3932374128d');
  });

  it('revokeDigest', () => {
    expect(revokeDigest(domain, OWNER_KEY, 9n, 4n)).toBe(
      '0x9923ce5d06bd4669878bafb4e4394dcb16a7f7f5c8a8ae40c7f3faf7f46ba3b9'
    );
  });
});

describe('WebAuthn helpers', () => {
  const challenge = keccak256(toHex('challenge')) as Hex;

  it('software passkey produces a verifiable, low-S assertion with correct indices', () => {
    const pk = createSoftwarePasskey();
    const a = pk.sign(challenge);
    const json = new TextDecoder().decode(hexToBytes(a.clientDataJSON));
    expect(json.slice(Number(a.typeIndex), Number(a.typeIndex) + 21)).toBe('"type":"webauthn.get"');
    expect(json.slice(Number(a.challengeIndex) + 13, Number(a.challengeIndex) + 56)).toBe(base64UrlEncode(hexToBytes(challenge)));
    expect(BigInt(a.s) <= p256.CURVE.n / 2n).toBe(true);
    expect(hexToBytes(a.authenticatorData)[32] & 0x05).toBe(0x05);

    const authData = hexToBytes(a.authenticatorData);
    const msg = sha256(new Uint8Array([...authData, ...sha256(hexToBytes(a.clientDataJSON))]));
    const sig = new p256.Signature(BigInt(a.r), BigInt(a.s));
    const pub = new Uint8Array([4, ...hexToBytes(pk.publicKey.x), ...hexToBytes(pk.publicKey.y)]);
    expect(p256.verify(sig, msg, pub, { prehash: false })).toBe(true);
  });

  it('normalizes high-S DER signatures', () => {
    const priv = p256.utils.randomPrivateKey();
    const msg = sha256(new Uint8Array([1, 2, 3]));
    const sig = p256.sign(msg, priv, { lowS: true, prehash: false });
    const high = new p256.Signature(sig.r, p256.CURVE.n - sig.s);
    const { s } = parseDerSignature(high.toDERRawBytes());
    expect(BigInt(s)).toBe(sig.s);
  });

  it('rejects an assertion over a different challenge', () => {
    const pk = createSoftwarePasskey();
    const a = pk.sign(challenge);
    expect(() =>
      toAssertion({
        authenticatorData: hexToBytes(a.authenticatorData),
        clientDataJSON: hexToBytes(a.clientDataJSON),
        signature: new p256.Signature(BigInt(a.r), BigInt(a.s)).toDERRawBytes(),
        expectedChallenge: keccak256(toHex('other')),
      })
    ).toThrow(/different challenge/);
  });

  it('rejects an assertion without user verification', () => {
    const pk = createSoftwarePasskey();
    const a = pk.sign(challenge);
    const authData = hexToBytes(a.authenticatorData);
    authData[32] = 0x01;
    expect(() =>
      toAssertion({
        authenticatorData: authData,
        clientDataJSON: hexToBytes(a.clientDataJSON),
        signature: new p256.Signature(BigInt(a.r), BigInt(a.s)).toDERRawBytes(),
        expectedChallenge: challenge,
      })
    ).toThrow(/user verification/);
  });

  it('ownerKeyOf is keccak(abi.encode(x, y))', () => {
    const x = `0x${'11'.repeat(32)}` as Hex;
    const y = `0x${'22'.repeat(32)}` as Hex;
    expect(ownerKeyOf({ x, y })).toBe(keccak256(`0x${'11'.repeat(32)}${'22'.repeat(32)}`));
  });

  it('maps revert selectors to names', () => {
    expect(Object.values(MANDATE_ERRORS)).toContain('ExceedsBudget');
    expect(Object.values(MANDATE_ERRORS)).toContain('TargetIsVaultToken');
  });
});

describe('passkey recovery math', () => {
  it('one of the two recovered keys is the signer', () => {
    const priv = p256.utils.randomPrivateKey();
    const pub = p256.getPublicKey(priv, false);
    const msg = sha256(new Uint8Array([9, 9, 9]));
    const der = p256.sign(msg, priv, { prehash: false }).toDERRawBytes();
    const sig = p256.Signature.fromDER(der);
    const keys = [0, 1].map((b) => toHex(sig.addRecoveryBit(b).recoverPublicKey(msg).toRawBytes(false)));
    expect(keys).toContain(toHex(pub));
  });
});
