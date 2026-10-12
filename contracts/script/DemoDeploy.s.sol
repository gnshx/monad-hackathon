// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MandateManager} from "../src/MandateManager.sol";
import {MockP256Verifier} from "../test/MockP256Verifier.sol";
import {MockERC8004Registry} from "../test/MockERC8004Registry.sol";
import {MockTarget} from "../test/MockTarget.sol";

contract DemoDeploy is Script {
    function run() external {
        uint256 ownerPk = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address owner = vm.addr(ownerPk);
        address agent = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // Account 1
        uint256 agentId = 42;

        vm.startBroadcast(ownerPk);

        MockP256Verifier verifier = new MockP256Verifier();
        MockERC8004Registry registry = new MockERC8004Registry();
        MockTarget target = new MockTarget();
        MandateManager mm = new MandateManager(address(verifier), address(registry));

        // Setup agent identity in registry
        registry.setAgent(agentId, owner, agent);

        // Register Passkey Credential (dummy pubkey validated by MockP256Verifier)
        bytes32 pubX = bytes32(uint256(1));
        bytes32 pubY = bytes32(uint256(2));
        mm.registerCredential(pubX, pubY);

        // Configure allowed targets
        MandateManager.AllowedTarget[] memory targets = new MandateManager.AllowedTarget[](1);
        targets[0] = MandateManager.AllowedTarget({
            target: address(target),
            selector: MockTarget.doSomething.selector
        });

        bytes32 challengeHash = mm.computeMandateHash(
            owner,
            agent,
            agentId,
            targets,
            0.2 ether,
            1.0 ether,
            0,
            0
        );

        // Create Mandate #0 with 0.5 ETH vault deposit
        uint256 mandateId = mm.createMandate{value: 0.5 ether}(
            agent,
            agentId,
            targets,
            0.2 ether, // max per tx
            1.0 ether, // max total
            0,         // no expiration
            0,         // nonce
            bytes32(uint256(1)), // valid r
            bytes32(uint256(1)), // valid s
            challengeHash
        );

        vm.stopBroadcast();

        console2.log("=== AgentTrust Demo Deployment ===");
        console2.log("MandateManager:", address(mm));
        console2.log("MockTarget:", address(target));
        console2.log("MockP256Verifier:", address(verifier));
        console2.log("MockERC8004Registry:", address(registry));
        console2.log("Owner Address:", owner);
        console2.log("Agent Address:", agent);
        console2.log("Mandate ID:", mandateId);
        console2.log("Initial Vault Balance: 0.5 ETH");
    }
}
