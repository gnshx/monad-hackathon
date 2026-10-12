// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC8004Registry
/// @notice Interface for ERC-8004 Trustless Agent Identity Registry.
///         References registered on-chain agent identities without creating a competing registry.
interface IERC8004Registry {
    /// @notice Returns the owner/operator address for a registered agentId.
    function ownerOf(uint256 agentId) external view returns (address);

    /// @notice Returns the designated execution operator for an agent.
    function getAgentOperator(uint256 agentId) external view returns (address);
}
