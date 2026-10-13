// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentMandates, IERC8004Identity} from "../src/AgentMandates.sol";
import {WebAuthnP256} from "../src/lib/WebAuthnP256.sol";
import {P256Verifier} from "./utils/P256Verifier.sol";
import {MockTarget} from "./MockTarget.sol";
import {MockERC20} from "./utils/MockERC20.sol";

/// @dev ERC-8004 Identity Registry stand-in: ownerOf reverts for unknown ids, like ERC-721.
contract MockIdentityRegistry is IERC8004Identity {
    mapping(uint256 => address) public owners;
    mapping(uint256 => address) public wallets;

    function set(uint256 agentId, address owner, address wallet) external {
        owners[agentId] = owner;
        wallets[agentId] = wallet;
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        require(owners[agentId] != address(0), "ERC721NonexistentToken");
        return owners[agentId];
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return wallets[agentId];
    }
}

contract AgentMandatesTest is Test {
    AgentMandates internal am;
    MockIdentityRegistry internal registry;
    MockTarget internal target;

    // Real P-256 keys; every signature in this file is a genuine ECDSA signature,
    // verified by a RIP-7212 implementation etched at Monad's precompile address.
    uint256 internal constant OWNER_PK = 0xA11CE5EC2E7;
    uint256 internal constant ATTACKER_PK = 0xBADBADBAD;
    bytes32 internal ownerX;
    bytes32 internal ownerY;
    bytes32 internal ownerKey;

    address internal agent = makeAddr("agent");
    address internal agentNftOwner = makeAddr("agentNftOwner");
    address internal relayer = makeAddr("relayer");
    address internal stranger = makeAddr("stranger");
    uint256 internal constant AGENT_ID = 7;

    uint256 internal constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    bytes32 internal constant RP_ID_HASH = sha256("agenttrust.vercel.app");
    uint8 internal constant FLAGS_UP_UV = 0x05;

    function setUp() public {
        vm.etch(address(0x100), address(new P256Verifier()).code);
        registry = new MockIdentityRegistry();
        registry.set(AGENT_ID, agentNftOwner, agent);
        am = new AgentMandates(address(registry), address(0));
        target = new MockTarget();

        (uint256 x, uint256 y) = vm.publicKeyP256(OWNER_PK);
        ownerX = bytes32(x);
        ownerY = bytes32(y);
        ownerKey = am.ownerKeyOf(ownerX, ownerY);

        vm.deal(relayer, 100 ether);
        vm.deal(stranger, 1 ether);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _terms() internal view returns (AgentMandates.MandateTerms memory t) {
        t.agent = agent;
        t.agentId = AGENT_ID;
        t.permissions = new AgentMandates.Permission[](1);
        t.permissions[0] = AgentMandates.Permission(address(target), MockTarget.doSomething.selector);
        t.maxPerCall = 1 ether;
        t.budget = 3 ether;
        t.expiresAt = uint64(block.timestamp + 1 days);
    }

    function _assert(uint256 pk, bytes32 challenge, uint8 flags, string memory typ)
        internal
        pure
        returns (WebAuthnP256.Assertion memory a)
    {
        a.authenticatorData = abi.encodePacked(RP_ID_HASH, flags, uint32(1));
        a.clientDataJSON = abi.encodePacked(
            '{"type":"', typ, '","challenge":"', WebAuthnP256.base64Url(challenge),
            '","origin":"https://agenttrust.vercel.app","crossOrigin":false}'
        );
        a.typeIndex = 1;
        a.challengeIndex = 11 + bytes(typ).length;
        bytes32 message = sha256(abi.encodePacked(a.authenticatorData, sha256(a.clientDataJSON)));
        (bytes32 r, bytes32 s) = vm.signP256(pk, message);
        if (uint256(s) > N / 2) s = bytes32(N - uint256(s));
        a.r = r;
        a.s = s;
    }

    function _sign(bytes32 challenge) internal pure returns (WebAuthnP256.Assertion memory) {
        return _assert(OWNER_PK, challenge, FLAGS_UP_UV, "webauthn.get");
    }

    function _passkey() internal view returns (AgentMandates.Passkey memory) {
        return AgentMandates.Passkey(ownerX, ownerY);
    }

    function _create(uint256 fund) internal returns (uint256 id) {
        AgentMandates.MandateTerms memory t = _terms();
        WebAuthnP256.Assertion memory a = _sign(am.createDigest(ownerKey, t, am.nonces(ownerKey)));
        vm.prank(relayer);
        id = am.createMandate{value: fund}(_passkey(), t, a);
    }

    function _call(uint256 arg) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(MockTarget.doSomething.selector, arg);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Creation: passkey is the owner, anyone can relay
    // ─────────────────────────────────────────────────────────────────────────

    function test_create_relayedWithRealPasskeySignature() public {
        uint256 id = _create(2 ether);
        AgentMandates.Mandate memory m = am.getMandate(id);
        assertEq(id, 1);
        assertEq(m.ownerKey, ownerKey);
        assertEq(m.agent, agent);
        assertEq(m.balance, 2 ether);
        assertEq(am.nonces(ownerKey), 1);
        (bytes32 x, bytes32 y) = am.passkeys(ownerKey);
        assertEq(x, ownerX);
        assertEq(y, ownerY);
        assertTrue(am.isActive(id));
    }

    function test_indexesByOwnerAndAgent() public {
        _create(0);
        _create(0);
        assertEq(am.mandatesOf(ownerKey).length, 2);
        assertEq(am.mandatesForAgent(agent)[1], 2);
        assertEq(am.mandatesForAgent(stranger).length, 0);
    }

    function test_create_wrongPasskey_reverts() public {
        AgentMandates.MandateTerms memory t = _terms();
        bytes32 d = am.createDigest(ownerKey, t, 0);
        WebAuthnP256.Assertion memory a = _assert(ATTACKER_PK, d, FLAGS_UP_UV, "webauthn.get");
        vm.expectRevert(AgentMandates.InvalidSignature.selector);
        am.createMandate(_passkey(), t, a);
    }

    function test_create_tamperedTerms_reverts() public {
        AgentMandates.MandateTerms memory t = _terms();
        WebAuthnP256.Assertion memory a = _sign(am.createDigest(ownerKey, t, 0));
        t.budget = 100 ether; // relayer tries to inflate the budget the human signed
        vm.expectRevert(AgentMandates.InvalidSignature.selector);
        am.createMandate(_passkey(), t, a);
    }

    function test_create_replay_reverts() public {
        AgentMandates.MandateTerms memory t = _terms();
        WebAuthnP256.Assertion memory a = _sign(am.createDigest(ownerKey, t, 0));
        am.createMandate(_passkey(), t, a);
        vm.expectRevert(AgentMandates.InvalidSignature.selector);
        am.createMandate(_passkey(), t, a);
    }

    function test_create_otherChain_reverts() public {
        AgentMandates.MandateTerms memory t = _terms();
        WebAuthnP256.Assertion memory a = _sign(am.createDigest(ownerKey, t, 0));
        vm.chainId(1);
        vm.expectRevert(AgentMandates.InvalidSignature.selector);
        am.createMandate(_passkey(), t, a);
    }

    function test_create_withoutUserVerification_reverts() public {
        AgentMandates.MandateTerms memory t = _terms();
        WebAuthnP256.Assertion memory a = _assert(OWNER_PK, am.createDigest(ownerKey, t, 0), 0x01, "webauthn.get");
        vm.expectRevert(AgentMandates.InvalidSignature.selector);
        am.createMandate(_passkey(), t, a);
    }

    function test_create_registrationCeremonyOutput_reverts() public {
        AgentMandates.MandateTerms memory t = _terms();
        WebAuthnP256.Assertion memory a =
            _assert(OWNER_PK, am.createDigest(ownerKey, t, 0), FLAGS_UP_UV, "webauthn.create");
        vm.expectRevert(AgentMandates.InvalidSignature.selector);
        am.createMandate(_passkey(), t, a);
    }

    function test_create_highS_reverts() public {
        AgentMandates.MandateTerms memory t = _terms();
        WebAuthnP256.Assertion memory a = _sign(am.createDigest(ownerKey, t, 0));
        a.s = bytes32(N - uint256(a.s)); // still a valid ECDSA signature, but malleated
        vm.expectRevert(AgentMandates.InvalidSignature.selector);
        am.createMandate(_passkey(), t, a);
    }

    function test_create_offCurveKey_reverts() public {
        AgentMandates.MandateTerms memory t = _terms();
        WebAuthnP256.Assertion memory a = _sign(am.createDigest(ownerKey, t, 0));
        vm.expectRevert(AgentMandates.InvalidPasskey.selector);
        am.createMandate(AgentMandates.Passkey(ownerX, bytes32(uint256(ownerY) ^ 1)), t, a);
    }

    function test_create_agentNotBoundInERC8004_reverts() public {
        AgentMandates.MandateTerms memory t = _terms();
        t.agent = stranger;
        WebAuthnP256.Assertion memory a = _sign(am.createDigest(ownerKey, t, 0));
        vm.expectRevert(AgentMandates.AgentIdentityMismatch.selector);
        am.createMandate(_passkey(), t, a);
    }

    function test_create_unknownAgentId_failsClosed() public {
        AgentMandates.MandateTerms memory t = _terms();
        t.agentId = 999;
        WebAuthnP256.Assertion memory a = _sign(am.createDigest(ownerKey, t, 0));
        vm.expectRevert(AgentMandates.AgentIdentityMismatch.selector);
        am.createMandate(_passkey(), t, a);
    }

    function test_create_agentNftOwnerAccepted() public {
        AgentMandates.MandateTerms memory t = _terms();
        t.agent = agentNftOwner;
        WebAuthnP256.Assertion memory a = _sign(am.createDigest(ownerKey, t, 0));
        uint256 id = am.createMandate(_passkey(), t, a);
        assertEq(am.getMandate(id).agent, agentNftOwner);
    }

    function test_create_invalidTerms_reverts() public {
        AgentMandates.MandateTerms memory t = _terms();
        t.maxPerCall = 5 ether; // > budget
        WebAuthnP256.Assertion memory a = _sign(am.createDigest(ownerKey, t, 0));
        vm.expectRevert(AgentMandates.InvalidTerms.selector);
        am.createMandate(_passkey(), t, a);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Execution
    // ─────────────────────────────────────────────────────────────────────────

    function test_execute_happy() public {
        uint256 id = _create(2 ether);
        vm.expectEmit(true, true, true, true);
        emit AgentMandates.ActionExecuted(
            id, agent, address(target), MockTarget.doSomething.selector, 0.5 ether, 0.5 ether, keccak256(_call(1))
        );
        vm.prank(agent);
        am.execute(id, address(target), _call(1), 0.5 ether);
        assertEq(address(target).balance, 0.5 ether);
        assertEq(am.getMandate(id).spent, 0.5 ether);
        assertEq(am.remainingBudget(id), 2.5 ether);
    }

    function test_execute_stranger_reverts() public {
        uint256 id = _create(2 ether);
        vm.prank(stranger);
        vm.expectRevert(AgentMandates.NotAgent.selector);
        am.execute(id, address(target), _call(1), 0);
    }

    function test_execute_wrongTarget_reverts() public {
        uint256 id = _create(2 ether);
        vm.prank(agent);
        vm.expectRevert(AgentMandates.PermissionDenied.selector);
        am.execute(id, stranger, _call(1), 0.1 ether);
    }

    function test_execute_wrongSelector_reverts() public {
        uint256 id = _create(2 ether);
        vm.prank(agent);
        vm.expectRevert(AgentMandates.PermissionDenied.selector);
        am.execute(id, address(target), abi.encodeWithSignature("drain()"), 0);
    }

    function test_execute_plainTransferNeedsWildcard() public {
        uint256 id = _create(2 ether);
        vm.prank(agent);
        vm.expectRevert(AgentMandates.PermissionDenied.selector);
        am.execute(id, address(target), "", 0.1 ether);
    }

    function test_execute_perCallLimit_reverts() public {
        uint256 id = _create(3 ether);
        vm.prank(agent);
        vm.expectRevert(AgentMandates.ExceedsPerCallLimit.selector);
        am.execute(id, address(target), _call(1), 1.5 ether);
    }

    function test_execute_budget_reverts() public {
        uint256 id = _create(5 ether);
        vm.startPrank(agent);
        am.execute(id, address(target), _call(1), 1 ether);
        am.execute(id, address(target), _call(2), 1 ether);
        am.execute(id, address(target), _call(3), 1 ether);
        vm.expectRevert(AgentMandates.ExceedsBudget.selector);
        am.execute(id, address(target), _call(4), 1);
        vm.stopPrank();
    }

    function test_execute_vaultIsolation_reverts() public {
        uint256 a = _create(0.2 ether);
        _create(5 ether); // a second mandate with plenty of funds
        vm.prank(agent);
        vm.expectRevert(AgentMandates.InsufficientBalance.selector);
        am.execute(a, address(target), _call(1), 0.5 ether);
    }

    function test_execute_expired_reverts() public {
        uint256 id = _create(1 ether);
        vm.warp(block.timestamp + 2 days);
        vm.prank(agent);
        vm.expectRevert(AgentMandates.MandateInactive.selector);
        am.execute(id, address(target), _call(1), 0);
    }

    function test_execute_agentWalletRotatedInERC8004_reverts() public {
        uint256 id = _create(1 ether);
        // The agent's operator rotates its ERC-8004 wallet; the old wallet loses authority immediately.
        registry.set(AGENT_ID, agentNftOwner, makeAddr("newWallet"));
        vm.prank(agent);
        vm.expectRevert(AgentMandates.AgentIdentityMismatch.selector);
        am.execute(id, address(target), _call(1), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner controls: revoke, revoke-all, withdraw (all passkey-signed, relayed)
    // ─────────────────────────────────────────────────────────────────────────

    function test_revoke_relayed() public {
        uint256 id = _create(1 ether);
        WebAuthnP256.Assertion memory a = _sign(am.revokeDigest(ownerKey, id, am.nonces(ownerKey)));
        vm.prank(relayer);
        am.revoke(id, a);
        assertFalse(am.isActive(id));
        vm.prank(agent);
        vm.expectRevert(AgentMandates.MandateInactive.selector);
        am.execute(id, address(target), _call(1), 0);
    }

    function test_revoke_wrongKey_reverts() public {
        uint256 id = _create(1 ether);
        WebAuthnP256.Assertion memory a =
            _assert(ATTACKER_PK, am.revokeDigest(ownerKey, id, 1), FLAGS_UP_UV, "webauthn.get");
        vm.expectRevert(AgentMandates.InvalidSignature.selector);
        am.revoke(id, a);
    }

    function test_revokeAll_killsEveryMandate() public {
        uint256 a = _create(1 ether);
        uint256 b = _create(1 ether);
        WebAuthnP256.Assertion memory sig = _sign(am.revokeAllDigest(ownerKey, am.nonces(ownerKey)));
        am.revokeAll(ownerKey, sig);
        assertFalse(am.isActive(a));
        assertFalse(am.isActive(b));
        // New mandates issued after the panic button work normally.
        uint256 c = _create(1 ether);
        assertTrue(am.isActive(c));
    }

    function test_withdraw_toRecipient() public {
        uint256 id = _create(2 ether);
        address payable to = payable(makeAddr("cold"));
        WebAuthnP256.Assertion memory a = _sign(am.withdrawDigest(ownerKey, id, to, 1.5 ether, am.nonces(ownerKey)));
        vm.prank(relayer);
        am.withdraw(id, to, 1.5 ether, a);
        assertEq(to.balance, 1.5 ether);
        assertEq(am.getMandate(id).balance, 0.5 ether);
    }

    function test_withdraw_relayerCannotRedirect() public {
        uint256 id = _create(2 ether);
        address payable to = payable(makeAddr("cold"));
        WebAuthnP256.Assertion memory a = _sign(am.withdrawDigest(ownerKey, id, to, 1 ether, am.nonces(ownerKey)));
        vm.prank(relayer);
        vm.expectRevert(AgentMandates.InvalidSignature.selector);
        am.withdraw(id, payable(relayer), 1 ether, a);
    }

    function test_deposit_anyone() public {
        uint256 id = _create(0);
        vm.prank(stranger);
        am.deposit{value: 0.5 ether}(id);
        assertEq(am.getMandate(id).balance, 0.5 ether);
    }

    function test_receive_reverts() public {
        vm.prank(stranger);
        (bool ok,) = address(am).call{value: 1}("");
        assertFalse(ok);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC-20 budgets
    // ─────────────────────────────────────────────────────────────────────────

    address internal payee = makeAddr("apiMerchant");

    function _createWithToken(MockERC20 token, uint256 deposit) internal returns (uint256 id) {
        AgentMandates.MandateTerms memory t = _terms();
        t.permissions = new AgentMandates.Permission[](2);
        t.permissions[0] = AgentMandates.Permission(address(target), MockTarget.doSomething.selector);
        t.permissions[1] = AgentMandates.Permission(payee, bytes4(0));
        t.tokenLimits = new AgentMandates.TokenLimit[](1);
        t.tokenLimits[0] = AgentMandates.TokenLimit(address(token), 10e6, 25e6); // 10 USDC per call, 25 total
        WebAuthnP256.Assertion memory a = _sign(am.createDigest(ownerKey, t, am.nonces(ownerKey)));
        id = am.createMandate(_passkey(), t, a);
        token.mint(relayer, deposit);
        vm.startPrank(relayer);
        token.approve(address(am), deposit);
        am.depositToken(id, address(token), deposit);
        vm.stopPrank();
    }

    function test_token_payWithinLimits() public {
        MockERC20 usdc = new MockERC20();
        uint256 id = _createWithToken(usdc, 100e6);
        vm.prank(agent);
        am.payToken(id, address(usdc), payee, 10e6);
        assertEq(usdc.balanceOf(payee), 10e6);
        AgentMandates.TokenAllowance memory ta = am.getTokenAllowance(id, address(usdc));
        assertEq(ta.spent, 10e6);
        assertEq(ta.balance, 90e6);
    }

    function test_token_limitsEnforced() public {
        MockERC20 usdc = new MockERC20();
        uint256 id = _createWithToken(usdc, 100e6);
        vm.startPrank(agent);
        vm.expectRevert(AgentMandates.ExceedsPerCallLimit.selector);
        am.payToken(id, address(usdc), payee, 11e6);
        vm.expectRevert(AgentMandates.PermissionDenied.selector);
        am.payToken(id, address(usdc), stranger, 1e6);
        am.payToken(id, address(usdc), payee, 10e6);
        am.payToken(id, address(usdc), payee, 10e6);
        vm.expectRevert(AgentMandates.ExceedsBudget.selector);
        am.payToken(id, address(usdc), payee, 6e6);
        vm.stopPrank();
        vm.prank(stranger);
        vm.expectRevert(AgentMandates.NotAgent.selector);
        am.payToken(id, address(usdc), payee, 1e6);
    }

    function test_token_unlistedTokenRejected() public {
        MockERC20 usdc = new MockERC20();
        MockERC20 other = new MockERC20();
        uint256 id = _createWithToken(usdc, 10e6);
        other.mint(relayer, 1e6);
        vm.startPrank(relayer);
        other.approve(address(am), 1e6);
        vm.expectRevert(AgentMandates.TokenNotAllowed.selector);
        am.depositToken(id, address(other), 1e6);
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(AgentMandates.TokenNotAllowed.selector);
        am.payToken(id, address(other), payee, 1);
    }

    function test_token_executeCannotTouchVaultToken() public {
        MockERC20 usdc = new MockERC20();
        // Mandate B tries to drain pooled USDC via a generic call permission on the token itself.
        AgentMandates.MandateTerms memory t = _terms();
        t.permissions[0] = AgentMandates.Permission(address(usdc), bytes4(0));
        uint256 b = am.createMandate(_passkey(), t, _sign(am.createDigest(ownerKey, t, am.nonces(ownerKey))));
        _createWithToken(usdc, 50e6);
        vm.prank(agent);
        vm.expectRevert(AgentMandates.TargetIsVaultToken.selector);
        am.execute(b, address(usdc), abi.encodeWithSignature("transfer(address,uint256)", agent, 50e6), 0);
    }

    function test_token_noReturnTokenAndWithdraw() public {
        MockERC20 usdt = new MockERC20();
        usdt.setNoReturn(true);
        uint256 id = _createWithToken(usdt, 30e6);
        vm.prank(agent);
        am.payToken(id, address(usdt), payee, 5e6);
        address cold = makeAddr("cold");
        WebAuthnP256.Assertion memory a =
            _sign(am.withdrawTokenDigest(ownerKey, id, address(usdt), cold, 25e6, am.nonces(ownerKey)));
        vm.prank(relayer);
        am.withdrawToken(id, address(usdt), cold, 25e6, a);
        assertEq(usdt.balanceOf(cold), 25e6);
        assertEq(am.getTokenAllowance(id, address(usdt)).balance, 0);
    }

    function test_token_revokeStopsPayments() public {
        MockERC20 usdc = new MockERC20();
        uint256 id = _createWithToken(usdc, 30e6);
        am.revoke(id, _sign(am.revokeDigest(ownerKey, id, am.nonces(ownerKey))));
        (bool ok, bytes4 why) = am.checkPayment(id, agent, address(usdc), payee, 1e6);
        assertFalse(ok);
        assertEq(why, AgentMandates.MandateInactive.selector);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Composable view
    // ─────────────────────────────────────────────────────────────────────────

    function test_checkAction_reasons() public {
        uint256 id = _create(2 ether);
        (bool ok, bytes4 why) = am.checkAction(id, agent, address(target), _call(1), 0.5 ether);
        assertTrue(ok);
        assertEq(why, bytes4(0));

        (ok, why) = am.checkAction(id, stranger, address(target), _call(1), 0);
        assertEq(why, AgentMandates.NotAgent.selector);
        (ok, why) = am.checkAction(id, agent, address(target), _call(1), 2 ether);
        assertEq(why, AgentMandates.ExceedsPerCallLimit.selector);
        (ok, why) = am.checkAction(99, agent, address(target), _call(1), 0);
        assertEq(why, AgentMandates.MandateNotFound.selector);
        assertFalse(ok);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz: the agent can never spend more than the signed budget
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_spendNeverExceedsBudget(uint96[8] memory amounts) public {
        uint256 id = _create(10 ether);
        for (uint256 i; i < amounts.length; ++i) {
            uint256 v = uint256(amounts[i]) % 1.2 ether;
            vm.prank(agent);
            try am.execute(id, address(target), _call(i), v) {} catch {}
        }
        AgentMandates.Mandate memory m = am.getMandate(id);
        assertLe(m.spent, m.budget);
        assertEq(m.balance + m.spent, 10 ether);
    }
}
