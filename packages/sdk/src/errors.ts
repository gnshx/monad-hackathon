export class AgentTrustError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentTrustError';
  }
}

export class MandateNotFoundError extends AgentTrustError {
  constructor(mandateId: bigint) {
    super(`Mandate with ID ${mandateId.toString()} does not exist.`);
    this.name = 'MandateNotFoundError';
  }
}

export class MandateRevokedError extends AgentTrustError {
  constructor(mandateId: bigint) {
    super(`Mandate with ID ${mandateId.toString()} has been revoked by its owner.`);
    this.name = 'MandateRevokedError';
  }
}

export class MandateExpiredError extends AgentTrustError {
  constructor(mandateId: bigint, expiresAt: bigint, currentTime: bigint) {
    super(
      `Mandate ${mandateId.toString()} expired at unix timestamp ${expiresAt.toString()} (current: ${currentTime.toString()}).`
    );
    this.name = 'MandateExpiredError';
  }
}

export class UnauthorizedAgentError extends AgentTrustError {
  constructor(mandateId: bigint, expectedAgentId: bigint, providedAgentId: bigint) {
    super(
      `Agent ID ${providedAgentId.toString()} is not authorized for Mandate ${mandateId.toString()} (expected: ${expectedAgentId.toString()}).`
    );
    this.name = 'UnauthorizedAgentError';
  }
}

export class TargetNotAllowedError extends AgentTrustError {
  constructor(target: string, selector: string) {
    super(`Target ${target} with selector ${selector} is not on the mandate allowlist.`);
    this.name = 'TargetNotAllowedError';
  }
}

export class LimitExceededError extends AgentTrustError {
  constructor(reason: 'per_action' | 'total', attempted: bigint, limit: bigint) {
    super(
      `Spending limit exceeded (${reason}): attempted ${attempted.toString()} wei, limit is ${limit.toString()} wei.`
    );
    this.name = 'LimitExceededError';
  }
}

export class ReplayDetectedError extends AgentTrustError {
  constructor(mandateId: bigint, nonce: bigint) {
    super(`Execution replay detected on Mandate ${mandateId.toString()} for nonce ${nonce.toString()}.`);
    this.name = 'ReplayDetectedError';
  }
}

export class ExecutionFailedError extends AgentTrustError {
  constructor(message: string, public readonly revertData?: string) {
    super(message);
    this.name = 'ExecutionFailedError';
  }
}
