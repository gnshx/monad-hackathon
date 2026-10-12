// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC8004Registry} from "../src/IERC8004Registry.sol";

contract MockERC8004Registry is IERC8004Registry {
    mapping(uint256 => address) public owners;
    mapping(uint256 => address) public operators;

    function setAgent(uint256 agentId, address owner, address operator) external {
        owners[agentId] = owner;
        operators[agentId] = operator;
    }

    function ownerOf(uint256 agentId) external view override returns (address) {
        return owners[agentId];
    }

    function getAgentOperator(uint256 agentId) external view override returns (address) {
        return operators[agentId];
    }
}
