// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentMandates} from "../src/AgentMandates.sol";

/// forge script script/DeployAgentMandates.s.sol --rpc-url $MONAD_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract DeployAgentMandates is Script {
    address constant MONAD_TESTNET_ERC8004_IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    function run() external returns (AgentMandates am) {
        address registry = vm.envOr("ERC8004_REGISTRY_ADDRESS", MONAD_TESTNET_ERC8004_IDENTITY);
        vm.startBroadcast();
        am = new AgentMandates(registry, address(0)); // address(0) → Monad P-256 precompile at 0x0100
        vm.stopBroadcast();
        console2.log("AgentMandates:", address(am));
        console2.log("ERC-8004 registry:", registry);
    }
}
