// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IP256Verifier} from "./IP256Verifier.sol";
import {ReentrancyGuard} from "./lib/ReentrancyGuard.sol";

/// @title MandateManager
/// @notice Stores passkey-signed mandates and enforces on-chain permissions for AI agents.
///         The contract is the enforcement boundary; the frontend and SDK are convenience layers.
///
/// Design constraints (ponytail):
///   - No ERC-20 in MVP (shortcut: native value only, add token support after security path works)
///   - No upgradeability (shortcut: immutable for MVP, add proxy after audit)
///   - No off-chain indexer (shortcut: rely on events + direct state reads)
contract MandateManager is ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct Mandate {
        address owner;
        uint256 agentId;        // ERC-8004 registered agent identity
        uint256 maxValuePerTx;  // max native value per single execution (wei)
        uint256 maxTotalValue;  // cumulative cap (wei)
        uint256 spentValue;     // running total spent
        uint256 expiresAt;      // unix timestamp; 0 = no expiry
        uint256 nonce;          // creation nonce for replay protection
        bool revoked;
    }

    struct PasskeyCredential {
        bytes32 pubKeyX;  // P-256 public key x (big-endian)
        bytes32 pubKeyY;  // P-256 public key y (big-endian)
    }

    struct AllowedTarget {
        address target;
        bytes4  selector;   // bytes4(0) = any selector on that target
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Placeholder — confirm Monad's actual P256 precompile address from current docs
    address public constant P256_PRECOMPILE = address(0x0000000000000000000000000000000000000100);

    IP256Verifier public immutable verifier;

    uint256 public nextMandateId;

    /// mandateId → Mandate
    mapping(uint256 => Mandate) public mandates;

    /// mandateId → list of allowed (target, selector) pairs
    mapping(uint256 => AllowedTarget[]) public allowedTargets;

    /// owner → passkey credential used for mandate authorization
    mapping(address => PasskeyCredential) public credentials;

    /// owner → next expected nonce (replay protection for mandate creation)
    mapping(address => uint256) public ownerNonces;

    /// mandateId → per-action nonce to prevent execution replay
    mapping(uint256 => uint256) public executionNonces;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event CredentialRegistered(address indexed owner, bytes32 pubKeyX, bytes32 pubKeyY);
    event MandateCreated(
        uint256 indexed mandateId,
        address indexed owner,
        uint256 indexed agentId,
        uint256 expiresAt
    );
    event MandateRevoked(uint256 indexed mandateId, address indexed owner);
    event ActionExecuted(
        uint256 indexed mandateId,
        address indexed target,
        bytes4  selector,
        uint256 value,
        bytes   returnData
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error InvalidSignature();
    error MandateNotFound();
    error MandateIsRevoked();
    error MandateExpired();
    error UnauthorizedAgent();
    error TargetNotAllowed();
    error ExceedsPerTxLimit();
    error ExceedsTotalLimit();
    error ReplayDetected();
    error CallFailed();
    error NotOwner();
    error BadNonce();
    error NoCredential();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address _verifier) {
        // Allow test overrides; production should use P256_PRECOMPILE
        verifier = IP256Verifier(_verifier == address(0) ? P256_PRECOMPILE : _verifier);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Passkey registration
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Register or update the caller's P-256 public key.
    ///         Called once by the user during passkey setup. The key is used
    ///         to verify all future mandate authorizations from this owner.
    function registerCredential(bytes32 pubKeyX, bytes32 pubKeyY) external {
        credentials[msg.sender] = PasskeyCredential(pubKeyX, pubKeyY);
        emit CredentialRegistered(msg.sender, pubKeyX, pubKeyY);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mandate lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Create a new mandate. The owner must have a registered credential.
    ///         The WebAuthn signature must cover the canonical mandate hash.
    ///
    /// @param agentId        ERC-8004 agent identity token ID
    /// @param targets        Allowlisted (target, selector) pairs
    /// @param maxValuePerTx  Per-action native value cap
    /// @param maxTotalValue  Cumulative native value cap
    /// @param expiresAt      Expiry unix timestamp (0 = none)
    /// @param nonce          Must equal ownerNonces[msg.sender]; prevents replay
    /// @param sigR           WebAuthn signature r
    /// @param sigS           WebAuthn signature s
    /// @param challengeHash  sha-256(clientDataJSON) XOR'd with authenticatorData hash as
    ///                       produced by the frontend — see SDK for canonical construction
    function createMandate(
        uint256            agentId,
        AllowedTarget[]    calldata targets,
        uint256            maxValuePerTx,
        uint256            maxTotalValue,
        uint256            expiresAt,
        uint256            nonce,
        bytes32            sigR,
        bytes32            sigS,
        bytes32            challengeHash
    ) external returns (uint256 mandateId) {
        PasskeyCredential storage cred = credentials[msg.sender];
        if (cred.pubKeyX == 0 && cred.pubKeyY == 0) revert NoCredential();

        // Nonce check (owner-scoped, sequential)
        if (nonce != ownerNonces[msg.sender]) revert BadNonce();

        // The signed hash must commit to all mandate parameters AND chain context
        bytes32 expectedHash = _mandateHash(
            msg.sender, agentId, targets, maxValuePerTx, maxTotalValue, expiresAt, nonce
        );

        // The frontend hashes the WebAuthn clientData so that expectedHash == challengeHash
        // If they diverge, the signature was for a different mandate.
        if (expectedHash != challengeHash) revert InvalidSignature();

        if (!verifier.verify(challengeHash, sigR, sigS, cred.pubKeyX, cred.pubKeyY)) {
            revert InvalidSignature();
        }

        // Effects before any external interaction
        unchecked { ownerNonces[msg.sender]++; }

        mandateId = nextMandateId++;
        mandates[mandateId] = Mandate({
            owner:         msg.sender,
            agentId:       agentId,
            maxValuePerTx: maxValuePerTx,
            maxTotalValue: maxTotalValue,
            spentValue:    0,
            expiresAt:     expiresAt,
            nonce:         nonce,
            revoked:       false
        });

        for (uint256 i; i < targets.length; ) {
            allowedTargets[mandateId].push(targets[i]);
            unchecked { i++; }
        }

        emit MandateCreated(mandateId, msg.sender, agentId, expiresAt);
    }

    /// @notice Revoke a mandate. Only the owner can revoke.
    ///         Transactions already mined before this call are not reversed.
    function revokeMandate(uint256 mandateId) external {
        Mandate storage m = mandates[mandateId];
        if (m.owner == address(0)) revert MandateNotFound();
        if (m.owner != msg.sender) revert NotOwner();
        m.revoked = true;
        emit MandateRevoked(mandateId, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Execution
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Execute an action on behalf of the authorized agent.
    ///         Callable by anyone presenting a valid mandate; typically called by the agent or SDK.
    ///
    /// @param mandateId  Mandate to operate under
    /// @param agentId    Must match mandate.agentId
    /// @param target     Contract to call
    /// @param selector   Function selector to call
    /// @param callData   Full calldata (must start with selector)
    /// @param value      Native value to forward
    /// @param execNonce  Per-mandate sequential nonce; prevents execution replay
    function execute(
        uint256 mandateId,
        uint256 agentId,
        address target,
        bytes4  selector,
        bytes   calldata callData,
        uint256 value,
        uint256 execNonce
    ) external payable nonReentrant returns (bytes memory returnData) {
        Mandate storage m = mandates[mandateId];

        // ── Checks ────────────────────────────────────────────────────────────
        if (m.owner == address(0))   revert MandateNotFound();
        if (m.revoked)               revert MandateIsRevoked();
        if (m.expiresAt != 0 && block.timestamp > m.expiresAt) revert MandateExpired();
        if (m.agentId != agentId)    revert UnauthorizedAgent();

        // Replay protection
        if (execNonce != executionNonces[mandateId]) revert ReplayDetected();

        // Target + selector allowlist
        if (!_isAllowed(mandateId, target, selector)) revert TargetNotAllowed();

        // Spending limits
        if (value > m.maxValuePerTx) revert ExceedsPerTxLimit();
        uint256 newSpent = m.spentValue + value;
        if (newSpent > m.maxTotalValue) revert ExceedsTotalLimit();

        // Validate calldata starts with the approved selector
        if (callData.length < 4 || bytes4(callData[:4]) != selector) revert TargetNotAllowed();

        // ── Effects ───────────────────────────────────────────────────────────
        m.spentValue = newSpent;
        unchecked { executionNonces[mandateId]++; }

        // ── Interaction ───────────────────────────────────────────────────────
        bool ok;
        (ok, returnData) = target.call{value: value}(callData);
        if (!ok) {
            // Roll back accounting — the call failed, don't charge budget
            m.spentValue = newSpent - value;
            unchecked { executionNonces[mandateId]--; }
            revert CallFailed();
        }

        emit ActionExecuted(mandateId, target, selector, value, returnData);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function getMandate(uint256 mandateId) external view returns (Mandate memory) {
        return mandates[mandateId];
    }

    function getAllowedTargets(uint256 mandateId) external view returns (AllowedTarget[] memory) {
        return allowedTargets[mandateId];
    }

    function isActive(uint256 mandateId) external view returns (bool) {
        Mandate storage m = mandates[mandateId];
        return
            m.owner != address(0) &&
            !m.revoked &&
            (m.expiresAt == 0 || block.timestamp <= m.expiresAt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _isAllowed(uint256 mandateId, address target, bytes4 selector) internal view returns (bool) {
        AllowedTarget[] storage targets = allowedTargets[mandateId];
        for (uint256 i; i < targets.length; ) {
            AllowedTarget storage t = targets[i];
            if (t.target == target && (t.selector == bytes4(0) || t.selector == selector)) {
                return true;
            }
            unchecked { i++; }
        }
        return false;
    }

    /// @dev Canonical hash of mandate parameters bound to this chain + contract.
    ///      The frontend must construct the WebAuthn challenge from this hash so
    ///      the passkey signature is provably for this exact mandate.
    function _mandateHash(
        address owner,
        uint256 agentId,
        AllowedTarget[] calldata targets,
        uint256 maxValuePerTx,
        uint256 maxTotalValue,
        uint256 expiresAt,
        uint256 nonce
    ) internal view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("MandateManager.createMandate.v1"),
            block.chainid,
            address(this),
            owner,
            agentId,
            keccak256(abi.encode(targets)),
            maxValuePerTx,
            maxTotalValue,
            expiresAt,
            nonce
        ));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Receive ETH (so the contract can forward value to targets)
    // ─────────────────────────────────────────────────────────────────────────
    receive() external payable {}
}
