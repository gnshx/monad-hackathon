// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IP256Verifier
/// @notice Interface for Monad's P256 / WebAuthn precompile.
///         Address 0x0000...0100 is a placeholder — confirm with current Monad docs
///         before deploying to mainnet. The precompile must verify NIST P-256 (secp256r1).
interface IP256Verifier {
    /// @notice Verify a P-256 signature.
    /// @param hash       The 32-byte message hash (sha-256 of the WebAuthn clientDataJSON || authData).
    /// @param r          Signature r component (big-endian, 32 bytes).
    /// @param s          Signature s component (big-endian, 32 bytes).
    /// @param x          Public key x coordinate (32 bytes).
    /// @param y          Public key y coordinate (32 bytes).
    /// @return           True iff the signature is valid.
    function verify(
        bytes32 hash,
        bytes32 r,
        bytes32 s,
        bytes32 x,
        bytes32 y
    ) external view returns (bool);
}
