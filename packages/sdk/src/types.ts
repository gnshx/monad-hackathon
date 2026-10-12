import type { Address, Hex } from 'viem';

export interface AllowedTarget {
  target: Address;
  selector: Hex; // 4-byte selector or 0x00000000 for any function on target
}

export interface Mandate {
  owner: Address;
  agentId: bigint;
  maxValuePerTx: bigint; // in wei
  maxTotalValue: bigint; // in wei
  spentValue: bigint; // in wei
  expiresAt: bigint; // unix timestamp in seconds, 0 = infinite
  nonce: bigint;
  revoked: boolean;
}

export interface PasskeyCredential {
  pubKeyX: Hex; // 32-byte P-256 X coordinate
  pubKeyY: Hex; // 32-byte P-256 Y coordinate
}

export interface PasskeySignature {
  sigR: Hex; // 32-byte r
  sigS: Hex; // 32-byte s
  challengeHash: Hex; // 32-byte hash corresponding to the challenge
}

export interface CreateMandateParams {
  agentId: bigint;
  targets: AllowedTarget[];
  maxValuePerTx: bigint;
  maxTotalValue: bigint;
  expiresAt: bigint;
  nonce?: bigint;
}

export interface ExecuteActionParams {
  mandateId: bigint;
  agentId: bigint;
  target: Address;
  selector: Hex;
  callData: Hex;
  value: bigint;
  execNonce?: bigint;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  mandate?: Mandate;
  allowedTargets?: AllowedTarget[];
  remainingBudget?: bigint;
}

export interface ExecutionReceiptVerification {
  verified: boolean;
  status: 'success' | 'reverted';
  mandateId?: bigint;
  target?: Address;
  selector?: Hex;
  value?: bigint;
  returnData?: Hex;
  transactionHash: Hex;
  blockNumber: bigint;
  revertReason?: string;
}

export interface MonadNetworkConfig {
  chainId: number;
  rpcUrl: string;
  mandateManagerAddress: Address;
  p256VerifierAddress?: Address;
  identityRegistryAddress?: Address;
}
