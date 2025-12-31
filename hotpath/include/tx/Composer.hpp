#pragma once

#include <cstdint>
#include <array>
#include <vector>
#include <string>

namespace matrix::tx {

/**
 * Transaction Type (EIP-2718)
 */
enum class TxType : uint8_t {
    LEGACY = 0,
    EIP2930 = 1,  // Access list
    EIP1559 = 2   // Dynamic fee
};

/**
 * Raw Transaction Data
 */
struct RawTransaction {
    TxType type = TxType::EIP1559;
    uint64_t chain_id = 1;
    uint64_t nonce = 0;
    uint64_t max_priority_fee_per_gas = 0;
    uint64_t max_fee_per_gas = 0;
    uint64_t gas_limit = 0;
    std::array<uint8_t, 20> to;
    uint64_t value = 0;
    std::vector<uint8_t> data;
    std::vector<std::pair<std::array<uint8_t, 20>, std::vector<std::array<uint8_t, 32>>>> access_list;

    // Signature
    uint8_t v = 0;
    std::array<uint8_t, 32> r;
    std::array<uint8_t, 32> s;
};

/**
 * Flash Loan Parameters
 */
struct FlashLoanParams {
    std::array<uint8_t, 20> asset;        // Token to borrow
    uint64_t amount;                       // Amount to borrow
    std::vector<uint8_t> callback_data;   // Data for callback
};

/**
 * Swap Parameters
 */
struct SwapParams {
    std::array<uint8_t, 20> pool;         // Pool address
    std::array<uint8_t, 20> token_in;     // Input token
    std::array<uint8_t, 20> token_out;    // Output token
    uint64_t amount_in;                    // Input amount
    uint64_t min_amount_out;              // Minimum output (slippage protection)
};

/**
 * Transaction Composer - Builds raw transaction bytes
 *
 * Composes flash loan arbitrage transactions with minimal overhead.
 * Uses direct byte manipulation instead of ABI encoding libraries
 * for maximum performance.
 *
 * Performance target: <100us per transaction composition
 */
class Composer {
public:
    Composer();

    /**
     * Compose a flash loan arbitrage transaction
     * @param flash_loan Flash loan parameters
     * @param swaps Vector of swaps to execute
     * @param gas_limit Maximum gas to use
     * @param max_priority_fee Priority fee in wei
     * @param max_fee Maximum fee in wei
     * @return Raw transaction ready for signing
     */
    [[nodiscard]] RawTransaction compose_arbitrage(
        const FlashLoanParams& flash_loan,
        const std::vector<SwapParams>& swaps,
        uint64_t gas_limit,
        uint64_t max_priority_fee,
        uint64_t max_fee
    ) const;

    /**
     * Encode transaction to RLP bytes
     */
    [[nodiscard]] std::vector<uint8_t> encode_rlp(const RawTransaction& tx) const;

    /**
     * Calculate transaction hash (for signing)
     */
    [[nodiscard]] std::array<uint8_t, 32> hash_for_signing(const RawTransaction& tx) const;

    /**
     * Encode Aave V3 flashLoanSimple call
     */
    [[nodiscard]] std::vector<uint8_t> encode_aave_flash_loan(
        const std::array<uint8_t, 20>& receiver,
        const std::array<uint8_t, 20>& asset,
        uint64_t amount,
        const std::vector<uint8_t>& params
    ) const;

    /**
     * Encode Uniswap V3 exactInputSingle call
     */
    [[nodiscard]] std::vector<uint8_t> encode_uniswap_swap(
        const std::array<uint8_t, 20>& token_in,
        const std::array<uint8_t, 20>& token_out,
        uint32_t fee,
        uint64_t amount_in,
        uint64_t amount_out_min
    ) const;

    /**
     * Encode multicall for batching multiple operations
     */
    [[nodiscard]] std::vector<uint8_t> encode_multicall(
        const std::vector<std::vector<uint8_t>>& calls
    ) const;

private:
    // Function selectors (precomputed keccak256 hashes)
    static constexpr std::array<uint8_t, 4> FLASH_LOAN_SIMPLE_SELECTOR = {0x42, 0xb0, 0xb7, 0x7c};
    static constexpr std::array<uint8_t, 4> EXACT_INPUT_SINGLE_SELECTOR = {0x04, 0xe4, 0x5a, 0xaf};
    static constexpr std::array<uint8_t, 4> MULTICALL_SELECTOR = {0xac, 0x96, 0x50, 0xd8};

    // RLP encoding helpers
    [[nodiscard]] std::vector<uint8_t> rlp_encode_uint(uint64_t value) const;
    [[nodiscard]] std::vector<uint8_t> rlp_encode_bytes(const std::vector<uint8_t>& data) const;
    [[nodiscard]] std::vector<uint8_t> rlp_encode_list(const std::vector<std::vector<uint8_t>>& items) const;
};

/**
 * Transaction Signer - Signs transactions with private key
 *
 * Uses secp256k1 for ECDSA signing.
 */
class Signer {
public:
    explicit Signer(const std::array<uint8_t, 32>& private_key);

    /**
     * Sign a transaction
     */
    void sign(RawTransaction& tx) const;

    /**
     * Get the public address
     */
    [[nodiscard]] std::array<uint8_t, 20> address() const;

private:
    std::array<uint8_t, 32> private_key_;
    std::array<uint8_t, 20> address_;
};

} // namespace matrix::tx
