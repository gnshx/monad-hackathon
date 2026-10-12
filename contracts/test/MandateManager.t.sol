// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {MandateManager} from "../src/MandateManager.sol";
import {MockP256Verifier} from "./MockP256Verifier.sol";
import {MockERC8004Registry} from "./MockERC8004Registry.sol";
import {MockTarget} from "./MockTarget.sol";

contract MandateManagerTest is Test {
    MandateManager       internal mm;
    MockP256Verifier     internal verifier;
    MockERC8004Registry  internal registry;
    MockTarget           internal target;

    address internal owner  = address(0xA11CE);
    address internal agent  = address(0xB0B);
    uint256 internal agentId = 42;

    bytes32 internal constant PUB_X = bytes32(uint256(1));
    bytes32 internal constant PUB_Y = bytes32(uint256(2));
    bytes32 internal constant VALID_R = bytes32(uint256(1));
    bytes32 internal constant VALID_S = bytes32(uint256(1));

    uint256 internal constant MAX_PER_TX = 1 ether;
    uint256 internal constant MAX_TOTAL  = 5 ether;
    uint256 internal constant EXPIRES_NEVER = 0;

    function setUp() public {
        verifier = new MockP256Verifier();
        registry = new MockERC8004Registry();
        
        // Register agent in mock ERC-8004 registry
        registry.setAgent(agentId, owner, agent);

        mm = new MandateManager(address(verifier), address(registry));
        target = new MockTarget();

        // Register passkey for owner
        vm.prank(owner);
        mm.registerCredential(PUB_X, PUB_Y);

        vm.deal(owner, 100 ether);
        vm.deal(agent, 10 ether);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _defaultTargets() internal view returns (MandateManager.AllowedTarget[] memory) {
        MandateManager.AllowedTarget[] memory ts = new MandateManager.AllowedTarget[](1);
        ts[0] = MandateManager.AllowedTarget({
            target:   address(target),
            selector: MockTarget.doSomething.selector
        });
        return ts;
    }

    function _createMandate(uint256 expiresAt, uint256 fundAmount) internal returns (uint256 mandateId) {
        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();

        bytes32 h = keccak256(abi.encode(
            keccak256("MandateManager.createMandate.v2"),
            block.chainid,
            address(mm),
            owner,
            agent,
            agentId,
            keccak256(abi.encode(ts)),
            MAX_PER_TX,
            MAX_TOTAL,
            expiresAt,
            uint256(0) // nonce
        ));

        vm.prank(owner);
        mandateId = mm.createMandate{value: fundAmount}(
            agent,
            agentId,
            ts,
            MAX_PER_TX,
            MAX_TOTAL,
            expiresAt,
            0,
            VALID_R,
            VALID_S,
            h
        );
    }

    function _execCalldata(uint256 arg) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(MockTarget.doSomething.selector, arg);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Credential Registration Tests
    // ─────────────────────────────────────────────────────────────────────────

    function test_registerCredential() public {
        (bytes32 x, bytes32 y) = mm.credentials(owner);
        assertEq(x, PUB_X);
        assertEq(y, PUB_Y);
    }

    function test_registerCredential_zeroKey_reverts() public {
        vm.prank(owner);
        vm.expectRevert(MandateManager.InvalidSignature.selector);
        mm.registerCredential(bytes32(0), PUB_Y);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mandate Creation Tests
    // ─────────────────────────────────────────────────────────────────────────

    function test_createMandate_happy() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 2 ether);
        MandateManager.Mandate memory m = mm.getMandate(id);

        assertEq(m.owner, owner);
        assertEq(m.agentAddress, agent);
        assertEq(m.agentId, agentId);
        assertEq(m.maxValuePerTx, MAX_PER_TX);
        assertEq(m.maxTotalValue, MAX_TOTAL);
        assertEq(m.spentValue, 0);
        assertEq(m.expiresAt, EXPIRES_NEVER);
        assertEq(m.revoked, false);
        assertEq(mm.mandateBalances(id), 2 ether);
        assertTrue(mm.isActive(id));
    }

    function test_createMandate_invalidAgentAddress_reverts() public {
        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();

        vm.prank(owner);
        vm.expectRevert(MandateManager.InvalidAgentAddress.selector);
        mm.createMandate(
            address(0), agentId, ts, MAX_PER_TX, MAX_TOTAL, 0, 0,
            bytes32(0), bytes32(0), bytes32(0)
        );
    }

    function test_createMandate_erc8004_mismatch_reverts() public {
        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();
        address fakeAgent = address(0xFAFA);

        vm.prank(owner);
        vm.expectRevert(MandateManager.UnauthorizedAgent.selector);
        mm.createMandate(
            fakeAgent, agentId, ts, MAX_PER_TX, MAX_TOTAL, 0, 0,
            bytes32(0), bytes32(0), bytes32(0)
        );
    }

    function test_createMandate_badNonce_reverts() public {
        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();

        vm.prank(owner);
        vm.expectRevert(MandateManager.BadNonce.selector);
        mm.createMandate(
            agent, agentId, ts, MAX_PER_TX, MAX_TOTAL, 0,
            999, // Bad nonce
            bytes32(0), bytes32(0), bytes32(0)
        );
    }

    function test_createMandate_invalidSig_reverts() public {
        verifier.setResult(false); // Verifier rejects
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();

        bytes32 h = keccak256(abi.encode(
            keccak256("MandateManager.createMandate.v2"),
            block.chainid, address(mm), owner, agent, agentId,
            keccak256(abi.encode(ts)), MAX_PER_TX, MAX_TOTAL, 0, uint256(0)
        ));

        vm.prank(owner);
        vm.expectRevert(MandateManager.InvalidSignature.selector);
        mm.createMandate(
            agent, agentId, ts, MAX_PER_TX, MAX_TOTAL, 0, 0,
            VALID_R, VALID_S, h
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Execution & Authorization Tests
    // ─────────────────────────────────────────────────────────────────────────

    function test_execute_happy() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 2 ether);

        vm.prank(agent);
        bytes memory ret = mm.execute(
            id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(99), 0, 0
        );

        assertEq(abi.decode(ret, (uint256)), 1);
        assertEq(target.callCount(), 1);
        assertEq(mm.executionNonces(id), 1);
    }

    function test_execute_unauthorizedCaller_stranger_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 2 ether);
        address stranger = address(0xDEAD);

        vm.prank(stranger);
        vm.expectRevert(MandateManager.UnauthorizedAgent.selector);
        mm.execute(
            id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 0, 0
        );
    }

    function test_execute_wrongAgentId_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 2 ether);

        vm.prank(agent);
        vm.expectRevert(MandateManager.UnauthorizedAgent.selector);
        mm.execute(
            id, 9999, address(target), MockTarget.doSomething.selector, _execCalldata(1), 0, 0
        );
    }

    function test_execute_unauthorizedTarget_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 2 ether);
        address rogueTarget = address(0x666);

        vm.prank(agent);
        vm.expectRevert(MandateManager.TargetNotAllowed.selector);
        mm.execute(
            id, agentId, rogueTarget, MockTarget.doSomething.selector, _execCalldata(1), 0, 0
        );
    }

    function test_execute_unauthorizedSelector_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 2 ether);

        vm.prank(agent);
        vm.expectRevert(MandateManager.TargetNotAllowed.selector);
        mm.execute(
            id, agentId, address(target), bytes4(0xdeadbeef), hex"deadbeef", 0, 0
        );
    }

    function test_execute_exceedsPerTxLimit_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 5 ether);

        vm.prank(agent);
        vm.expectRevert(MandateManager.ExceedsPerTxLimit.selector);
        mm.execute(
            id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1),
            MAX_PER_TX + 1, // Exceeds per tx
            0
        );
    }

    function test_execute_replayNonce_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 2 ether);

        vm.prank(agent);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 0, 0);

        vm.prank(agent);
        vm.expectRevert(MandateManager.ReplayDetected.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 0, 0);
    }

    function test_execute_expired_reverts() public {
        uint256 id = _createMandate(block.timestamp + 100, 2 ether);

        vm.warp(block.timestamp + 101);

        vm.prank(agent);
        vm.expectRevert(MandateManager.MandateExpired.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 0, 0);
    }

    function test_execute_revoked_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 2 ether);

        vm.prank(owner);
        mm.revokeMandate(id);

        vm.prank(agent);
        vm.expectRevert(MandateManager.MandateIsRevoked.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 0, 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Vault Isolation & Fund Safety Tests
    // ─────────────────────────────────────────────────────────────────────────

    function test_vault_insufficientBalance_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 0.5 ether);

        // Trying to spend 1 ether when only 0.5 ether is in vault
        vm.prank(agent);
        vm.expectRevert(MandateManager.InsufficientMandateBalance.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 1 ether, 0);
    }

    function test_vault_isolation_preventsCrossMandateTheft() public {
        // Alice funds Mandate 1 with 10 ether
        uint256 aliceMandate = _createMandate(EXPIRES_NEVER, 10 ether);

        // Bob creates Mandate 2 with 0 ether
        address bob = address(0xB00B);
        address bobAgent = address(0xBA9E);
        uint256 bobAgentId = 99;
        registry.setAgent(bobAgentId, bob, bobAgent);
        vm.prank(bob);
        mm.registerCredential(PUB_X, PUB_Y);

        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();
        bytes32 hBob = keccak256(abi.encode(
            keccak256("MandateManager.createMandate.v2"),
            block.chainid, address(mm), bob, bobAgent, bobAgentId,
            keccak256(abi.encode(ts)), MAX_PER_TX, MAX_TOTAL, 0, uint256(0)
        ));

        vm.prank(bob);
        uint256 bobMandate = mm.createMandate{value: 0}(
            bobAgent, bobAgentId, ts, MAX_PER_TX, MAX_TOTAL, 0, 0,
            VALID_R, VALID_S, hBob
        );

        // Bob's agent attempts to execute with 1 ether value
        // Even though contract holds Alice's 10 ether, Bob's vault has 0 ether!
        vm.prank(bobAgent);
        vm.expectRevert(MandateManager.InsufficientMandateBalance.selector);
        mm.execute(bobMandate, bobAgentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 1 ether, 0);

        // Verify Alice's 10 ether is completely intact!
        assertEq(mm.mandateBalances(aliceMandate), 10 ether);
    }

    function test_withdrawUnspent_afterRevoke_happy() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 3 ether);
        assertEq(mm.mandateBalances(id), 3 ether);

        vm.prank(owner);
        mm.revokeMandate(id);

        uint256 balBefore = owner.balance;
        vm.prank(owner);
        mm.withdrawUnspent(id);
        uint256 balAfter = owner.balance;

        assertEq(balAfter - balBefore, 3 ether);
        assertEq(mm.mandateBalances(id), 0);
    }

    function test_withdrawUnspent_activeMandate_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 3 ether);

        vm.prank(owner);
        vm.expectRevert(MandateManager.MandateStillActive.selector);
        mm.withdrawUnspent(id);
    }

    function test_withdrawUnspent_nonOwner_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 3 ether);
        vm.prank(owner);
        mm.revokeMandate(id);

        vm.prank(address(0xDEAD));
        vm.expectRevert(MandateManager.NotOwner.selector);
        mm.withdrawUnspent(id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz Testing
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_spendingCap(uint256 spend) public {
        spend = bound(spend, MAX_PER_TX + 1, 10 ether);

        uint256 id = _createMandate(EXPIRES_NEVER, 10 ether);

        vm.prank(agent);
        vm.expectRevert(MandateManager.ExceedsPerTxLimit.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), spend, 0);
    }

    function testFuzz_totalCapExceeded() public {
        uint256 id = _createMandate(EXPIRES_NEVER, 10 ether);

        // Spend 5 times 1 ether to reach MAX_TOTAL (5 ether)
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(agent);
            mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 1 ether, i);
        }

        // 6th execution must revert with ExceedsTotalLimit
        vm.prank(agent);
        vm.expectRevert(MandateManager.ExceedsTotalLimit.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 1, 5);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WebAuthn & Cryptographic Security Regression Tests
    // ─────────────────────────────────────────────────────────────────────────

    function _b64url(bytes32 data) internal pure returns (bytes memory result) {
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

    function test_createMandateWithWebAuthn_happy() public {
        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();

        bytes32 h = keccak256(abi.encode(
            keccak256("MandateManager.createMandate.v2"),
            block.chainid, address(mm), owner, agent, agentId,
            keccak256(abi.encode(ts)), MAX_PER_TX, MAX_TOTAL, 0, uint256(0)
        ));

        bytes memory b64Challenge = _b64url(h);
        bytes memory clientDataJSON = abi.encodePacked(
            '{"type":"webauthn.get","challenge":"',
            b64Challenge,
            '","origin":"http://localhost:3000"}'
        );
        uint256 challengeOffset = 36; // index of first char of b64Challenge

        bytes memory authData = abi.encodePacked(bytes32("mock_rp_id"), uint8(0x01), uint32(1));

        vm.prank(owner);
        uint256 id = mm.createMandateWithWebAuthn(
            agent, agentId, ts, MAX_PER_TX, MAX_TOTAL, 0, 0,
            VALID_R, VALID_S,
            authData,
            clientDataJSON,
            challengeOffset
        );

        assertEq(id, 0);
        assertTrue(mm.isActive(0));
    }

    function test_createMandateWithWebAuthn_wrongChallenge_reverts() public {
        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();

        // Deliberately provide a clientDataJSON containing a forged challenge
        bytes memory fakeB64 = _b64url(keccak256("forged_challenge"));
        bytes memory clientDataJSON = abi.encodePacked(
            '{"type":"webauthn.get","challenge":"',
            fakeB64,
            '","origin":"http://localhost:3000"}'
        );
        uint256 challengeOffset = 36;
        bytes memory authData = abi.encodePacked(bytes32("mock_rp_id"), uint8(0x01), uint32(1));

        vm.prank(owner);
        vm.expectRevert(MandateManager.InvalidSignature.selector);
        mm.createMandateWithWebAuthn(
            agent, agentId, ts, MAX_PER_TX, MAX_TOTAL, 0, 0,
            VALID_R, VALID_S,
            authData,
            clientDataJSON,
            challengeOffset
        );
    }

    function test_createMandateWithWebAuthn_missingUserPresence_reverts() public {
        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();

        bytes32 h = keccak256(abi.encode(
            keccak256("MandateManager.createMandate.v2"),
            block.chainid, address(mm), owner, agent, agentId,
            keccak256(abi.encode(ts)), MAX_PER_TX, MAX_TOTAL, 0, uint256(0)
        ));

        bytes memory b64Challenge = _b64url(h);
        bytes memory clientDataJSON = abi.encodePacked(
            '{"type":"webauthn.get","challenge":"',
            b64Challenge,
            '","origin":"http://localhost:3000"}'
        );
        uint256 challengeOffset = 36;

        // Flag byte has UP = 0 (user presence NOT asserted)
        bytes memory authData = abi.encodePacked(bytes32("mock_rp_id"), uint8(0x00), uint32(1));

        vm.prank(owner);
        vm.expectRevert(MandateManager.InvalidSignature.selector);
        mm.createMandateWithWebAuthn(
            agent, agentId, ts, MAX_PER_TX, MAX_TOTAL, 0, 0,
            VALID_R, VALID_S,
            authData,
            clientDataJSON,
            challengeOffset
        );
    }

    function test_createMandate_malleableSig_reverts() public {
        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();
        bytes32 h = keccak256(abi.encode(
            keccak256("MandateManager.createMandate.v2"),
            block.chainid, address(mm), owner, agent, agentId,
            keccak256(abi.encode(ts)), MAX_PER_TX, MAX_TOTAL, 0, uint256(0)
        ));

        // High S value above curve order / 2
        bytes32 highS = bytes32(uint256(0x7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCE4279DCB5617E3192A9));

        vm.prank(owner);
        vm.expectRevert(MandateManager.InvalidSignature.selector);
        mm.createMandate(
            agent, agentId, ts, MAX_PER_TX, MAX_TOTAL, 0, 0,
            VALID_R, highS, h
        );
    }

    function test_createMandate_zeroSig_reverts() public {
        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();
        bytes32 h = keccak256(abi.encode(
            keccak256("MandateManager.createMandate.v2"),
            block.chainid, address(mm), owner, agent, agentId,
            keccak256(abi.encode(ts)), MAX_PER_TX, MAX_TOTAL, 0, uint256(0)
        ));

        vm.prank(owner);
        vm.expectRevert(MandateManager.InvalidSignature.selector);
        mm.createMandate(
            agent, agentId, ts, MAX_PER_TX, MAX_TOTAL, 0, 0,
            bytes32(0), VALID_S, h
        );

        vm.prank(owner);
        vm.expectRevert(MandateManager.InvalidSignature.selector);
        mm.createMandate(
            agent, agentId, ts, MAX_PER_TX, MAX_TOTAL, 0, 0,
            VALID_R, bytes32(0), h
        );
    }

    function test_registerCredential_fieldOverflow_reverts() public {
        uint256 P256_P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF;
        bytes32 invalidKey = bytes32(P256_P);

        vm.prank(owner);
        vm.expectRevert(MandateManager.InvalidSignature.selector);
        mm.registerCredential(invalidKey, bytes32(uint256(1)));
    }
}
