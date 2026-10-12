// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MandateManager} from "../src/MandateManager.sol";

/// @notice Deployment script for Monad testnet.
///         Set MONAD_RPC_URL and DEPLOYER_PRIVATE_KEY in your .env
///         Run: forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        // shortcut: using address(0) so contract falls back to P256_PRECOMPILE constant
        // Update once Monad confirms the precompile address
        address p256Override = address(0);

        vm.startBroadcast(pk);
        MandateManager mm = new MandateManager(p256Override);
        vm.stopBroadcast();

        console2.log("MandateManager deployed at:", address(mm));
        console2.log("Chain ID:", block.chainid);
    }
}
