// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WebAuthnP256} from "./lib/WebAuthnP256.sol";
import {ReentrancyGuard} from "./lib/ReentrancyGuard.sol";

interface IERC20Minimal {
    function balanceOf(address) external view returns (uint256);
}

/// @notice Canonical ERC-8004 Identity Registry surface used for agent binding.
interface IERC8004Identity {
    function ownerOf(uint256 agentId) external view returns (address);
    function getAgentWallet(uint256 agentId) external view returns (address);
}

/// @title AgentMandates
/// @notice Passkey-owned spending mandates for AI agents.
///
///         The owner of a mandate is a passkey (P-256 public key), not a wallet. Every owner
///         action (create, revoke, revoke-all, withdraw) is a WebAuthn assertion verified with
///         Monad's P-256 precompile at 0x0100, so anyone can relay it and the human never needs
///         gas, a seed phrase or a browser wallet. The agent is an ERC-8004 identity, re-checked
///         on every call. Execution is bounded by a (target, selector) allowlist, a per-call cap,
///         a lifetime budget and an expiry, all enforced here and nowhere else. ERC-20 spending
///         (e.g. stablecoin payments) gets its own per-token caps and an isolated token vault.
contract AgentMandates is ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct Passkey {
        bytes32 x;
        bytes32 y;
    }

    struct Permission {
        address target;
        bytes4 selector; // bytes4(0) = any selector on target, including plain value transfers
    }

    struct Mandate {
        bytes32 ownerKey;   // keccak256(x, y) of the owner's passkey
        address agent;      // wallet allowed to call execute()
        uint256 agentId;    // ERC-8004 agent identity (0 when no registry is configured)
        uint256 maxPerCall; // max native value per execute()
        uint256 budget;     // lifetime native value cap
        uint256 spent;      // native value spent so far
        uint256 balance;    // isolated vault for this mandate
        uint64 expiresAt;   // unix seconds; 0 = never
        uint64 epoch;       // owner epoch at creation; revokeAll() bumps the owner's epoch
        bool revoked;
    }

    struct TokenLimit {
        address token;
        uint256 maxPerCall;
        uint256 budget;
    }

    struct TokenAllowance {
        uint256 maxPerCall;
        uint256 budget;
        uint256 spent;
        uint256 balance;
        bool enabled;
    }

    struct MandateTerms {
        address agent;
        uint256 agentId;
        Permission[] permissions; // a (payee, bytes4(0)) entry also allows token payments to payee
        uint256 maxPerCall;
        uint256 budget;
        uint64 expiresAt;
        TokenLimit[] tokenLimits;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constants & state
    // ─────────────────────────────────────────────────────────────────────────

    bytes32 public constant CREATE_TYPEHASH = keccak256("AgentMandates.Create.v1");
    bytes32 public constant REVOKE_TYPEHASH = keccak256("AgentMandates.Revoke.v1");
    bytes32 public constant REVOKE_ALL_TYPEHASH = keccak256("AgentMandates.RevokeAll.v1");
    bytes32 public constant WITHDRAW_TYPEHASH = keccak256("AgentMandates.Withdraw.v1");
    bytes32 public constant WITHDRAW_TOKEN_TYPEHASH = keccak256("AgentMandates.WithdrawToken.v1");

    uint256 public constant MAX_PERMISSIONS = 16;
    uint256 public constant MAX_TOKENS = 8;

    /// @notice ERC-8004 Identity Registry. address(0) disables identity binding (local dev only).
    IERC8004Identity public immutable identityRegistry;

    /// @notice P-256 verifier. address(0x100) is Monad's native precompile.
    address public immutable p256Verifier;

    uint256 public mandateCount;

    mapping(uint256 => Mandate) internal _mandates;
    mapping(uint256 => Permission[]) internal _permissions;

    /// ownerKey → passkey coordinates (recorded the first time a passkey signs)
    mapping(bytes32 => Passkey) public passkeys;
    /// ownerKey → next nonce for owner-signed actions
    mapping(bytes32 => uint256) public nonces;
    /// ownerKey → current epoch; mandates from older epochs are dead
    mapping(bytes32 => uint64) public epochs;
    /// ownerKey → mandate ids it created; agent → mandate ids it can act under
    mapping(bytes32 => uint256[]) internal _byOwner;
    mapping(address => uint256[]) internal _byAgent;
    /// mandateId → token → allowance and isolated token vault
    mapping(uint256 => mapping(address => TokenAllowance)) internal _tokens;
    mapping(uint256 => address[]) internal _tokenList;
    /// Tokens this contract custodies. execute() may never call them, so no mandate can move
    /// pooled tokens through a generic call; token spending goes through payToken() only.
    mapping(address => bool) public isVaultToken;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event PasskeyRegistered(bytes32 indexed ownerKey, bytes32 x, bytes32 y);
    event MandateCreated(
        uint256 indexed mandateId,
        bytes32 indexed ownerKey,
        address indexed agent,
        uint256 agentId,
        uint256 maxPerCall,
        uint256 budget,
        uint64 expiresAt
    );
    event MandateRevoked(uint256 indexed mandateId, bytes32 indexed ownerKey);
    event AllMandatesRevoked(bytes32 indexed ownerKey, uint64 newEpoch);
    event Deposited(uint256 indexed mandateId, address indexed from, uint256 amount);
    event Withdrawn(uint256 indexed mandateId, address indexed to, uint256 amount);
    event TokenDeposited(uint256 indexed mandateId, address indexed token, address indexed from, uint256 amount);
    event TokenPaid(uint256 indexed mandateId, address indexed token, address indexed to, uint256 amount, uint256 spent);
    event TokenWithdrawn(uint256 indexed mandateId, address indexed token, address indexed to, uint256 amount);
    event ActionExecuted(
        uint256 indexed mandateId,
        address indexed agent,
        address indexed target,
        bytes4 selector,
        uint256 value,
        uint256 spent,
        bytes32 callDataHash
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error InvalidPasskey();
    error InvalidSignature();
    error PasskeyMismatch();
    error MandateNotFound();
    error MandateInactive();
    error NotAgent();
    error AgentIdentityMismatch();
    error PermissionDenied();
    error ExceedsPerCallLimit();
    error ExceedsBudget();
    error InsufficientBalance();
    error InvalidTerms();
    error CallFailed(bytes returnData);
    error TransferFailed();
    error TokenNotAllowed();
    error TargetIsVaultToken();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address _identityRegistry, address _p256Verifier) {
        identityRegistry = IERC8004Identity(_identityRegistry);
        p256Verifier = _p256Verifier == address(0) ? WebAuthnP256.PRECOMPILE : _p256Verifier;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner actions (passkey-signed, relayable by anyone)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Create a mandate authorized by a WebAuthn assertion from `passkey`.
    ///         msg.value funds the mandate vault, so a sponsor can pay for the owner.
    function createMandate(
        Passkey calldata passkey,
        MandateTerms calldata terms,
        WebAuthnP256.Assertion calldata auth
    ) external payable returns (uint256 mandateId) {
        if (terms.agent == address(0)) revert InvalidTerms();
        if (terms.permissions.length == 0 || terms.permissions.length > MAX_PERMISSIONS) revert InvalidTerms();
        if (terms.maxPerCall > terms.budget) revert InvalidTerms();
        if (terms.expiresAt != 0 && terms.expiresAt <= block.timestamp) revert InvalidTerms();
        if (terms.tokenLimits.length > MAX_TOKENS) revert InvalidTerms();

        bytes32 ownerKey = _registerPasskey(passkey);
        _checkAgentIdentity(terms.agent, terms.agentId);

        bytes32 digest = createDigest(ownerKey, terms, nonces[ownerKey]);
        _verifyOwner(ownerKey, digest, auth);

        mandateId = ++mandateCount;
        _mandates[mandateId] = Mandate({
            ownerKey: ownerKey,
            agent: terms.agent,
            agentId: terms.agentId,
            maxPerCall: terms.maxPerCall,
            budget: terms.budget,
            spent: 0,
            balance: msg.value,
            expiresAt: terms.expiresAt,
            epoch: epochs[ownerKey],
            revoked: false
        });
        for (uint256 i; i < terms.permissions.length; ++i) {
            _permissions[mandateId].push(terms.permissions[i]);
        }
        _byOwner[ownerKey].push(mandateId);
        _byAgent[terms.agent].push(mandateId);
        for (uint256 i; i < terms.tokenLimits.length; ++i) {
            TokenLimit calldata tl = terms.tokenLimits[i];
            if (tl.token == address(0) || tl.maxPerCall > tl.budget) revert InvalidTerms();
            TokenAllowance storage ta = _tokens[mandateId][tl.token];
            if (ta.enabled) revert InvalidTerms(); // duplicate token
            ta.maxPerCall = tl.maxPerCall;
            ta.budget = tl.budget;
            ta.enabled = true;
            _tokenList[mandateId].push(tl.token);
        }

        emit MandateCreated(
            mandateId, ownerKey, terms.agent, terms.agentId, terms.maxPerCall, terms.budget, terms.expiresAt
        );
        if (msg.value > 0) emit Deposited(mandateId, msg.sender, msg.value);
    }

    /// @notice Revoke one mandate. Signed by the owner's passkey, relayable by anyone.
    function revoke(uint256 mandateId, WebAuthnP256.Assertion calldata auth) external {
        Mandate storage m = _existing(mandateId);
        bytes32 ownerKey = m.ownerKey;
        _verifyOwner(ownerKey, revokeDigest(ownerKey, mandateId, nonces[ownerKey]), auth);
        m.revoked = true;
        emit MandateRevoked(mandateId, ownerKey);
    }

    /// @notice Emergency stop: kill every mandate this passkey has ever issued, in one tap.
    function revokeAll(bytes32 ownerKey, WebAuthnP256.Assertion calldata auth) external {
        if (passkeys[ownerKey].x == 0) revert InvalidPasskey();
        _verifyOwner(ownerKey, revokeAllDigest(ownerKey, nonces[ownerKey]), auth);
        uint64 newEpoch = ++epochs[ownerKey];
        emit AllMandatesRevoked(ownerKey, newEpoch);
    }

    /// @notice Move vault funds to `to`. Signed by the owner's passkey, relayable by anyone.
    function withdraw(uint256 mandateId, address payable to, uint256 amount, WebAuthnP256.Assertion calldata auth)
        external
        nonReentrant
    {
        Mandate storage m = _existing(mandateId);
        bytes32 ownerKey = m.ownerKey;
        _verifyOwner(ownerKey, withdrawDigest(ownerKey, mandateId, to, amount, nonces[ownerKey]), auth);
        if (amount > m.balance) revert InsufficientBalance();

        m.balance -= amount;
        emit Withdrawn(mandateId, to, amount);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Anyone can top up a mandate's vault.
    function deposit(uint256 mandateId) external payable {
        Mandate storage m = _existing(mandateId);
        m.balance += msg.value;
        emit Deposited(mandateId, msg.sender, msg.value);
    }

    /// @notice Fund a mandate's token vault. Only tokens the owner signed a limit for are accepted.
    ///         Credits the amount actually received, so fee-on-transfer tokens are accounted correctly.
    function depositToken(uint256 mandateId, address token, uint256 amount) external nonReentrant {
        _existing(mandateId);
        TokenAllowance storage ta = _tokens[mandateId][token];
        if (!ta.enabled) revert TokenNotAllowed();
        isVaultToken[token] = true;
        uint256 before = IERC20Minimal(token).balanceOf(address(this));
        _callToken(token, abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), amount)); // transferFrom
        uint256 received = IERC20Minimal(token).balanceOf(address(this)) - before;
        ta.balance += received;
        emit TokenDeposited(mandateId, token, msg.sender, received);
    }

    /// @notice Move token vault funds to `to`. Signed by the owner's passkey, relayable by anyone.
    function withdrawToken(
        uint256 mandateId,
        address token,
        address to,
        uint256 amount,
        WebAuthnP256.Assertion calldata auth
    ) external nonReentrant {
        Mandate storage m = _existing(mandateId);
        bytes32 ownerKey = m.ownerKey;
        _verifyOwner(ownerKey, withdrawTokenDigest(ownerKey, mandateId, token, to, amount, nonces[ownerKey]), auth);
        TokenAllowance storage ta = _tokens[mandateId][token];
        if (amount > ta.balance) revert InsufficientBalance();
        ta.balance -= amount;
        emit TokenWithdrawn(mandateId, token, to, amount);
        _callToken(token, abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Agent execution
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Execute a call on behalf of the mandate owner. Only the mandate's agent wallet can
    ///         call this, and only within the signed permissions and limits.
    function execute(uint256 mandateId, address target, bytes calldata data, uint256 value)
        external
        nonReentrant
        returns (bytes memory result)
    {
        Mandate storage m = _existing(mandateId);
        if (msg.sender != m.agent) revert NotAgent();
        if (isVaultToken[target]) revert TargetIsVaultToken();

        bytes4 reason = _check(mandateId, m, target, data, value);
        if (reason != bytes4(0)) _revertWith(reason);

        m.balance -= value;
        m.spent += value;

        bool ok;
        (ok, result) = target.call{value: value}(data);
        if (!ok) revert CallFailed(result);

        emit ActionExecuted(mandateId, msg.sender, target, _selectorOf(data), value, m.spent, keccak256(data));
    }

    /// @notice Pay `amount` of `token` from the mandate's token vault to an allowlisted payee.
    function payToken(uint256 mandateId, address token, address to, uint256 amount) external nonReentrant {
        Mandate storage m = _existing(mandateId);
        if (msg.sender != m.agent) revert NotAgent();
        bytes4 reason = _checkPayment(mandateId, m, token, to, amount);
        if (reason != bytes4(0)) _revertWith(reason);

        TokenAllowance storage ta = _tokens[mandateId][token];
        ta.balance -= amount;
        ta.spent += amount;
        emit TokenPaid(mandateId, token, to, amount, ta.spent);
        _callToken(token, abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Composable views
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Would `agent` be allowed to run this call right now? Returns the error selector
    ///         execute() would revert with, or bytes4(0) when the call is allowed. Other contracts,
    ///         relayers and off-chain services use this to verify an agent's authority.
    function checkAction(uint256 mandateId, address agent, address target, bytes calldata data, uint256 value)
        external
        view
        returns (bool allowed, bytes4 reason)
    {
        Mandate storage m = _mandates[mandateId];
        if (m.ownerKey == 0) return (false, MandateNotFound.selector);
        if (agent != m.agent) return (false, NotAgent.selector);
        reason = _check(mandateId, m, target, data, value);
        allowed = reason == bytes4(0);
    }

    /// @notice Token-payment counterpart of checkAction().
    function checkPayment(uint256 mandateId, address agent, address token, address to, uint256 amount)
        external
        view
        returns (bool allowed, bytes4 reason)
    {
        Mandate storage m = _mandates[mandateId];
        if (m.ownerKey == 0) return (false, MandateNotFound.selector);
        if (agent != m.agent) return (false, NotAgent.selector);
        reason = _checkPayment(mandateId, m, token, to, amount);
        allowed = reason == bytes4(0);
    }

    function getTokenAllowance(uint256 mandateId, address token) external view returns (TokenAllowance memory) {
        return _tokens[mandateId][token];
    }

    function getTokens(uint256 mandateId) external view returns (address[] memory) {
        return _tokenList[mandateId];
    }

    function isActive(uint256 mandateId) public view returns (bool) {
        Mandate storage m = _mandates[mandateId];
        return m.ownerKey != 0 && _isLive(m);
    }

    function getMandate(uint256 mandateId) external view returns (Mandate memory) {
        return _mandates[mandateId];
    }

    function getPermissions(uint256 mandateId) external view returns (Permission[] memory) {
        return _permissions[mandateId];
    }

    function mandatesOf(bytes32 ownerKey) external view returns (uint256[] memory) {
        return _byOwner[ownerKey];
    }

    function mandatesForAgent(address agent) external view returns (uint256[] memory) {
        return _byAgent[agent];
    }

    function remainingBudget(uint256 mandateId) external view returns (uint256) {
        Mandate storage m = _mandates[mandateId];
        return m.budget - m.spent;
    }

    function ownerKeyOf(bytes32 x, bytes32 y) public pure returns (bytes32) {
        return keccak256(abi.encode(x, y));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Digests (what the passkey signs, as the WebAuthn challenge)
    // ─────────────────────────────────────────────────────────────────────────

    function createDigest(bytes32 ownerKey, MandateTerms calldata terms, uint256 nonce) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                CREATE_TYPEHASH,
                block.chainid,
                address(this),
                ownerKey,
                terms.agent,
                terms.agentId,
                keccak256(abi.encode(terms.permissions)),
                terms.maxPerCall,
                terms.budget,
                terms.expiresAt,
                keccak256(abi.encode(terms.tokenLimits)),
                nonce
            )
        );
    }

    function revokeDigest(bytes32 ownerKey, uint256 mandateId, uint256 nonce) public view returns (bytes32) {
        return keccak256(abi.encode(REVOKE_TYPEHASH, block.chainid, address(this), ownerKey, mandateId, nonce));
    }

    function revokeAllDigest(bytes32 ownerKey, uint256 nonce) public view returns (bytes32) {
        return keccak256(abi.encode(REVOKE_ALL_TYPEHASH, block.chainid, address(this), ownerKey, nonce));
    }

    function withdrawDigest(bytes32 ownerKey, uint256 mandateId, address to, uint256 amount, uint256 nonce)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(WITHDRAW_TYPEHASH, block.chainid, address(this), ownerKey, mandateId, to, amount, nonce)
        );
    }

    function withdrawTokenDigest(
        bytes32 ownerKey,
        uint256 mandateId,
        address token,
        address to,
        uint256 amount,
        uint256 nonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                WITHDRAW_TOKEN_TYPEHASH, block.chainid, address(this), ownerKey, mandateId, token, to, amount, nonce
            )
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────────

    function _check(uint256 mandateId, Mandate storage m, address target, bytes calldata data, uint256 value)
        internal
        view
        returns (bytes4)
    {
        if (!_isLive(m)) return MandateInactive.selector;
        if (!_agentIdentityHolds(m.agent, m.agentId)) return AgentIdentityMismatch.selector;
        if (!_isPermitted(mandateId, target, _selectorOf(data))) return PermissionDenied.selector;
        if (value > m.maxPerCall) return ExceedsPerCallLimit.selector;
        if (m.spent + value > m.budget) return ExceedsBudget.selector;
        if (value > m.balance) return InsufficientBalance.selector;
        return bytes4(0);
    }

    function _checkPayment(uint256 mandateId, Mandate storage m, address token, address to, uint256 amount)
        internal
        view
        returns (bytes4)
    {
        if (!_isLive(m)) return MandateInactive.selector;
        if (!_agentIdentityHolds(m.agent, m.agentId)) return AgentIdentityMismatch.selector;
        TokenAllowance storage ta = _tokens[mandateId][token];
        if (!ta.enabled) return TokenNotAllowed.selector;
        if (!_isPermitted(mandateId, to, bytes4(0))) return PermissionDenied.selector;
        if (amount > ta.maxPerCall) return ExceedsPerCallLimit.selector;
        if (ta.spent + amount > ta.budget) return ExceedsBudget.selector;
        if (amount > ta.balance) return InsufficientBalance.selector;
        return bytes4(0);
    }

    /// @dev ERC-20 call that tolerates tokens returning nothing, and rejects false or non-contracts.
    function _callToken(address token, bytes memory data) internal {
        if (token.code.length == 0) revert TransferFailed();
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _isLive(Mandate storage m) internal view returns (bool) {
        return !m.revoked && m.epoch == epochs[m.ownerKey] && (m.expiresAt == 0 || block.timestamp <= m.expiresAt);
    }

    function _isPermitted(uint256 mandateId, address target, bytes4 selector) internal view returns (bool) {
        Permission[] storage ps = _permissions[mandateId];
        for (uint256 i; i < ps.length; ++i) {
            if (ps[i].target == target && (ps[i].selector == bytes4(0) || ps[i].selector == selector)) return true;
        }
        return false;
    }

    function _selectorOf(bytes calldata data) internal pure returns (bytes4) {
        return data.length >= 4 ? bytes4(data[:4]) : bytes4(0);
    }

    function _registerPasskey(Passkey calldata pk) internal returns (bytes32 ownerKey) {
        if (!WebAuthnP256.isValidPublicKey(pk.x, pk.y)) revert InvalidPasskey();
        ownerKey = ownerKeyOf(pk.x, pk.y);
        if (passkeys[ownerKey].x == 0) {
            passkeys[ownerKey] = pk;
            emit PasskeyRegistered(ownerKey, pk.x, pk.y);
        }
    }

    function _verifyOwner(bytes32 ownerKey, bytes32 digest, WebAuthnP256.Assertion calldata auth) internal {
        Passkey storage pk = passkeys[ownerKey];
        if (!WebAuthnP256.verify(p256Verifier, digest, auth, pk.x, pk.y)) revert InvalidSignature();
        unchecked {
            ++nonces[ownerKey];
        }
    }

    function _checkAgentIdentity(address agent, uint256 agentId) internal view {
        if (!_agentIdentityHolds(agent, agentId)) revert AgentIdentityMismatch();
    }

    /// @dev The agent wallet must be the ERC-8004 agent's registered wallet or its owner.
    ///      Fails closed if the registry reverts (unknown agentId) or returns nothing.
    function _agentIdentityHolds(address agent, uint256 agentId) internal view returns (bool) {
        if (address(identityRegistry) == address(0)) return true;
        try identityRegistry.getAgentWallet(agentId) returns (address wallet) {
            if (wallet != address(0) && wallet == agent) return true;
        } catch {}
        try identityRegistry.ownerOf(agentId) returns (address owner) {
            return owner != address(0) && owner == agent;
        } catch {
            return false;
        }
    }

    function _existing(uint256 mandateId) internal view returns (Mandate storage m) {
        m = _mandates[mandateId];
        if (m.ownerKey == 0) revert MandateNotFound();
    }

    function _revertWith(bytes4 selector) internal pure {
        assembly {
            mstore(0, selector)
            revert(0, 4)
        }
    }

    receive() external payable {
        revert("use deposit(mandateId)");
    }
}
