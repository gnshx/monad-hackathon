// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IP256Verifier} from "../src/IP256Verifier.sol";

/// @notice Stub P256 verifier for tests — returns configurable result.
///         Never deploy to production.
contract MockP256Verifier is IP256Verifier {
    bool public shouldSucceed = true;

    function setResult(bool ok) external { shouldSucceed = ok; }

    function verify(bytes32, bytes32, bytes32, bytes32, bytes32) external view returns (bool) {
        return shouldSucceed;
    }
}
