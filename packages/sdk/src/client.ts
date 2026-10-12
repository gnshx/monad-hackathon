import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import {
  computeMandateHash,
  createMandate,
  createMandateWithWebAuthn,
  getMandate,
  getMandateBalance,
  getAllowedTargets,
  isMandateActive,
  depositFunds,
  withdrawUnspent,
  revokeMandate,
} from './mandate.js';
import { executeAction, type ExecuteResult } from './execute.js';
import { verifyActionPreflight, verifyReceipt } from './verify.js';
import type {
  AllowedTarget,
  CreateMandateParams,
  CreateMandateWithWebAuthnParams,
  ExecutionReceiptVerification,
  Mandate,
  MonadNetworkConfig,
  PasskeySignature,
  VerificationResult,
  VerifyReceiptOptions,
} from './types.js';

export interface AgentTrustClientOptions {
  contractAddress: Address;
  publicClient: PublicClient;
  walletClient?: WalletClient;
  network?: MonadNetworkConfig;
}

/**
 * Main SDK Client for AgentTrust.
 * Used by agents, MCP tool servers, and frontends to manage and verify mandates on Monad.
 */
export class AgentTrustClient {
  public readonly contractAddress: Address;
  public readonly publicClient: PublicClient;
  public readonly walletClient?: WalletClient;
  public readonly network?: MonadNetworkConfig;

  constructor(options: AgentTrustClientOptions) {
    this.contractAddress = options.contractAddress;
    this.publicClient = options.publicClient;
    this.walletClient = options.walletClient;
    this.network = options.network;
  }

  /**
   * Computes canonical hash for a mandate specification.
   */
  async computeMandateHash(params: {
    owner: Address;
    agentAddress: Address;
    agentId: bigint;
    targets: AllowedTarget[];
    maxValuePerTx: bigint;
    maxTotalValue: bigint;
    expiresAt: bigint;
    nonce: bigint;
  }): Promise<Hex> {
    const chainId = await this.publicClient.getChainId();
    return computeMandateHash({
      chainId,
      mandateManagerAddress: this.contractAddress,
      ...params,
    });
  }

  /**
   * Submits a newly authorized mandate with raw P-256 signature to Monad.
   */
  async createMandate(
    params: CreateMandateParams,
    passkeySig: PasskeySignature
  ): Promise<{ mandateId: bigint; transactionHash: Hex }> {
    if (!this.walletClient) throw new Error('walletClient is required to create a mandate');
    return createMandate(
      this.walletClient,
      this.publicClient,
      this.contractAddress,
      params,
      passkeySig
    );
  }

  /**
   * Submits a newly authorized mandate with a WebAuthn assertion envelope to Monad.
   */
  async createMandateWithWebAuthn(
    params: CreateMandateWithWebAuthnParams
  ): Promise<{ mandateId: bigint; transactionHash: Hex }> {
    if (!this.walletClient) throw new Error('walletClient is required to create a mandate');
    return createMandateWithWebAuthn(
      this.walletClient,
      this.publicClient,
      this.contractAddress,
      params
    );
  }

  /**
   * Reads a mandate by ID.
   */
  async getMandate(mandateId: bigint): Promise<Mandate> {
    return getMandate(this.publicClient, this.contractAddress, mandateId);
  }

  /**
   * Reads isolated vault balance of a mandate.
   */
  async getMandateBalance(mandateId: bigint): Promise<bigint> {
    return getMandateBalance(this.publicClient, this.contractAddress, mandateId);
  }

  /**
   * Reads allowed targets and selectors for a mandate.
   */
  async getAllowedTargets(mandateId: bigint): Promise<AllowedTarget[]> {
    return getAllowedTargets(this.publicClient, this.contractAddress, mandateId);
  }

  /**
   * Checks if a mandate is active.
   */
  async isActive(mandateId: bigint): Promise<boolean> {
    return isMandateActive(this.publicClient, this.contractAddress, mandateId);
  }

  /**
   * Deposits native MON into an isolated mandate vault.
   */
  async deposit(mandateId: bigint, amount: bigint): Promise<{ transactionHash: Hex }> {
    if (!this.walletClient) throw new Error('walletClient is required to deposit funds');
    return depositFunds(this.walletClient, this.publicClient, this.contractAddress, mandateId, amount);
  }

  /**
   * Withdraws unspent funds from a revoked or expired mandate back to the owner.
   */
  async withdrawUnspent(mandateId: bigint): Promise<{ transactionHash: Hex }> {
    if (!this.walletClient) throw new Error('walletClient is required to withdraw unspent funds');
    return withdrawUnspent(this.walletClient, this.publicClient, this.contractAddress, mandateId);
  }

  /**
   * Pre-verifies whether an agent action is permissible under the mandate.
   */
  async verify(
    mandateId: bigint,
    action: {
      agentId: bigint;
      target: Address;
      selector: Hex;
      value: bigint;
    }
  ): Promise<VerificationResult> {
    return verifyActionPreflight(
      this.publicClient,
      this.contractAddress,
      mandateId,
      action
    );
  }

  /**
   * Executes an action on-chain within the mandate.
   */
  async execute(
    mandateId: bigint,
    action: {
      agentId: bigint;
      target: Address;
      selector: Hex;
      callData: Hex;
      value: bigint;
      execNonce?: bigint;
    }
  ): Promise<ExecuteResult> {
    if (!this.walletClient) throw new Error('walletClient is required to execute an action');
    return executeAction(
      this.walletClient,
      this.publicClient,
      this.contractAddress,
      {
        mandateId,
        ...action,
      }
    );
  }

  /**
   * Revokes an existing mandate.
   */
  async revoke(mandateId: bigint): Promise<{ transactionHash: Hex }> {
    if (!this.walletClient) throw new Error('walletClient is required to revoke a mandate');
    return revokeMandate(
      this.walletClient,
      this.publicClient,
      this.contractAddress,
      mandateId
    );
  }

  /**
   * Independently verifies an on-chain execution receipt.
   */
  async verifyReceipt(
    transactionHash: Hex,
    options?: VerifyReceiptOptions
  ): Promise<ExecutionReceiptVerification> {
    return verifyReceipt(this.publicClient, this.contractAddress, transactionHash, options);
  }
}
