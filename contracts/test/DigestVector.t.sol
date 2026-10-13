// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentMandates} from "../src/AgentMandates.sol";

/// @dev Pins the createDigest/revokeDigest encodings to fixed vectors. packages/sdk/test/mandates.test.ts
///      asserts the same vectors, so the SDK and the contract cannot drift apart silently.
contract DigestVectorTest is Test {
    address constant AT = 0x1111111111111111111111111111111111111111;
    bytes32 constant OWNER_KEY = keccak256("owner");

    function setUp() public {
        vm.chainId(10143);
        deployCodeTo("AgentMandates.sol:AgentMandates", abi.encode(address(0), address(0)), AT);
    }

    function test_createDigestVector() public {
        AgentMandates.MandateTerms memory t;
        t.agent = 0x2222222222222222222222222222222222222222;
        t.agentId = 7;
        t.permissions = new AgentMandates.Permission[](2);
        t.permissions[0] = AgentMandates.Permission(0x3333333333333333333333333333333333333333, 0xa9059cbb);
        t.permissions[1] = AgentMandates.Permission(0x4444444444444444444444444444444444444444, bytes4(0));
        t.maxPerCall = 1 ether;
        t.budget = 5 ether;
        t.expiresAt = 1_800_000_000;
        t.tokenLimits = new AgentMandates.TokenLimit[](1);
        t.tokenLimits[0] = AgentMandates.TokenLimit(0x5555555555555555555555555555555555555555, 10e6, 25e6);
        bytes32 d = AgentMandates(payable(AT)).createDigest(OWNER_KEY, t, 3);
        emit log_bytes32(d);
        assertEq(d, CREATE_VECTOR);
    }

    function test_revokeDigestVector() public {
        bytes32 d = AgentMandates(payable(AT)).revokeDigest(OWNER_KEY, 9, 4);
        emit log_bytes32(d);
        assertEq(d, REVOKE_VECTOR);
    }

    bytes32 constant CREATE_VECTOR = 0x7480efa2df0632a6966eb3c06a10d0de5dcb0565931243ed0e1eb3932374128d;
    bytes32 constant REVOKE_VECTOR = 0x9923ce5d06bd4669878bafb4e4394dcb16a7f7f5c8a8ae40c7f3faf7f46ba3b9;
}
