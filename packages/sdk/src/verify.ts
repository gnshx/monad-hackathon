import {
  type Address,
  type Hex,
  type PublicClient,
  decodeEventLog,
} from 'viem';
import {
  MandateManagerABI,
  ERC8004_IDENTITY_REGISTRY_ABI,
  MONAD_TESTNET_ERC8004_REGISTRY,
} from './abi.js';
import { getMandate, getAllowedTargets, getMandateBalance } from './mandate.js';
import type {
  AgentIdentityVerification,
  ExecutionReceiptVerification,
  VerificationResult,
  VerifyReceiptOptions,
} from './types.js';

/**
 * Advisory pre-check verifying whether an intended action satisfies all on-chain
 * permissions and spending constraints of a mandate before broadcasting.
 * Note: Contract execution on Monad remains the authoritative enforcement boundary.
 */
export async function verifyActionPreflight(
  publicClient: PublicClient,
  contractAddress: Address,
  mandateId: bigint,
  action: {
    agentId: bigint;
    target: Address;
    selector: Hex;
    value: bigint;
  }
): Promise<VerificationResult> {
  const mandate = await getMandate(publicClient, contractAddress, mandateId);

  if (mandate.owner === '0x0000000000000000000000000000000000000000') {
    return { valid: false, reason: 'Mandate does not exist' };
  }

  if (mandate.revoked) {
    return { valid: false, reason: 'Mandate has been revoked by owner' };
  }

  // Check expiry against latest block timestamp
  const block = await publicClient.getBlock();
  if (mandate.expiresAt !== 0n && block.timestamp > mandate.expiresAt) {
    return {
      valid: false,
      reason: `Mandate expired at ${mandate.expiresAt} (current block time: ${block.timestamp})`,
    };
  }

  if (mandate.agentId !== action.agentId) {
    return {
      valid: false,
      reason: `Agent ID mismatch: authorized for ${mandate.agentId}, requested by ${action.agentId}`,
    };
  }

  // Check spending constraints
  if (action.value > mandate.maxValuePerTx) {
    return {
      valid: false,
      reason: `Value ${action.value} exceeds per-action cap ${mandate.maxValuePerTx}`,
    };
  }

  const remainingBudget =
    mandate.maxTotalValue >= mandate.spentValue
      ? mandate.maxTotalValue - mandate.spentValue
      : 0n;

  if (action.value > remainingBudget) {
    return {
      valid: false,
      reason: `Value ${action.value} exceeds remaining cumulative budget ${remainingBudget}`,
      remainingBudget,
    };
  }

  // Check target and selector allowlist
  const targets = await getAllowedTargets(publicClient, contractAddress, mandateId);
  const targetLower = action.target.toLowerCase();
  const selectorLower = action.selector.toLowerCase();

  const isAllowed = targets.some((t) => {
    const isTargetMatch = t.target.toLowerCase() === targetLower;
    const isSelectorMatch =
      t.selector === '0x00000000' || t.selector.toLowerCase() === selectorLower;
    return isTargetMatch && isSelectorMatch;
  });

  if (!isAllowed) {
    return {
      valid: false,
      reason: `Target ${action.target} or selector ${action.selector} is not allowlisted`,
      mandate,
      allowedTargets: targets,
      remainingBudget,
    };
  }

  // Query isolated mandate vault balance
  let mandateBalance = 0n;
  try {
    mandateBalance = await getMandateBalance(publicClient, contractAddress, mandateId);
  } catch {
    // If balance reading fails, omit
  }

  return {
    valid: true,
    mandate,
    allowedTargets: targets,
    remainingBudget,
    mandateBalance,
  };
}

/**
 * Independently verifies an execution transaction receipt directly against the blockchain.
 * Decodes the on-chain ActionExecuted receipt event to prove authorization and execution.
 * Confirms contract address, event signature, and optional expected mandate / target fields.
 */
export async function verifyReceipt(
  publicClient: PublicClient,
  contractAddress: Address,
  transactionHash: Hex,
  options?: VerifyReceiptOptions
): Promise<ExecutionReceiptVerification> {
  // 1. Network / Chain ID verification if expectedChainId provided
  if (options?.expectedChainId !== undefined) {
    try {
      const liveChainId = await publicClient.getChainId();
      if (liveChainId !== options.expectedChainId) {
        return {
          verified: false,
          status: 'wrong_network',
          transactionHash,
          blockNumber: 0n,
          revertReason: `Chain ID mismatch: RPC returned ${liveChainId}, expected ${options.expectedChainId}`,
        };
      }
    } catch (err: any) {
      return {
        verified: false,
        status: 'rpc_error',
        transactionHash,
        blockNumber: 0n,
        revertReason: `Failed to query chain ID: ${err.message || String(err)}`,
      };
    }
  }

  // 2. Query transaction receipt
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
      timeout: 5000,
    });
  } catch (err: any) {
    const errMsg = err.message || String(err);
    const isNotFound = /not found|could not find|timeout|unknown transaction/i.test(errMsg);
    return {
      verified: false,
      status: isNotFound ? 'not_found' : 'rpc_error',
      transactionHash,
      blockNumber: 0n,
      revertReason: isNotFound
        ? `Transaction receipt not found on chain: ${errMsg}`
        : `RPC communication error while querying receipt: ${errMsg}`,
    };
  }

  // 3. Check for reverted status
  if (receipt.status === 'reverted') {
    return {
      verified: false,
      status: 'reverted',
      transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      logs: receipt.logs,
      revertReason: 'Transaction reverted on-chain (contract policy rejected execution: no ActionExecuted event emitted)',
    };
  }

  const contractAddressLower = contractAddress.toLowerCase();

  // 4. Search logs strictly for ActionExecuted event emitted by MandateManager contract
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddressLower) continue;

    try {
      const decoded = decodeEventLog({
        abi: MandateManagerABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === 'ActionExecuted') {
        const { mandateId, target, selector, value, returnData } = decoded.args;

        // Verify optional expectations if provided
        if (options?.expectedMandateId !== undefined && mandateId !== options.expectedMandateId) {
          return {
            verified: false,
            status: 'success',
            mandateId,
            target,
            selector: selector as Hex,
            value,
            returnData,
            transactionHash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
            logs: receipt.logs,
            revertReason: `Receipt emitted for Mandate #${mandateId.toString()}, expected #${options.expectedMandateId.toString()}`,
          };
        }

        if (
          options?.expectedTarget !== undefined &&
          target.toLowerCase() !== options.expectedTarget.toLowerCase()
        ) {
          return {
            verified: false,
            status: 'success',
            mandateId,
            target,
            selector: selector as Hex,
            value,
            returnData,
            transactionHash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
            logs: receipt.logs,
            revertReason: `Receipt target ${target} does not match expected ${options.expectedTarget}`,
          };
        }

        if (
          options?.expectedSelector !== undefined &&
          (selector as Hex).toLowerCase() !== options.expectedSelector.toLowerCase()
        ) {
          return {
            verified: false,
            status: 'success',
            mandateId,
            target,
            selector: selector as Hex,
            value,
            returnData,
            transactionHash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
            logs: receipt.logs,
            revertReason: `Receipt selector ${selector} does not match expected ${options.expectedSelector}`,
          };
        }

        if (options?.expectedMaxValue !== undefined && value > options.expectedMaxValue) {
          return {
            verified: false,
            status: 'success',
            mandateId,
            target,
            selector: selector as Hex,
            value,
            returnData,
            transactionHash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
            logs: receipt.logs,
            revertReason: `Receipt transferred value ${value.toString()} exceeds expected maximum ${options.expectedMaxValue.toString()}`,
          };
        }

        if (options?.expectedValue !== undefined && value !== options.expectedValue) {
          return {
            verified: false,
            status: 'success',
            mandateId,
            target,
            selector: selector as Hex,
            value,
            returnData,
            transactionHash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed,
            logs: receipt.logs,
            revertReason: `Receipt transferred value ${value.toString()} does not match expected ${options.expectedValue.toString()}`,
          };
        }

        return {
          verified: true,
          status: 'success',
          mandateId,
          target,
          selector: selector as Hex,
          value,
          returnData,
          transactionHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          logs: receipt.logs,
        };
      }
    } catch {
      // Ignore logs that don't match ActionExecuted
    }
  }

  return {
    verified: false,
    status: 'success',
    transactionHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    logs: receipt.logs,
    revertReason: 'Transaction succeeded but no ActionExecuted event was emitted by MandateManager',
  };
}

/**
 * Independently verifies an agent ID against the on-chain ERC-8004 Trustless Agent Identity Registry.
 * Queries getAgentWallet(agentId) and ownerOf(agentId) to verify whether the agent's identity
 * binds to the mandate's designated agent execution address.
 */
export async function verifyAgentIdentity(
  publicClient: PublicClient,
  agentId: bigint,
  expectedAgentAddress: Address,
  registryAddress: Address = MONAD_TESTNET_ERC8004_REGISTRY
): Promise<AgentIdentityVerification> {
  const expectedLower = expectedAgentAddress.toLowerCase();
  let agentWallet: Address | undefined;
  let owner: Address | undefined;

  try {
    agentWallet = (await publicClient.readContract({
      address: registryAddress,
      abi: ERC8004_IDENTITY_REGISTRY_ABI,
      functionName: 'getAgentWallet',
      args: [agentId],
    })) as Address;
  } catch {
    // getAgentWallet might revert if agent is not registered
  }

  try {
    owner = (await publicClient.readContract({
      address: registryAddress,
      abi: ERC8004_IDENTITY_REGISTRY_ABI,
      functionName: 'ownerOf',
      args: [agentId],
    })) as Address;
  } catch {
    // ownerOf reverts if token does not exist
  }

  if (!agentWallet && !owner) {
    return {
      verified: false,
      agentId,
      registryAddress,
      error: `Agent #${agentId.toString()} is not registered in ERC-8004 registry at ${registryAddress}`,
    };
  }

  const isWalletMatch =
    agentWallet &&
    agentWallet.toLowerCase() === expectedLower &&
    agentWallet !== '0x0000000000000000000000000000000000000000';
  const isOwnerMatch = owner && owner.toLowerCase() === expectedLower;

  if (isWalletMatch || isOwnerMatch) {
    return {
      verified: true,
      agentId,
      registryAddress,
      agentWallet,
      owner,
    };
  }

  return {
    verified: false,
    agentId,
    registryAddress,
    agentWallet,
    owner,
    error: `ERC-8004 Agent #${agentId.toString()} wallet (${agentWallet || '0x0'}) / owner (${owner || '0x0'}) does not match expected agent address ${expectedAgentAddress}`,
  };
}

