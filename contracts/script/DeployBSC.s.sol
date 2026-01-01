// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {MultiDexRouter} from "../src/MultiDexRouter.sol";
import {IMultiDexRouter} from "../src/interfaces/IMultiDexRouter.sol";

/**
 * @title DeployBSCScript
 * @notice Deployment script for BSC (Mainnet and Testnet)
 * @dev BSC uses PancakeSwap flash swaps instead of Aave
 */
contract DeployBSCScript is Script {
    // BSC Mainnet DEX Routers (from THE ARCHITECT)
    address constant PANCAKESWAP_V3_MAINNET = 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4;
    address constant PANCAKESWAP_V2_MAINNET = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address constant BISWAP_MAINNET = 0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8;
    address constant THENA_MAINNET = 0xd4ae6eCA985340Dd434D38F470aCCce4DC78D109;
    address constant APESWAP_MAINNET = 0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7;

    // BSC Testnet DEX Routers
    address constant PANCAKESWAP_V2_TESTNET = 0xD99D1c33F9fC3444f8101754aBC46c52416550D1;
    address constant PANCAKESWAP_V3_TESTNET = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;

    // Common tokens (for verification)
    address constant WBNB_MAINNET = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address constant WBNB_TESTNET = 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd;

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("=== BSC Deployment ===");
        console2.log("Deployer:", deployer);
        console2.log("Chain ID:", block.chainid);
        console2.log("Balance:", deployer.balance);

        require(
            block.chainid == 56 || block.chainid == 97,
            "This script is for BSC only (56=mainnet, 97=testnet)"
        );

        bool isMainnet = block.chainid == 56;
        console2.log("Network:", isMainnet ? "BSC Mainnet" : "BSC Testnet");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy MultiDexRouter
        MultiDexRouter router = new MultiDexRouter();
        console2.log("MultiDexRouter deployed:", address(router));

        // Configure DEX routers
        _configureDexRouters(router, isMainnet);

        vm.stopBroadcast();

        // Log summary
        console2.log("\n=== Deployment Summary ===");
        console2.log("MultiDexRouter:", address(router));
        console2.log("Owner:", deployer);

        if (isMainnet) {
            console2.log("\nConfigured DEXes (Mainnet):");
            console2.log("  - PancakeSwap V3:", PANCAKESWAP_V3_MAINNET);
            console2.log("  - PancakeSwap V2:", PANCAKESWAP_V2_MAINNET);
            console2.log("  - BiSwap:", BISWAP_MAINNET);
            console2.log("  - Thena:", THENA_MAINNET);
            console2.log("  - ApeSwap:", APESWAP_MAINNET);
        } else {
            console2.log("\nConfigured DEXes (Testnet):");
            console2.log("  - PancakeSwap V3:", PANCAKESWAP_V3_TESTNET);
            console2.log("  - PancakeSwap V2:", PANCAKESWAP_V2_TESTNET);
        }

        console2.log("\nNext steps:");
        console2.log("1. Verify contract on BscScan");
        console2.log("2. Deploy PancakeFlashLoan receiver");
        console2.log("3. Configure authorized executors");
    }

    function _configureDexRouters(MultiDexRouter router, bool isMainnet) internal {
        if (isMainnet) {
            // BSC Mainnet
            // Using available DexId slots for BSC DEXes
            router.setDexRouter(IMultiDexRouter.DexId.PancakeSwap, PANCAKESWAP_V2_MAINNET);
            router.setDexRouter(IMultiDexRouter.DexId.UniswapV3, PANCAKESWAP_V3_MAINNET); // V3 in Uniswap slot
            router.setDexRouter(IMultiDexRouter.DexId.SushiSwap, BISWAP_MAINNET);

            console2.log("Configured 3 mainnet DEXes");
        } else {
            // BSC Testnet
            router.setDexRouter(IMultiDexRouter.DexId.PancakeSwap, PANCAKESWAP_V2_TESTNET);
            router.setDexRouter(IMultiDexRouter.DexId.UniswapV3, PANCAKESWAP_V3_TESTNET);

            console2.log("Configured 2 testnet DEXes");
        }
    }
}
