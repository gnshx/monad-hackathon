// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WebAuthnP256
/// @notice Minimal, strict WebAuthn assertion verification on top of a RIP-7212 / EIP-7951
///         P-256 verifier (Monad's native precompile at 0x0100).
///
///         Checks, in order:
///           1. authenticatorData flags: User Present (UP) and User Verified (UV) both set
///           2. clientDataJSON contains "type":"webauthn.get" at typeIndex (rejects create() output)
///           3. clientDataJSON contains "challenge":"<base64url(digest)>" at challengeIndex
///           4. signature scalars in range, s in the lower half of the curve order (no malleability)
///           5. P-256 verify of sha256(authenticatorData || sha256(clientDataJSON))
///         The public key itself is validated as an on-curve point before it is ever stored.
library WebAuthnP256 {
    struct Assertion {
        bytes authenticatorData;
        bytes clientDataJSON;
        uint256 challengeIndex; // index of `"challenge":"` in clientDataJSON
        uint256 typeIndex;      // index of `"type":"webauthn.get"` in clientDataJSON
        bytes32 r;
        bytes32 s;
    }

    address internal constant PRECOMPILE = address(0x100);

    uint256 internal constant P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF;
    uint256 internal constant A = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFC;
    uint256 internal constant B = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B;
    uint256 internal constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    uint256 internal constant N_DIV_2 = 0x7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCE4279DCB5617E3192A8;

    uint8 internal constant FLAG_UP = 0x01;
    uint8 internal constant FLAG_UV = 0x04;

    bytes internal constant TYPE_GET = '"type":"webauthn.get"';
    bytes internal constant CHALLENGE_PREFIX = '"challenge":"';

    function verify(address verifier, bytes32 challenge, Assertion calldata a, bytes32 x, bytes32 y)
        internal
        view
        returns (bool)
    {
        if (x == 0 && y == 0) return false;

        bytes calldata authData = a.authenticatorData;
        if (authData.length < 37) return false;
        uint8 flags = uint8(authData[32]);
        if (flags & FLAG_UP == 0 || flags & FLAG_UV == 0) return false;

        bytes calldata cdj = a.clientDataJSON;
        if (!_matchesAt(cdj, a.typeIndex, TYPE_GET)) return false;
        if (!_matchesAt(cdj, a.challengeIndex, CHALLENGE_PREFIX)) return false;
        bytes memory encoded = abi.encodePacked(base64Url(challenge), '"');
        if (!_matchesAt(cdj, a.challengeIndex + CHALLENGE_PREFIX.length, encoded)) return false;

        uint256 r = uint256(a.r);
        uint256 s = uint256(a.s);
        if (r == 0 || r >= N || s == 0 || s > N_DIV_2) return false;

        bytes32 message = sha256(abi.encodePacked(authData, sha256(cdj)));
        (bool ok, bytes memory ret) = verifier.staticcall(abi.encodePacked(message, a.r, a.s, x, y));
        return ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
    }

    /// @notice True if (x, y) is a valid affine point on P-256 (not infinity, coordinates < p).
    function isValidPublicKey(bytes32 x, bytes32 y) internal pure returns (bool) {
        uint256 px = uint256(x);
        uint256 py = uint256(y);
        if (px == 0 || py == 0 || px >= P || py >= P) return false;
        uint256 lhs = mulmod(py, py, P);
        uint256 rhs = addmod(addmod(mulmod(mulmod(px, px, P), px, P), mulmod(A, px, P), P), B, P);
        return lhs == rhs;
    }

    /// @notice Unpadded base64url of 32 bytes (43 characters), as browsers encode WebAuthn challenges.
    function base64Url(bytes32 data) internal pure returns (bytes memory out) {
        bytes memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        out = new bytes(43);
        uint256 j;
        for (uint256 i; i < 30; i += 3) {
            uint256 n = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i + 1])) << 8) | uint8(data[i + 2]);
            out[j++] = table[(n >> 18) & 63];
            out[j++] = table[(n >> 12) & 63];
            out[j++] = table[(n >> 6) & 63];
            out[j++] = table[n & 63];
        }
        uint256 last = (uint256(uint8(data[30])) << 8) | uint8(data[31]);
        out[j++] = table[(last >> 10) & 63];
        out[j++] = table[(last >> 4) & 63];
        out[j] = table[(last << 2) & 63];
    }

    function _matchesAt(bytes calldata haystack, uint256 index, bytes memory needle) private pure returns (bool) {
        if (index + needle.length > haystack.length) return false;
        return keccak256(haystack[index:index + needle.length]) == keccak256(needle);
    }
}
