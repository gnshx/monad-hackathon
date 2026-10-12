// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {MandateManager} from "../src/MandateManager.sol";
import {MockP256Verifier} from "./MockP256Verifier.sol";
import {MockTarget} from "./MockTarget.sol";

contract MandateManagerTest is Test {
    MandateManager  internal mm;
    MockP256Verifier internal verifier;
    MockTarget      internal target;

    address internal owner  = address(0xA11CE);
    address internal agent  = address(0xB0B);
    uint256 internal agentId = 42;

    bytes32 internal constant PUB_X = bytes32(uint256(1));
    bytes32 internal constant PUB_Y = bytes32(uint256(2));

    // Mandate params used in most tests
    uint256 internal constant MAX_PER_TX = 1 ether;
    uint256 internal constant MAX_TOTAL  = 5 ether;
    uint256 internal constant EXPIRES_NEVER = 0;

    function setUp() public {
        verifier = new MockP256Verifier();
        mm       = new MandateManager(address(verifier));
        target   = new MockTarget();

        vm.deal(address(mm), 10 ether);

        // Register passkey for owner
        vm.prank(owner);
        mm.registerCredential(PUB_X, PUB_Y);
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

    function _createMandate(uint256 expiresAt) internal returns (uint256 mandateId) {
        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();

        // Build the same hash the contract uses
        bytes32 h = keccak256(abi.encode(
            keccak256("MandateManager.createMandate.v1"),
            block.chainid,
            address(mm),
            owner,
            agentId,
            keccak256(abi.encode(ts)),
            MAX_PER_TX,
            MAX_TOTAL,
            expiresAt,
            uint256(0) // nonce
        ));

        vm.prank(owner);
        mandateId = mm.createMandate(
            agentId, ts, MAX_PER_TX, MAX_TOTAL, expiresAt,
            0,            // nonce
            bytes32(0),   // sigR (mock verifier ignores)
            bytes32(0),   // sigS
            h             // challengeHash = canonical hash
        );
    }

    function _execCalldata(uint256 arg) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(MockTarget.doSomething.selector, arg);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Credential registration
    // ─────────────────────────────────────────────────────────────────────────

    function test_registerCredential() public {
        (bytes32 x, bytes32 y) = mm.credentials(owner);
        assertEq(x, PUB_X);
        assertEq(y, PUB_Y);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mandate creation
    // ─────────────────────────────────────────────────────────────────────────

    function test_createMandate_happy() public {
        uint256 id = _createMandate(EXPIRES_NEVER);
        MandateManager.Mandate memory m = mm.getMandate(id);

        assertEq(m.owner,    owner);
        assertEq(m.agentId,  agentId);
        assertFalse(m.revoked);
        assertTrue(mm.isActive(id));
    }

    function test_createMandate_invalidSig_reverts() public {
        verifier.setResult(false);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();

        bytes32 h = keccak256(abi.encode(
            keccak256("MandateManager.createMandate.v1"),
            block.chainid, address(mm), owner, agentId,
            keccak256(abi.encode(ts)), MAX_PER_TX, MAX_TOTAL, EXPIRES_NEVER, uint256(0)
        ));

        vm.prank(owner);
        vm.expectRevert(MandateManager.InvalidSignature.selector);
        mm.createMandate(agentId, ts, MAX_PER_TX, MAX_TOTAL, EXPIRES_NEVER, 0, 0, 0, h);
    }

    function test_createMandate_noCredential_reverts() public {
        address stranger = address(0xDEAD);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();
        vm.prank(stranger);
        vm.expectRevert(MandateManager.NoCredential.selector);
        mm.createMandate(agentId, ts, MAX_PER_TX, MAX_TOTAL, EXPIRES_NEVER, 0, 0, 0, 0);
    }

    function test_createMandate_badNonce_reverts() public {
        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();
        vm.prank(owner);
        vm.expectRevert(MandateManager.BadNonce.selector);
        mm.createMandate(agentId, ts, MAX_PER_TX, MAX_TOTAL, EXPIRES_NEVER, 99, 0, 0, bytes32(uint256(1)));
    }

    function test_createMandate_replayChallenge_reverts() public {
        verifier.setResult(true);
        MandateManager.AllowedTarget[] memory ts = _defaultTargets();

        // Provide a challenge hash that does NOT match the canonical one
        bytes32 wrongHash = keccak256("wrong");

        vm.prank(owner);
        vm.expectRevert(MandateManager.InvalidSignature.selector);
        mm.createMandate(agentId, ts, MAX_PER_TX, MAX_TOTAL, EXPIRES_NEVER, 0, 0, 0, wrongHash);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Execution — happy path
    // ─────────────────────────────────────────────────────────────────────────

    function test_execute_happy() public {
        uint256 id = _createMandate(EXPIRES_NEVER);

        mm.execute(
            id, agentId, address(target),
            MockTarget.doSomething.selector,
            _execCalldata(1),
            0, // no value
            0  // execNonce
        );

        assertEq(target.callCount(), 1);
        assertEq(mm.executionNonces(id), 1);
    }

    function test_execute_withValue() public {
        uint256 id = _createMandate(EXPIRES_NEVER);
        uint256 v  = 0.5 ether;

        mm.execute(
            id, agentId, address(target),
            MockTarget.doSomething.selector,
            _execCalldata(1),
            v, 0
        );

        MandateManager.Mandate memory m = mm.getMandate(id);
        assertEq(m.spentValue, v);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Execution — authorization failures
    // ─────────────────────────────────────────────────────────────────────────

    function test_execute_revoked_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER);
        vm.prank(owner);
        mm.revokeMandate(id);

        vm.expectRevert(MandateManager.MandateIsRevoked.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 0, 0);
    }

    function test_execute_expired_reverts() public {
        uint256 exp = block.timestamp + 1 hours;
        uint256 id  = _createMandate(exp);

        vm.warp(exp + 1);
        vm.expectRevert(MandateManager.MandateExpired.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 0, 0);
    }

    function test_execute_wrongAgent_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER);

        vm.expectRevert(MandateManager.UnauthorizedAgent.selector);
        mm.execute(id, 999 /* wrong agentId */, address(target), MockTarget.doSomething.selector, _execCalldata(1), 0, 0);
    }

    function test_execute_unauthorizedTarget_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER);
        address badTarget = address(0xBAD);

        vm.expectRevert(MandateManager.TargetNotAllowed.selector);
        mm.execute(id, agentId, badTarget, MockTarget.doSomething.selector, _execCalldata(1), 0, 0);
    }

    function test_execute_unauthorizedSelector_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER);
        bytes4 badSel = bytes4(keccak256("setShouldFail(bool)"));

        vm.expectRevert(MandateManager.TargetNotAllowed.selector);
        mm.execute(id, agentId, address(target), badSel, abi.encodeWithSelector(badSel, true), 0, 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Execution — spending limits
    // ─────────────────────────────────────────────────────────────────────────

    function test_execute_exceedsPerTxLimit_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER);

        vm.expectRevert(MandateManager.ExceedsPerTxLimit.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), MAX_PER_TX + 1, 0);
    }

    function test_execute_exceedsTotalLimit_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER);

        // Drain budget: 5 × 1 ETH = 5 ETH = MAX_TOTAL
        for (uint256 i; i < 5; i++) {
            mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 1 ether, i);
        }

        vm.expectRevert(MandateManager.ExceedsTotalLimit.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 1, 5);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Replay protection
    // ─────────────────────────────────────────────────────────────────────────

    function test_execute_replayNonce_reverts() public {
        uint256 id = _createMandate(EXPIRES_NEVER);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 0, 0);

        // Replaying nonce 0 should fail
        vm.expectRevert(MandateManager.ReplayDetected.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 0, 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Failed call does not consume budget
    // ─────────────────────────────────────────────────────────────────────────

    function test_execute_failedCall_doesNotChargeBudget() public {
        uint256 id = _createMandate(EXPIRES_NEVER);
        target.setShouldFail(true);

        vm.expectRevert(MandateManager.CallFailed.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 0.5 ether, 0);

        MandateManager.Mandate memory m = mm.getMandate(id);
        assertEq(m.spentValue, 0, "budget should not be consumed on failed call");
        assertEq(mm.executionNonces(id), 0, "nonce should roll back on failed call");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Revocation
    // ─────────────────────────────────────────────────────────────────────────

    function test_revoke_onlyOwner() public {
        uint256 id = _createMandate(EXPIRES_NEVER);

        vm.prank(address(0xDEAD));
        vm.expectRevert(MandateManager.NotOwner.selector);
        mm.revokeMandate(id);
    }

    function test_isActive_afterRevoke_false() public {
        uint256 id = _createMandate(EXPIRES_NEVER);
        vm.prank(owner);
        mm.revokeMandate(id);
        assertFalse(mm.isActive(id));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz: spending never exceeds max
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_spendingCap(uint256 spend) public {
        spend = bound(spend, MAX_PER_TX + 1, 100 ether);

        uint256 id = _createMandate(EXPIRES_NEVER);
        vm.deal(address(mm), 100 ether);

        vm.expectRevert(MandateManager.ExceedsPerTxLimit.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), spend, 0);
    }

    function testFuzz_totalCapExceeded() public {
        uint256 id = _createMandate(EXPIRES_NEVER);
        vm.deal(address(mm), 100 ether);

        // Spend 5 times 1 ether to reach MAX_TOTAL (5 ether)
        for (uint256 i = 0; i < 5; i++) {
            mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 1 ether, i);
        }

        // Next execution of even 1 wei must revert with ExceedsTotalLimit
        vm.expectRevert(MandateManager.ExceedsTotalLimit.selector);
        mm.execute(id, agentId, address(target), MockTarget.doSomething.selector, _execCalldata(1), 1, 5);
    }
}
