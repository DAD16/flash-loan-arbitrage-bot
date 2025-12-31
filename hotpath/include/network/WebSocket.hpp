#pragma once

#include <string>
#include <functional>
#include <memory>
#include <atomic>

namespace matrix::network {

/**
 * WebSocket Client - Async WebSocket connection for price feeds
 *
 * Uses io_uring for kernel bypass on Linux for minimal latency.
 * Falls back to epoll on systems without io_uring support.
 *
 * Performance target: <1ms message latency
 */
class WebSocketClient {
public:
    using MessageCallback = std::function<void(const std::string& message)>;
    using ErrorCallback = std::function<void(const std::string& error)>;
    using ConnectCallback = std::function<void()>;

    struct Config {
        std::string url;
        int reconnect_delay_ms = 1000;
        int ping_interval_ms = 30000;
        int timeout_ms = 5000;
        bool use_io_uring = true;
    };

    explicit WebSocketClient(const Config& config);
    ~WebSocketClient();

    // Connection management
    void connect();
    void disconnect();
    [[nodiscard]] bool is_connected() const noexcept;

    // Send message
    void send(const std::string& message);

    // Callbacks
    void on_message(MessageCallback callback);
    void on_error(ErrorCallback callback);
    void on_connect(ConnectCallback callback);

    // Statistics
    [[nodiscard]] uint64_t messages_received() const noexcept;
    [[nodiscard]] uint64_t bytes_received() const noexcept;
    [[nodiscard]] uint64_t latency_ns() const noexcept;

private:
    Config config_;
    std::atomic<bool> connected_{false};

    MessageCallback message_callback_;
    ErrorCallback error_callback_;
    ConnectCallback connect_callback_;

    uint64_t messages_received_ = 0;
    uint64_t bytes_received_ = 0;
    uint64_t last_latency_ns_ = 0;

    // Implementation details (platform-specific)
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

/**
 * WebSocket Manager - Manages multiple WebSocket connections
 *
 * Used to connect to multiple price feed sources simultaneously.
 */
class WebSocketManager {
public:
    WebSocketManager();
    ~WebSocketManager();

    // Add a new connection
    void add_connection(const std::string& name, const WebSocketClient::Config& config);

    // Remove a connection
    void remove_connection(const std::string& name);

    // Get connection by name
    [[nodiscard]] WebSocketClient* get_connection(const std::string& name);

    // Start all connections
    void start_all();

    // Stop all connections
    void stop_all();

    // Run event loop (blocking)
    void run();

    // Stop event loop
    void stop();

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace matrix::network
