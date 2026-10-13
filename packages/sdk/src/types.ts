import type { Address, Hex } from 'viem';

export interface AllowedTarget {
  target: Address;
  selector: Hex; // 4-byte selector or 0x00000000 for any function on target
}

export interface Mandate {
  owner: Address;
  agentAddress: Address;
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
  agentAddress: Address;
  agentId: bigint;
  targets: AllowedTarget[];
  maxValuePerTx: bigint;
  maxTotalValue: bigint;
  expiresAt: bigint;
  nonce?: bigint;
  depositValue?: bigint; // optional initial funding in wei
}

export interface CreateMandateWithWebAuthnParams {
  agentAddress: Address;
  agentId: bigint;
  targets: AllowedTarget[];
  maxValuePerTx: bigint;
  maxTotalValue: bigint;
  expiresAt: bigint;
  nonce?: bigint;
  depositValue?: bigint;
  sigR: Hex;
  sigS: Hex;
  authenticatorData: Hex;
  clientDataJSON: Hex;
  challengeOffset: bigint;
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
  mandateBalance?: bigint;
}

export type ReceiptVerificationStatus =
  | 'success'
  | 'reverted'
  | 'not_found'
  | 'rpc_error'
  | 'wrong_network';

export interface VerifyReceiptOptions {
  expectedMandateId?: bigint;
  expectedTarget?: Address;
  expectedSelector?: Hex;
  expectedMaxValue?: bigint;
  expectedValue?: bigint;
  expectedChainId?: number;
}

export interface ExecutionReceiptVerification {
  verified: boolean;
  status: ReceiptVerificationStatus;
  mandateId?: bigint;
  target?: Address;
  selector?: Hex;
  value?: bigint;
  returnData?: Hex;
  transactionHash: Hex;
  blockNumber: bigint;
  gasUsed?: bigint;
  revertReason?: string;
  logs?: any[];
}

export interface MonadNetworkConfig {
  chainId: number;
  rpcUrl: string;
  mandateManagerAddress: Address;
  p256VerifierAddress?: Address;
  identityRegistryAddress?: Address;
}

export interface AgentIdentityVerification {
  verified: boolean;
  agentId: bigint;
  registryAddress: Address;
  agentWallet?: Address;
  owner?: Address;
  error?: string;
}

