// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IP256Verifier} from "./IP256Verifier.sol";
import {IERC8004Registry} from "./IERC8004Registry.sol";
import {ReentrancyGuard} from "./lib/ReentrancyGuard.sol";

/// @title MandateManager
/// @notice Stores passkey-signed mandates and enforces on-chain permissions for AI agents on Monad.
///         The smart contract—not the AI agent, frontend, SDK, or backend—is the strict enforcement boundary.
contract MandateManager is ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct Mandate {
        address owner;
        address agentAddress;   // Designated wallet address authorized to execute on this mandate
        uint256 agentId;        // ERC-8004 registered agent identity
        uint256 maxValuePerTx;  // Max native value per single execution (wei)
        uint256 maxTotalValue;  // Cumulative cap (wei)
        uint256 spentValue;     // Running total spent
        uint256 expiresAt;      // Unix timestamp; 0 = no expiry
        uint256 nonce;          // Creation nonce for replay protection
        bool revoked;
    }

    struct PasskeyCredential {
        bytes32 pubKeyX;  // P-256 public key x (big-endian)
        bytes32 pubKeyY;  // P-256 public key y (big-endian)
    }

    struct AllowedTarget {
        address target;
        bytes4  selector;   // bytes4(0) = any selector or pure transfer on that target
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev RIP-7212 P256 verification precompile address on Monad and supported EVM rollups
    address public constant P256_PRECOMPILE = address(0x0000000000000000000000000000000000000100);

    IP256Verifier public immutable verifier;
    IERC8004Registry public immutable agentRegistry;

    uint256 public nextMandateId;

    /// mandateId → Mandate
    mapping(uint256 => Mandate) public mandates;

    /// mandateId → isolated native token balance vault
    mapping(uint256 => uint256) public mandateBalances;

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
        address indexed agentAddress,
        uint256 agentId,
        uint256 expiresAt
    );
    event MandateRevoked(uint256 indexed mandateId, address indexed owner);
    event FundsDeposited(uint256 indexed mandateId, address indexed depositor, uint256 amount);
    event FundsWithdrawn(uint256 indexed mandateId, address indexed recipient, uint256 amount);
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
    error MandateStillActive();
    error UnauthorizedAgent();
    error InvalidAgentAddress();
    error TargetNotAllowed();
    error ExceedsPerTxLimit();
    error ExceedsTotalLimit();
    error InsufficientMandateBalance();
    error NoFundsToWithdraw();
    error TransferFailed();
    error ReplayDetected();
    error CallFailed();
    error NotOwner();
    error BadNonce();
    error NoCredential();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address _verifier, address _agentRegistry) {
        verifier = IP256Verifier(_verifier == address(0) ? P256_PRECOMPILE : _verifier);
        agentRegistry = IERC8004Registry(_agentRegistry);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Passkey registration
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Register or update the caller's P-256 public key.
    function registerCredential(bytes32 pubKeyX, bytes32 pubKeyY) external {
        uint256 P256_P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF;
        if (pubKeyX == 0 || pubKeyY == 0 || uint256(pubKeyX) >= P256_P || uint256(pubKeyY) >= P256_P) {
            revert InvalidSignature();
        }
        credentials[msg.sender] = PasskeyCredential(pubKeyX, pubKeyY);
        emit CredentialRegistered(msg.sender, pubKeyX, pubKeyY);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mandate creation & funding
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Create a new mandate authorized with a raw P-256 signature.
    ///         The owner can optionally fund the mandate by attaching msg.value.
    function createMandate(
        address            agentAddress,
        uint256            agentId,
        AllowedTarget[]    calldata targets,
        uint256            maxValuePerTx,
        uint256            maxTotalValue,
        uint256            expiresAt,
        uint256            nonce,
        bytes32            sigR,
        bytes32            sigS,
        bytes32            challengeHash
    ) external payable returns (uint256 mandateId) {
        PasskeyCredential storage cred = credentials[msg.sender];
        if (cred.pubKeyX == 0 && cred.pubKeyY == 0) revert NoCredential();
        if (agentAddress == address(0)) revert InvalidAgentAddress();
        if (nonce != ownerNonces[msg.sender]) revert BadNonce();

        // Validate agent identity against ERC-8004 if configured
        _validateAgentIdentity(agentAddress, agentId);

        // Verify that the signed challengeHash matches canonical parameters
        bytes32 expectedHash = _mandateHash(
            msg.sender, agentAddress, agentId, targets, maxValuePerTx, maxTotalValue, expiresAt, nonce
        );
        if (expectedHash != challengeHash) revert InvalidSignature();

        _checkSignatureBounds(sigR, sigS);

        if (!_verifyP256(challengeHash, sigR, sigS, cred.pubKeyX, cred.pubKeyY)) {
            revert InvalidSignature();
        }

        unchecked { ownerNonces[msg.sender]++; }

        mandateId = nextMandateId++;
        mandates[mandateId] = Mandate({
            owner:         msg.sender,
            agentAddress:  agentAddress,
            agentId:       agentId,
            maxValuePerTx: maxValuePerTx,
            maxTotalValue: maxTotalValue,
            spentValue:    0,
            expiresAt:     expiresAt,
            nonce:         nonce,
            revoked:       false
        });

        if (msg.value > 0) {
            mandateBalances[mandateId] += msg.value;
            emit FundsDeposited(mandateId, msg.sender, msg.value);
        }

        for (uint256 i = 0; i < targets.length; ) {
            allowedTargets[mandateId].push(targets[i]);
            unchecked { i++; }
        }

        emit MandateCreated(mandateId, msg.sender, agentAddress, agentId, expiresAt);
    }

    /// @notice Create a new mandate authorized with a genuine WebAuthn assertion envelope.
    ///         Verifies clientDataJSON contains base64url(expectedHash) at challengeOffset,
    ///         checks authenticatorData user presence, computes sha256(authData || sha256(clientDataJSON)),
    ///         and validates the P-256 signature.
    function createMandateWithWebAuthn(
        address            agentAddress,
        uint256            agentId,
        AllowedTarget[]    calldata targets,
        uint256            maxValuePerTx,
        uint256            maxTotalValue,
        uint256            expiresAt,
        uint256            nonce,
        bytes32            sigR,
        bytes32            sigS,
        bytes              calldata authenticatorData,
        bytes              calldata clientDataJSON,
        uint256            challengeOffset
    ) external payable returns (uint256 mandateId) {
        PasskeyCredential storage cred = credentials[msg.sender];
        if (cred.pubKeyX == 0 && cred.pubKeyY == 0) revert NoCredential();
        if (agentAddress == address(0)) revert InvalidAgentAddress();
        if (nonce != ownerNonces[msg.sender]) revert BadNonce();

        _validateAgentIdentity(agentAddress, agentId);

        // Malleability & signature bounds check
        _checkSignatureBounds(sigR, sigS);

        // Authenticator data check (min 37 bytes, User Presence flag set)
        if (authenticatorData.length < 37 || (uint8(authenticatorData[32]) & 0x01) == 0) {
            revert InvalidSignature();
        }

        // Canonical mandate hash
        bytes32 expectedHash = _mandateHash(
            msg.sender, agentAddress, agentId, targets, maxValuePerTx, maxTotalValue, expiresAt, nonce
        );

        // WebAuthn challenge binding: clientDataJSON must contain base64url(expectedHash)
        if (!_verifyClientDataChallenge(clientDataJSON, challengeOffset, expectedHash)) {
            revert InvalidSignature();
        }

        // In WebAuthn, message = authenticatorData || sha256(clientDataJSON)
        bytes32 clientDataHash = sha256(clientDataJSON);
        bytes32 signedMessageHash = sha256(abi.encodePacked(authenticatorData, clientDataHash));

        if (!_verifyP256(signedMessageHash, sigR, sigS, cred.pubKeyX, cred.pubKeyY)) {
            revert InvalidSignature();
        }

        unchecked { ownerNonces[msg.sender]++; }

        mandateId = nextMandateId++;
        mandates[mandateId] = Mandate({
            owner:         msg.sender,
            agentAddress:  agentAddress,
            agentId:       agentId,
            maxValuePerTx: maxValuePerTx,
            maxTotalValue: maxTotalValue,
            spentValue:    0,
            expiresAt:     expiresAt,
            nonce:         nonce,
            revoked:       false
        });

        if (msg.value > 0) {
            mandateBalances[mandateId] += msg.value;
            emit FundsDeposited(mandateId, msg.sender, msg.value);
        }

        for (uint256 i = 0; i < targets.length; ) {
            allowedTargets[mandateId].push(targets[i]);
            unchecked { i++; }
        }

        emit MandateCreated(mandateId, msg.sender, agentAddress, agentId, expiresAt);
    }

    /// @notice Deposit native tokens directly into an isolated mandate's vault.
    function deposit(uint256 mandateId) external payable {
        if (mandates[mandateId].owner == address(0)) revert MandateNotFound();
        mandateBalances[mandateId] += msg.value;
        emit FundsDeposited(mandateId, msg.sender, msg.value);
    }

    /// @notice Revoke a mandate. Only the owner can revoke.
    function revokeMandate(uint256 mandateId) external {
        Mandate storage m = mandates[mandateId];
        if (m.owner == address(0)) revert MandateNotFound();
        if (m.owner != msg.sender) revert NotOwner();
        m.revoked = true;
        emit MandateRevoked(mandateId, msg.sender);
    }

    /// @notice Withdraw unspent funds from a revoked or expired mandate.
    function withdrawUnspent(uint256 mandateId) external nonReentrant {
        Mandate storage m = mandates[mandateId];
        if (m.owner == address(0)) revert MandateNotFound();
        if (m.owner != msg.sender) revert NotOwner();
        
        bool isInactive = m.revoked || (m.expiresAt != 0 && block.timestamp > m.expiresAt);
        if (!isInactive) revert MandateStillActive();

        uint256 unspent = mandateBalances[mandateId];
        if (unspent == 0) revert NoFundsToWithdraw();

        mandateBalances[mandateId] = 0;
        emit FundsWithdrawn(mandateId, m.owner, unspent);

        (bool ok, ) = m.owner.call{value: unspent}("");
        if (!ok) revert TransferFailed();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Execution
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Execute an action on behalf of the authorized agent.
    ///         Strict caller authentication: only designated agentAddress or owner can call.
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
        
        // Strict caller authentication:
        if (msg.sender != m.agentAddress && msg.sender != m.owner) revert UnauthorizedAgent();
        if (m.agentId != agentId)    revert UnauthorizedAgent();

        // Replay protection
        if (execNonce != executionNonces[mandateId]) revert ReplayDetected();

        // Target + selector allowlist
        if (!_isAllowed(mandateId, target, selector)) revert TargetNotAllowed();

        // Spending limits
        if (value > m.maxValuePerTx) revert ExceedsPerTxLimit();
        uint256 newSpent = m.spentValue + value;
        if (newSpent > m.maxTotalValue) revert ExceedsTotalLimit();

        // Calldata validation:
        if (selector != bytes4(0)) {
            if (callData.length < 4 || bytes4(callData[:4]) != selector) revert TargetNotAllowed();
        }

        // Vault balance isolation check:
        uint256 available = mandateBalances[mandateId] + msg.value;
        if (available < value) revert InsufficientMandateBalance();

        // ── Effects ───────────────────────────────────────────────────────────
        mandateBalances[mandateId] = available - value;
        m.spentValue = newSpent;
        unchecked { executionNonces[mandateId]++; }

        // ── Interaction ───────────────────────────────────────────────────────
        bool ok;
        (ok, returnData) = target.call{value: value}(callData);
        if (!ok) {
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

    /// @dev Raw RIP-7212 P256 precompile staticcall (160 bytes) or mock fallback
    function _verifyP256(
        bytes32 hash,
        bytes32 r,
        bytes32 s,
        bytes32 x,
        bytes32 y
    ) internal view returns (bool) {
        if (address(verifier) == P256_PRECOMPILE) {
            bytes memory input = abi.encodePacked(hash, r, s, x, y); // exactly 160 bytes
            (bool ok, bytes memory ret) = P256_PRECOMPILE.staticcall(input);
            if (!ok || ret.length != 32) return false;
            bytes32 retWord = abi.decode(ret, (bytes32));
            return uint256(retWord) == 1;
        } else {
            return verifier.verify(hash, r, s, x, y);
        }
    }

    function _validateAgentIdentity(address agentAddress, uint256 agentId) internal view {
        if (address(agentRegistry) != address(0)) {
            address registryOwner = agentRegistry.ownerOf(agentId);
            address registryOp = agentRegistry.getAgentOperator(agentId);
            if (agentAddress != registryOwner && agentAddress != registryOp) {
                revert UnauthorizedAgent();
            }
        }
    }

    function _isAllowed(uint256 mandateId, address target, bytes4 selector) internal view returns (bool) {
        AllowedTarget[] storage targets = allowedTargets[mandateId];
        for (uint256 i = 0; i < targets.length; ) {
            AllowedTarget storage t = targets[i];
            if (t.target == target && (t.selector == bytes4(0) || t.selector == selector)) {
                return true;
            }
            unchecked { i++; }
        }
        return false;
    }

    /// @notice Compute the canonical hash for a mandate definition.
    function computeMandateHash(
        address owner,
        address agentAddress,
        uint256 agentId,
        AllowedTarget[] calldata targets,
        uint256 maxValuePerTx,
        uint256 maxTotalValue,
        uint256 expiresAt,
        uint256 nonce
    ) external view returns (bytes32) {
        return _mandateHash(
            owner,
            agentAddress,
            agentId,
            targets,
            maxValuePerTx,
            maxTotalValue,
            expiresAt,
            nonce
        );
    }

    function _mandateHash(
        address owner,
        address agentAddress,
        uint256 agentId,
        AllowedTarget[] calldata targets,
        uint256 maxValuePerTx,
        uint256 maxTotalValue,
        uint256 expiresAt,
        uint256 nonce
    ) internal view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("MandateManager.createMandate.v2"),
            block.chainid,
            address(this),
            owner,
            agentAddress,
            agentId,
            keccak256(abi.encode(targets)),
            maxValuePerTx,
            maxTotalValue,
            expiresAt,
            nonce
        ));
    }

    uint256 internal constant P256_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    uint256 internal constant P256_N_DIV_2 = 0x7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCE4279DCB5617E3192A8;

    function _checkSignatureBounds(bytes32 r, bytes32 s) internal pure {
        uint256 rInt = uint256(r);
        uint256 sInt = uint256(s);
        if (rInt == 0 || rInt >= P256_N || sInt == 0 || sInt > P256_N_DIV_2) {
            revert InvalidSignature();
        }
    }

    function _toBase64Url32(bytes32 data) internal pure returns (bytes memory result) {
        bytes memory TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        result = new bytes(43);
        uint256 charIdx = 0;

        for (uint256 i = 0; i < 30; i += 3) {
            uint256 b0 = uint8(data[i]);
            uint256 b1 = uint8(data[i + 1]);
            uint256 b2 = uint8(data[i + 2]);

            result[charIdx++] = TABLE[(b0 >> 2) & 0x3F];
            result[charIdx++] = TABLE[((b0 & 0x03) << 4) | ((b1 >> 4) & 0x0F)];
            result[charIdx++] = TABLE[((b1 & 0x0F) << 2) | ((b2 >> 6) & 0x03)];
            result[charIdx++] = TABLE[b2 & 0x3F];
        }

        uint256 b30 = uint8(data[30]);
        uint256 b31 = uint8(data[31]);
        result[charIdx++] = TABLE[(b30 >> 2) & 0x3F];
        result[charIdx++] = TABLE[((b30 & 0x03) << 4) | ((b31 >> 4) & 0x0F)];
        result[charIdx++] = TABLE[(b31 & 0x0F) << 2];
    }

    function _verifyClientDataChallenge(
        bytes calldata clientDataJSON,
        uint256 challengeOffset,
        bytes32 expectedHash
    ) internal pure returns (bool) {
        if (challengeOffset < 13 || clientDataJSON.length < challengeOffset + 44) {
            return false;
        }

        bytes memory prefix = '"challenge":"';
        for (uint256 i = 0; i < 13; ) {
            if (clientDataJSON[challengeOffset - 13 + i] != prefix[i]) {
                return false;
            }
            unchecked { i++; }
        }

        bytes memory expectedB64 = _toBase64Url32(expectedHash);
        for (uint256 i = 0; i < 43; ) {
            if (clientDataJSON[challengeOffset + i] != expectedB64[i]) {
                return false;
            }
            unchecked { i++; }
        }

        if (clientDataJSON[challengeOffset + 43] != '"') {
            return false;
        }

        return true;
    }

    // Direct deposits not tied to a mandate are rejected to prevent uncredited funds
    receive() external payable {
        revert("Use deposit(mandateId) to credit a specific mandate");
    }
}
