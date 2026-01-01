cmake_minimum_required(VERSION 3.16)
project(matrix_hotpath VERSION 0.1.0 LANGUAGES CXX)

# C++20 for modern features
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler flags
if(MSVC)
    # MSVC flags
    add_compile_options(/W4 /WX- /O2 /Ob2 /Oi /Ot /GL)
    # AVX2 support
    add_compile_options(/arch:AVX2)
    # Link time optimization
    add_link_options(/LTCG)
else()
    # GCC/Clang flags
    add_compile_options(-Wall -Wextra -O3 -march=native -mtune=native)
    # AVX2 support
    add_compile_options(-mavx2 -mfma)
    # Link time optimization
    add_compile_options(-flto)
    add_link_options(-flto)
endif()

# Include directories
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)

# Source files
set(HOTPATH_SOURCES
    src/simd_math.cpp
    src/price_calculator.cpp
    src/opportunity_scanner.cpp
    bindings/ffi.cpp
)

# Header files
set(HOTPATH_HEADERS
    include/types.hpp
    include/simd_math.hpp
    include/price_calculator.hpp
    include/opportunity_scanner.hpp
    bindings/ffi.hpp
)

# Static library for internal use
add_library(matrix_hotpath_static STATIC ${HOTPATH_SOURCES} ${HOTPATH_HEADERS})
target_include_directories(matrix_hotpath_static PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)

# Shared library for FFI
add_library(matrix_hotpath SHARED ${HOTPATH_SOURCES} ${HOTPATH_HEADERS})
target_include_directories(matrix_hotpath PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)

# Export symbols for FFI
if(MSVC)
    target_compile_definitions(matrix_hotpath PRIVATE HOTPATH_EXPORTS)
endif()

# Benchmark executable
add_executable(hotpath_bench benchmark/bench_main.cpp)
target_link_libraries(hotpath_bench matrix_hotpath_static)

# Tests
enable_testing()
add_executable(hotpath_tests tests/test_main.cpp)
target_link_libraries(hotpath_tests matrix_hotpath_static)
add_test(NAME HotpathTests COMMAND hotpath_tests)

# Install
install(TARGETS matrix_hotpath matrix_hotpath_static
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
    RUNTIME DESTINATION bin
)
install(FILES ${HOTPATH_HEADERS} DESTINATION include/matrix_hotpath)
