import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, type Hex } from 'viem';

/** On-chain shape of WebAuthnP256.Assertion. */
export interface WebAuthnAssertion {
  authenticatorData: Hex;
  clientDataJSON: Hex;
  challengeIndex: bigint;
  typeIndex: bigint;
  r: Hex;
  s: Hex;
}

/** A P-256 public key as two 32-byte big-endian coordinates. */
export interface PasskeyPublicKey {
  x: Hex;
  y: Hex;
}

const P256_N = p256.CURVE.n;

/** Unpadded base64url, the encoding browsers use for the WebAuthn challenge. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Parse an ASN.1 DER ECDSA signature into 32-byte r and s, normalizing s to the low half. */
export function parseDerSignature(der: Uint8Array): { r: Hex; s: Hex } {
  const sig = p256.Signature.fromDER(der);
  const s = sig.s > P256_N / 2n ? P256_N - sig.s : sig.s;
  return { r: toWord(sig.r), s: toWord(s) };
}

/**
 * Turn the raw pieces of a WebAuthn assertion (what navigator.credentials.get() returns) into
 * the struct AgentMandates expects. Locates the type and challenge fields in clientDataJSON and
 * checks the challenge is the one we asked to sign, so a bad assertion fails here, not on-chain.
 */
export function toAssertion(input: {
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
  expectedChallenge: Hex;
}): WebAuthnAssertion {
  const json = new TextDecoder().decode(input.clientDataJSON);
  const typeIndex = json.indexOf('"type":"webauthn.get"');
  if (typeIndex < 0) throw new Error('clientDataJSON is not a webauthn.get assertion');
  const challengeIndex = json.indexOf('"challenge":"');
  if (challengeIndex < 0) throw new Error('clientDataJSON has no challenge');
  const expected = base64UrlEncode(hexToBytes(input.expectedChallenge));
  if (json.slice(challengeIndex + 13, challengeIndex + 13 + expected.length + 1) !== `${expected}"`) {
    throw new Error('Passkey signed a different challenge than requested');
  }
  const flags = input.authenticatorData[32] ?? 0;
  if ((flags & 0x01) === 0 || (flags & 0x04) === 0) {
    throw new Error('Authenticator did not report user presence and user verification');
  }
  const { r, s } = parseDerSignature(input.signature);
  return {
    authenticatorData: bytesToHex(input.authenticatorData),
    clientDataJSON: bytesToHex(input.clientDataJSON),
    challengeIndex: BigInt(challengeIndex),
    typeIndex: BigInt(typeIndex),
    r,
    s,
  };
}

/** Extract (x, y) from the SPKI DER bytes returned by AuthenticatorAttestationResponse.getPublicKey(). */
export function parseSpkiPublicKey(spki: Uint8Array): PasskeyPublicKey {
  // P-256 SPKI ends with the 65-byte uncompressed point 0x04 || X || Y.
  const point = spki.slice(spki.length - 65);
  if (point[0] !== 0x04) throw new Error('Expected an uncompressed P-256 public key');
  p256.ProjectivePoint.fromHex(point).assertValidity();
  return { x: bytesToHex(point.slice(1, 33)), y: bytesToHex(point.slice(33)) };
}

/**
 * Create a new device passkey (Face ID / Touch ID / Windows Hello / security key) and return its
 * P-256 public key. Nothing is sent anywhere: the key's on-chain identity is ownerKeyOf(publicKey),
 * recorded the first time it signs a mandate.
 */
export async function createBrowserPasskey(
  userName: string,
  rpName = 'AgentTrust'
): Promise<{ publicKey: PasskeyPublicKey; credentialId: Hex }> {
  const nav = (globalThis as any).navigator;
  if (!nav?.credentials?.create) throw new Error('WebAuthn is not available in this environment');
  const userId = new Uint8Array(16);
  globalThis.crypto.getRandomValues(userId);
  const challenge = new Uint8Array(32);
  globalThis.crypto.getRandomValues(challenge);
  const cred = await nav.credentials.create({
    publicKey: {
      challenge,
      rp: { name: rpName },
      user: { id: userId, name: userName, displayName: userName },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256 = P-256
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      attestation: 'none',
      timeout: 60_000,
    },
  });
  if (!cred) throw new Error('Passkey creation was dismissed');
  const spki = cred.response.getPublicKey?.();
  if (!spki) throw new Error('This browser cannot export the passkey public key (getPublicKey unsupported)');
  return { publicKey: parseSpkiPublicKey(new Uint8Array(spki)), credentialId: bytesToHex(new Uint8Array(cred.rawId)) };
}

/**
 * Sign `challenge` with a passkey in the browser. Prompts Face ID / Touch ID / Windows Hello and
 * requires user verification. Pass the credential id to skip the account picker.
 */
export async function signWithBrowserPasskey(challenge: Hex, credentialId?: Hex): Promise<WebAuthnAssertion> {
  const nav = (globalThis as any).navigator;
  if (!nav?.credentials?.get) throw new Error('WebAuthn is not available in this environment');
  const cred = await nav.credentials.get({
    publicKey: {
      challenge: hexToBytes(challenge),
      userVerification: 'required',
      timeout: 60_000,
      ...(credentialId ? { allowCredentials: [{ type: 'public-key', id: hexToBytes(credentialId) }] } : {}),
    },
  });
  if (!cred) throw new Error('Passkey prompt was dismissed');
  const res = cred.response;
  return toAssertion({
    authenticatorData: new Uint8Array(res.authenticatorData),
    clientDataJSON: new Uint8Array(res.clientDataJSON),
    signature: new Uint8Array(res.signature),
    expectedChallenge: challenge,
  });
}

/**
 * Recover an existing passkey's public key on a device that doesn't have it stored, from one
 * assertion. ECDSA recovery yields up to two candidate keys; pick the one registered on-chain
 * (`passkeys(ownerKeyOf(candidate))`), or call again and intersect the candidates.
 */
export async function recoverBrowserPasskey(): Promise<{ candidates: PasskeyPublicKey[]; credentialId: Hex }> {
  const nav = (globalThis as any).navigator;
  if (!nav?.credentials?.get) throw new Error('WebAuthn is not available in this environment');
  const challenge = new Uint8Array(32);
  globalThis.crypto.getRandomValues(challenge);
  const cred = await nav.credentials.get({ publicKey: { challenge, userVerification: 'required', timeout: 60_000 } });
  if (!cred) throw new Error('Passkey prompt was dismissed');
  const res = cred.response;
  const authData = new Uint8Array(res.authenticatorData);
  const message = sha256(new Uint8Array([...authData, ...sha256(new Uint8Array(res.clientDataJSON))]));
  const sig = p256.Signature.fromDER(new Uint8Array(res.signature));
  const candidates: PasskeyPublicKey[] = [];
  for (const bit of [0, 1]) {
    try {
      const point = sig.addRecoveryBit(bit).recoverPublicKey(message).toRawBytes(false);
      candidates.push({ x: bytesToHex(point.slice(1, 33)), y: bytesToHex(point.slice(33)) });
    } catch {}
  }
  return { candidates, credentialId: bytesToHex(new Uint8Array(cred.rawId)) };
}

/**
 * A software P-256 authenticator that produces byte-for-byte WebAuthn assertions. For scripts,
 * tests, CI and headless agents' owners; real users sign with a device passkey instead.
 */
export function createSoftwarePasskey(privateKey?: Hex, origin = 'https://agenttrust.vercel.app') {
  const priv = privateKey ? hexToBytes(privateKey) : p256.utils.randomPrivateKey();
  const pub = p256.getPublicKey(priv, false);
  const publicKey: PasskeyPublicKey = { x: bytesToHex(pub.slice(1, 33)), y: bytesToHex(pub.slice(33)) };
  const rpIdHash = sha256(new TextEncoder().encode(new URL(origin).hostname));

  return {
    publicKey,
    privateKey: bytesToHex(priv),
    sign(challenge: Hex): WebAuthnAssertion {
      const authenticatorData = new Uint8Array(37);
      authenticatorData.set(rpIdHash, 0);
      authenticatorData[32] = 0x05; // UP | UV
      authenticatorData[36] = 1;
      const clientDataJSON = new TextEncoder().encode(
        JSON.stringify({
          type: 'webauthn.get',
          challenge: base64UrlEncode(hexToBytes(challenge)),
          origin,
          crossOrigin: false,
        })
      );
      const message = sha256(new Uint8Array([...authenticatorData, ...sha256(clientDataJSON)]));
      const sig = p256.sign(message, priv, { lowS: true, prehash: false });
      return toAssertion({
        authenticatorData,
        clientDataJSON,
        signature: sig.toDERRawBytes(),
        expectedChallenge: challenge,
      });
    },
  };
}

function toWord(n: bigint): Hex {
  return `0x${n.toString(16).padStart(64, '0')}`;
}
