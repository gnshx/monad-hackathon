// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Dumb call target used in tests.
contract MockTarget {
    uint256 public callCount;
    bool public shouldFail;

    function setShouldFail(bool v) external { shouldFail = v; }

    function doSomething(uint256) external payable returns (uint256) {
        require(!shouldFail, "MockTarget: intentional failure");
        callCount++;
        return callCount;
    }

    receive() external payable {}
}
