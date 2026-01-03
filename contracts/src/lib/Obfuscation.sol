// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title Obfuscation Library
 * @author Matrix Team
 * @notice On-chain obfuscation patterns for MEV protection
 * @dev Use these patterns on chains without private mempools (BSC, Polygon, etc.)
 *
 * Techniques implemented:
 * 1. Address XOR encoding - Hide hardcoded addresses from bytecode scanners
 * 2. Dynamic function routing - Non-standard selector dispatch
 * 3. Commit-reveal scheme - Hide transaction intent until execution
 * 4. Hashed access control - Obscure authorized addresses
 * 5. Time-locked operations - Prevent instant front-running
 *
 * IMPORTANT: These techniques provide obfuscation, not encryption.
 * A determined attacker can still reverse engineer the logic.
 * Use in combination with other MEV protection strategies.
 */
library Obfuscation {
    // ============ Errors ============
    error InvalidReveal();
    error CommitmentNotFound();
    error RevealTooEarly();
    error RevealTooLate();
    error UnauthorizedCaller();

    // ============ Address Obfuscation ============

    /**
     * @notice Encode an address with XOR key
     * @dev Call off-chain to get encoded value, store in contract
     * @param addr The address to encode
     * @param key The XOR key (use a random bytes32)
     * @return encoded The XOR-encoded address as bytes32
     *
     * Example usage:
     * ```solidity
     * bytes32 private immutable ENCODED_DEX;
     * bytes32 private immutable XOR_KEY;
     *
     * constructor(address dex, bytes32 key) {
     *     ENCODED_DEX = Obfuscation.encodeAddress(dex, key);
     *     XOR_KEY = key;
     * }
     *
     * function _getDex() internal view returns (address) {
     *     return Obfuscation.decodeAddress(ENCODED_DEX, XOR_KEY);
     * }
     * ```
     */
    function encodeAddress(
        address addr,
        bytes32 key
    ) internal pure returns (bytes32 encoded) {
        encoded = bytes32(uint256(uint160(addr))) ^ key;
    }

    /**
     * @notice Decode an XOR-encoded address
     * @param encoded The encoded address
     * @param key The XOR key used for encoding
     * @return addr The decoded address
     */
    function decodeAddress(
        bytes32 encoded,
        bytes32 key
    ) internal pure returns (address addr) {
        addr = address(uint160(uint256(encoded ^ key)));
    }

    /**
     * @notice Encode multiple addresses into a packed format
     * @dev Stores up to 4 addresses in 2 bytes32 slots
     * @param addrs Array of addresses (max 4)
     * @param key XOR key
     * @return packed1 First packed slot
     * @return packed2 Second packed slot
     */
    function encodeAddresses(
        address[4] memory addrs,
        bytes32 key
    ) internal pure returns (bytes32 packed1, bytes32 packed2) {
        // Pack first two addresses into packed1
        packed1 = bytes32(
            (uint256(uint160(addrs[0])) << 96) |
            uint256(uint160(addrs[1]))
        ) ^ key;

        // Pack second two addresses into packed2
        packed2 = bytes32(
            (uint256(uint160(addrs[2])) << 96) |
            uint256(uint160(addrs[3]))
        ) ^ key;
    }

    /**
     * @notice Decode packed addresses
     */
    function decodeAddresses(
        bytes32 packed1,
        bytes32 packed2,
        bytes32 key
    ) internal pure returns (address[4] memory addrs) {
        bytes32 dec1 = packed1 ^ key;
        bytes32 dec2 = packed2 ^ key;

        addrs[0] = address(uint160(uint256(dec1) >> 96));
        addrs[1] = address(uint160(uint256(dec1)));
        addrs[2] = address(uint160(uint256(dec2) >> 96));
        addrs[3] = address(uint160(uint256(dec2)));
    }

    // ============ Commit-Reveal Scheme ============

    /**
     * @notice Generate a commitment hash
     * @dev Call off-chain, then submit commitment on-chain
     * @param sender The address that will reveal
     * @param data The data being committed
     * @param secret A random secret (keep off-chain until reveal)
     * @return commitment The commitment hash
     */
    function generateCommitment(
        address sender,
        bytes memory data,
        bytes32 secret
    ) internal pure returns (bytes32 commitment) {
        commitment = keccak256(abi.encodePacked(sender, data, secret));
    }

    /**
     * @notice Verify a reveal matches a commitment
     * @param commitment The stored commitment
     * @param sender The revealing address (must match original)
     * @param data The revealed data
     * @param secret The secret used in commitment
     * @return valid Whether the reveal is valid
     */
    function verifyReveal(
        bytes32 commitment,
        address sender,
        bytes memory data,
        bytes32 secret
    ) internal pure returns (bool valid) {
        valid = commitment == keccak256(abi.encodePacked(sender, data, secret));
    }

    // ============ Hashed Access Control ============

    /**
     * @notice Generate access control hash for an address
     * @dev Store hash instead of address to hide authorized callers
     * @param addr The address to authorize
     * @param salt A salt value (can be contract-specific)
     * @return hash The access control hash
     */
    function generateAccessHash(
        address addr,
        bytes32 salt
    ) internal pure returns (bytes32 hash) {
        hash = keccak256(abi.encodePacked(addr, salt));
    }

    /**
     * @notice Verify caller against stored hash
     * @param storedHash The stored access hash
     * @param caller The address to verify
     * @param salt The salt used when generating hash
     * @return authorized Whether caller is authorized
     */
    function verifyAccess(
        bytes32 storedHash,
        address caller,
        bytes32 salt
    ) internal pure returns (bool authorized) {
        authorized = storedHash == keccak256(abi.encodePacked(caller, salt));
    }

    // ============ Dynamic Function Routing ============

    /**
     * @notice Extract a custom selector from calldata
     * @dev Use non-standard positions to confuse decompilers
     * @param position Where in calldata to read selector
     * @return selector The extracted selector
     */
    function extractSelector(
        uint256 position
    ) internal pure returns (bytes4 selector) {
        require(msg.data.length >= position + 4, "Calldata too short");
        assembly {
            selector := calldataload(position)
        }
    }

    /**
     * @notice Extract single-byte command from end of calldata
     * @dev Hides command in unexpected position
     * @return cmd The command byte
     */
    function extractTrailingCommand() internal pure returns (uint8 cmd) {
        require(msg.data.length >= 1, "No command");
        assembly {
            // Load last byte of calldata
            cmd := byte(0, calldataload(sub(calldatasize(), 1)))
        }
    }

    // ============ Value Scrambling ============

    /**
     * @notice Scramble a uint256 value
     * @param value The value to scramble
     * @param key Scrambling key
     * @return scrambled The scrambled value
     */
    function scrambleUint(
        uint256 value,
        uint256 key
    ) internal pure returns (uint256 scrambled) {
        scrambled = value ^ key;
        // Additional bit rotation for more obfuscation
        scrambled = (scrambled << 128) | (scrambled >> 128);
    }

    /**
     * @notice Unscramble a uint256 value
     */
    function unscrambleUint(
        uint256 scrambled,
        uint256 key
    ) internal pure returns (uint256 value) {
        // Reverse bit rotation
        value = (scrambled >> 128) | (scrambled << 128);
        value = value ^ key;
    }
}

/**
 * @title CommitRevealStorage
 * @notice Mixin for commit-reveal functionality
 * @dev Inherit this to add commit-reveal to your contract
 */
abstract contract CommitRevealStorage {
    struct Commitment {
        bytes32 hash;
        uint256 commitBlock;
        uint256 deadline;
    }

    /// @notice Minimum blocks between commit and reveal
    uint256 public immutable MIN_REVEAL_DELAY;

    /// @notice Maximum blocks before commitment expires
    uint256 public immutable MAX_REVEAL_WINDOW;

    /// @notice Stored commitments
    mapping(bytes32 => Commitment) internal _commitments;

    /// @notice Emitted when commitment is made
    event CommitmentMade(bytes32 indexed commitmentId, uint256 deadline);

    /// @notice Emitted when commitment is revealed
    event CommitmentRevealed(bytes32 indexed commitmentId);

    constructor(uint256 minDelay, uint256 maxWindow) {
        MIN_REVEAL_DELAY = minDelay;
        MAX_REVEAL_WINDOW = maxWindow;
    }

    /**
     * @notice Submit a commitment
     * @param commitmentHash The hash of (sender, data, secret)
     * @return commitmentId Unique ID for this commitment
     */
    function _commit(bytes32 commitmentHash) internal returns (bytes32 commitmentId) {
        commitmentId = keccak256(abi.encodePacked(commitmentHash, block.number, msg.sender));

        _commitments[commitmentId] = Commitment({
            hash: commitmentHash,
            commitBlock: block.number,
            deadline: block.number + MAX_REVEAL_WINDOW
        });

        emit CommitmentMade(commitmentId, block.number + MAX_REVEAL_WINDOW);
    }

    /**
     * @notice Verify and consume a commitment
     * @param commitmentId The commitment ID from commit phase
     * @param data The revealed data
     * @param secret The secret used in commitment
     */
    function _reveal(
        bytes32 commitmentId,
        bytes memory data,
        bytes32 secret
    ) internal {
        Commitment storage commitment = _commitments[commitmentId];

        if (commitment.commitBlock == 0) revert Obfuscation.CommitmentNotFound();
        if (block.number < commitment.commitBlock + MIN_REVEAL_DELAY) {
            revert Obfuscation.RevealTooEarly();
        }
        if (block.number > commitment.deadline) {
            revert Obfuscation.RevealTooLate();
        }

        // Verify the reveal
        if (!Obfuscation.verifyReveal(commitment.hash, msg.sender, data, secret)) {
            revert Obfuscation.InvalidReveal();
        }

        // Consume commitment
        delete _commitments[commitmentId];

        emit CommitmentRevealed(commitmentId);
    }

    /**
     * @notice Check if a commitment exists and is valid
     */
    function isCommitmentValid(bytes32 commitmentId) public view returns (bool) {
        Commitment storage commitment = _commitments[commitmentId];
        return commitment.commitBlock > 0 && block.number <= commitment.deadline;
    }
}

/**
 * @title ObfuscatedAccessControl
 * @notice Access control using hashed addresses
 * @dev Authorized addresses are not visible in storage
 */
abstract contract ObfuscatedAccessControl {
    /// @notice Salt for access control hashing
    bytes32 private immutable ACCESS_SALT;

    /// @notice Hashed owner address
    bytes32 private _ownerHash;

    /// @notice Hashed executor addresses
    mapping(bytes32 => bool) private _executorHashes;

    error NotOwner();
    error NotExecutor();

    constructor(bytes32 salt) {
        ACCESS_SALT = salt;
        _ownerHash = Obfuscation.generateAccessHash(msg.sender, salt);
    }

    modifier onlyOwnerObfuscated() {
        if (!Obfuscation.verifyAccess(_ownerHash, msg.sender, ACCESS_SALT)) {
            revert NotOwner();
        }
        _;
    }

    modifier onlyExecutorObfuscated() {
        bytes32 callerHash = Obfuscation.generateAccessHash(msg.sender, ACCESS_SALT);
        if (!_executorHashes[callerHash]) {
            revert NotExecutor();
        }
        _;
    }

    /**
     * @notice Add an executor (owner only)
     * @param executorHash The pre-computed hash of the executor address
     */
    function _addExecutorHash(bytes32 executorHash) internal onlyOwnerObfuscated {
        _executorHashes[executorHash] = true;
    }

    /**
     * @notice Remove an executor (owner only)
     */
    function _removeExecutorHash(bytes32 executorHash) internal onlyOwnerObfuscated {
        _executorHashes[executorHash] = false;
    }

    /**
     * @notice Transfer ownership using hash
     */
    function _transferOwnershipObfuscated(bytes32 newOwnerHash) internal onlyOwnerObfuscated {
        _ownerHash = newOwnerHash;
    }

    /**
     * @notice Check if a hash is an authorized executor
     */
    function isExecutorHash(bytes32 hash) public view returns (bool) {
        return _executorHashes[hash];
    }
}
