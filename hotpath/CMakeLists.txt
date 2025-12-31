cmake_minimum_required(VERSION 3.20)
project(hotpath VERSION 1.0.0 LANGUAGES CXX)

# Hot path core library
add_library(hotpath_core STATIC
    src/main.cpp
    src/orderbook/OrderBook.cpp
    src/arbitrage/Calculator.cpp
    src/network/WebSocket.cpp
    src/memory/Arena.cpp
    src/tx/Composer.cpp
)

target_include_directories(hotpath_core
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
)

target_link_libraries(hotpath_core
    PRIVATE
        Threads::Threads
)

# Enable link-time optimization for release builds
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    set_target_properties(hotpath_core PROPERTIES
        INTERPROCEDURAL_OPTIMIZATION TRUE
    )
endif()

# Hot path executable
add_executable(hotpath_runner src/main.cpp)
target_link_libraries(hotpath_runner PRIVATE hotpath_core)

# Unit tests (Google Test)
if(GTest_FOUND)
    add_executable(hotpath_tests
        test/test_orderbook.cpp
        test/test_arbitrage.cpp
        test/test_memory.cpp
    )
    target_link_libraries(hotpath_tests
        PRIVATE
            hotpath_core
            GTest::gtest
            GTest::gtest_main
    )
    add_test(NAME hotpath_tests COMMAND hotpath_tests)
endif()

# Benchmarks (Google Benchmark)
if(benchmark_FOUND)
    add_executable(hotpath_bench
        bench/bench_orderbook.cpp
        bench/bench_arbitrage.cpp
        bench/bench_memory.cpp
    )
    target_link_libraries(hotpath_bench
        PRIVATE
            hotpath_core
            benchmark::benchmark
            benchmark::benchmark_main
    )
endif()
