// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test, console2} from "forge-std/Test.sol";
import {FlashLoanReceiver} from "../src/FlashLoanReceiver.sol";

/**
 * @title FlashLoanReceiverTest
 * @notice Tests for FlashLoanReceiver contract
 */
contract FlashLoanReceiverTest is Test {
    FlashLoanReceiver public receiver;

    // Aave V3 Pool Address Provider (Ethereum mainnet)
    address constant AAVE_PROVIDER = 0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e;

    // Test tokens (mainnet)
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    address owner;
    address executor;
    address attacker;

    function setUp() public {
        // Fork mainnet
        vm.createSelectFork(vm.envString("ETH_RPC_URL"));

        owner = address(this);
        executor = makeAddr("executor");
        attacker = makeAddr("attacker");

        // Deploy receiver
        receiver = new FlashLoanReceiver(AAVE_PROVIDER);

        // Setup
        receiver.setAuthorizedExecutor(executor, true);
    }

    function test_Deployment() public view {
        assertEq(address(receiver.ADDRESSES_PROVIDER()), AAVE_PROVIDER);
        assertTrue(receiver.authorizedExecutors(owner));
    }

    function test_SetAuthorizedExecutor() public {
        address newExecutor = makeAddr("newExecutor");
        assertFalse(receiver.authorizedExecutors(newExecutor));

        receiver.setAuthorizedExecutor(newExecutor, true);
        assertTrue(receiver.authorizedExecutors(newExecutor));

        receiver.setAuthorizedExecutor(newExecutor, false);
        assertFalse(receiver.authorizedExecutors(newExecutor));
    }

    function test_SetWhitelistedDex() public {
        address dex = makeAddr("dex");
        assertFalse(receiver.whitelistedDexes(dex));

        receiver.setWhitelistedDex(dex, true);
        assertTrue(receiver.whitelistedDexes(dex));
    }

    function test_SetMinProfitBps() public {
        assertEq(receiver.minProfitBps(), 10);

        receiver.setMinProfitBps(50);
        assertEq(receiver.minProfitBps(), 50);
    }

    function test_RevertUnauthorizedExecutor() public {
        vm.prank(attacker);
        vm.expectRevert(FlashLoanReceiver.UnauthorizedCaller.selector);
        receiver.executeArbitrage(WETH, 1 ether, "");
    }

    function test_RevertOnlyOwnerSetExecutor() public {
        vm.prank(attacker);
        vm.expectRevert();
        receiver.setAuthorizedExecutor(attacker, true);
    }

    function testFuzz_SetMinProfitBps(uint256 bps) public {
        receiver.setMinProfitBps(bps);
        assertEq(receiver.minProfitBps(), bps);
    }
}
