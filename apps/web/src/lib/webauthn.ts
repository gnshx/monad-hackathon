import type { Hex } from 'viem';
import { toHex } from 'viem';

export type NetworkMode = 'local_simulation' | 'monad_testnet';

export interface PasskeyKeypair {
  pubKeyX: Hex;
  pubKeyY: Hex;
  rawCredentialId: string;
}

export interface PasskeySignatureData {
  sigR: Hex;
  sigS: Hex;
  challengeHash: Hex;
  authenticatorData: Hex;
  clientDataJSON: Hex;
  challengeOffset: bigint;
  isSimulated: boolean;
}

/**
 * Registers a new P-256 Passkey on the user's device using the WebAuthn standard API.
 * Returns the uncompressed P-256 coordinates (pubKeyX, pubKeyY).
 * In testnet mode, throws on any error instead of falling back to simulation.
 */
export async function registerPasskey(userName: string, mode: NetworkMode = 'local_simulation'): Promise<PasskeyKeypair> {
  if (typeof window === 'undefined' || !window.navigator?.credentials) {
    throw new Error('WebAuthn is not supported in this browser environment');
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const userId = new Uint8Array(16);
  window.crypto.getRandomValues(userId);

  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'AgentTrust on Monad',
          id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
        },
        user: {
          id: userId,
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256 (ECDSA P-256)
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'preferred',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential;

    if (!credential) throw new Error('No credential created');

    // Parse the P-256 public key from credential response
    const rawId = toHex(new Uint8Array(credential.rawId));
    
    // In web browsers supporting getPublicKey(), obtain the SPKI DER bytes:
    const response = credential.response as AuthenticatorAttestationResponse;
    const publicKeyDer = (response as any).getPublicKey?.();

    if (!publicKeyDer) {
      throw new Error(
        'Authenticator did not return SPKI public key bytes (getPublicKey() unavailable). A WebAuthn compliant platform authenticator (e.g. TouchID, Windows Hello, YubiKey) is required.'
      );
    }

    const pubBytes = new Uint8Array(publicKeyDer);
    // The last 64 bytes of the SubjectPublicKeyInfo DER for P-256 are the uncompressed (X, Y) points
    const xBytes = pubBytes.slice(pubBytes.length - 64, pubBytes.length - 32);
    const yBytes = pubBytes.slice(pubBytes.length - 32);
    return {
      pubKeyX: toHex(xBytes),
      pubKeyY: toHex(yBytes),
      rawCredentialId: rawId,
    };
  } catch (err: any) {
    // In testnet mode, fail closed - never silently fall back to simulation
    if (mode === 'monad_testnet') {
      throw new Error(`Passkey registration failed: ${err.message || String(err)}. Cannot proceed in testnet mode without a valid hardware credential.`);
    }
    // Local simulation mode: generate simulated credential for demo purposes
    console.warn('WebAuthn prompt dismissed or not supported, generating simulated test passkey:', err);
    return generateSimulatedPasskey();
  }
}

/**
 * Signs the mandate challenge using the registered Passkey.
 * Fails closed if the user dismisses the prompt or authenticator errors.
 */
export async function signMandateWithPasskey(
  challengeHash: Hex,
  credentialId?: string
): Promise<PasskeySignatureData> {
  if (typeof window === 'undefined' || !window.navigator?.credentials) {
    throw new Error('WebAuthn hardware authentication is not supported in this browser environment');
  }

  try {
    const rawChallenge = hexToUint8Array(challengeHash);

    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: rawChallenge as unknown as BufferSource,
        timeout: 60000,
        userVerification: 'preferred',
        // Pin the passkey the contract knows about. Without this the browser may offer any
        // passkey for this site (for example a v2 Passkey Mandates one) and the contract
        // would reject the signature.
        ...(credentialId
          ? {
              allowCredentials: [
                { type: 'public-key' as const, id: hexToUint8Array(credentialId as Hex) as unknown as BufferSource },
              ],
            }
          : {}),
      },
    })) as PublicKeyCredential;

    if (!assertion) throw new Error('No assertion returned from passkey authenticator');

    const response = assertion.response as AuthenticatorAssertionResponse;
    if (!response.signature) throw new Error('Missing signature in WebAuthn assertion response');

    const signatureDer = new Uint8Array(response.signature);

    // Parse ASN.1 DER signature to extract 32-byte R and S
    const { r, s } = parseDerSignature(signatureDer);

    const authData = new Uint8Array(response.authenticatorData);
    const clientDataJSONBytes = new Uint8Array(response.clientDataJSON);
    const clientDataJSONStr = new TextDecoder().decode(clientDataJSONBytes);

    const challengeBytes = hexToUint8Array(challengeHash);
    let binary = '';
    for (let i = 0; i < challengeBytes.length; i++) binary += String.fromCharCode(challengeBytes[i]);
    const base64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const challengeOffset = BigInt(Math.max(0, clientDataJSONStr.indexOf(base64url)));

    return {
      sigR: toHex(r),
      sigS: toHex(s),
      challengeHash,
      authenticatorData: toHex(authData),
      clientDataJSON: toHex(clientDataJSONBytes),
      challengeOffset,
      isSimulated: false,
    };
  } catch (err: any) {
    console.error('WebAuthn signature verification failed:', err);
    throw new Error(`Passkey hardware signature cancelled or failed: ${err.message || String(err)}`);
  }
}

function hexToUint8Array(hex: Hex): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

function parseDerSignature(der: Uint8Array): { r: Uint8Array; s: Uint8Array } {
  // Simple ASN.1 DER parser for ECDSA signature (SEQUENCE { INTEGER r, INTEGER s })
  let offset = 2; // skip sequence header
  if (der[1] & 0x80) offset += der[1] & 0x7f; // multi-byte length

  // Parse R
  offset++; // skip INTEGER tag (0x02)
  let rLen = der[offset++];
  let r = der.slice(offset, offset + rLen);
  if (r.length > 32) r = r.slice(r.length - 32); // strip leading zero
  while (r.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(r, 32 - r.length);
    r = padded;
  }
  offset += rLen;

  // Parse S
  offset++; // skip INTEGER tag
  let sLen = der[offset++];
  let s = der.slice(offset, offset + sLen);
  if (s.length > 32) s = s.slice(s.length - 32);
  while (s.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(s, 32 - s.length);
    s = padded;
  }

  // Authenticators return a high s about half the time. MandateManager._checkSignatureBounds
  // rejects s > n/2 (malleability guard), so normalise to the equivalent low-s value n - s.
  let sBig = bytesToBigInt(s);
  if (sBig > P256_N_DIV_2) sBig = P256_N - sBig;

  return { r, s: bigIntToBytes32(sBig) };
}

const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const P256_N_DIV_2 = P256_N / 2n;

function bytesToBigInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

function bigIntToBytes32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export function generateSimulatedPasskey(): PasskeyKeypair {
  const rand = () => {
    const b = new Uint8Array(32);
    for (let i = 0; i < 32; i++) b[i] = Math.floor(Math.random() * 256);
    return toHex(b);
  };
  return {
    pubKeyX: rand(),
    pubKeyY: rand(),
    rawCredentialId: rand(),
  };
}

export function generateSimulatedSignature(challengeHash: Hex): PasskeySignatureData {
  const rand = () => {
    const b = new Uint8Array(32);
    for (let i = 0; i < 32; i++) b[i] = Math.floor(Math.random() * 256);
    return toHex(b);
  };

  const challengeBytes = hexToUint8Array(challengeHash);
  let binary = '';
  for (let i = 0; i < challengeBytes.length; i++) binary += String.fromCharCode(challengeBytes[i]);
  const base64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const clientDataJSONStr = `{"type":"webauthn.get","challenge":"${base64url}","origin":"http://localhost:3000"}`;
  const clientDataJSON = toHex(new TextEncoder().encode(clientDataJSONStr));
  const challengeOffset = BigInt(clientDataJSONStr.indexOf(base64url));

  // 37 bytes of authenticator data with UP (0x01) bit at byte 32
  const authData = new Uint8Array(37);
  authData[32] = 0x01; // User Presence flag
  authData[36] = 0x01; // Sign count

  return {
    sigR: rand(),
    sigS: rand(),
    challengeHash,
    authenticatorData: toHex(authData),
    clientDataJSON,
    challengeOffset,
    isSimulated: true,
  };
}
