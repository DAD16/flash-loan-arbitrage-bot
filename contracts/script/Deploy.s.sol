// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {FlashLoanReceiver} from "../src/FlashLoanReceiver.sol";
import {MultiDexRouter} from "../src/MultiDexRouter.sol";
import {IMultiDexRouter} from "../src/interfaces/IMultiDexRouter.sol";

/**
 * @title DeployScript
 * @notice Deployment script for Matrix contracts
 */
contract DeployScript is Script {
    // Aave V3 Pool Address Providers (Mainnet)
    address constant AAVE_ETHEREUM = 0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e;
    address constant AAVE_ARBITRUM = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    address constant AAVE_OPTIMISM = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    address constant AAVE_BASE = 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D;
    address constant AAVE_BSC = 0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D;

    // Aave V3 Pool Address Providers (Testnet)
    address constant AAVE_SEPOLIA = 0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A;
    address constant AAVE_ARBITRUM_SEPOLIA = 0x4c5F46a1aB6F1AF50F87beEfC42F01FB3E3c0c2e;

    // DEX Routers
    address constant UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address constant SUSHISWAP_ROUTER = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("Deploying from:", deployer);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // Get correct Aave provider for chain
        address aaveProvider = _getAaveProvider();

        // Deploy FlashLoanReceiver
        FlashLoanReceiver flashLoanReceiver = new FlashLoanReceiver(aaveProvider);
        console2.log("FlashLoanReceiver deployed:", address(flashLoanReceiver));

        // Deploy MultiDexRouter
        MultiDexRouter router = new MultiDexRouter();
        console2.log("MultiDexRouter deployed:", address(router));

        // Configure
        _configure(flashLoanReceiver, router);

        vm.stopBroadcast();

        // Log summary
        console2.log("\n=== Deployment Summary ===");
        console2.log("FlashLoanReceiver:", address(flashLoanReceiver));
        console2.log("MultiDexRouter:", address(router));
    }

    function _getAaveProvider() internal view returns (address) {
        // Mainnets
        if (block.chainid == 1) return AAVE_ETHEREUM;
        if (block.chainid == 42161) return AAVE_ARBITRUM;
        if (block.chainid == 10) return AAVE_OPTIMISM;
        if (block.chainid == 8453) return AAVE_BASE;
        if (block.chainid == 56) return AAVE_BSC;
        // Testnets
        if (block.chainid == 11155111) return AAVE_SEPOLIA;
        if (block.chainid == 421614) return AAVE_ARBITRUM_SEPOLIA;
        revert("Unsupported chain");
    }

    function _configure(
        FlashLoanReceiver flashLoanReceiver,
        MultiDexRouter router
    ) internal {
        // Whitelist router in flash loan receiver
        flashLoanReceiver.setWhitelistedDex(address(router), true);

        // Configure DEX routers based on chain
        if (block.chainid == 1) {
            router.setDexRouter(IMultiDexRouter.DexId.SushiSwap, SUSHISWAP_ROUTER);
        }
    }
}
