"""
Configuration management for Matrix Python agents.
"""

import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class RpcConfig(BaseSettings):
    """RPC provider configuration."""
    name: str = ""
    http_url: str = ""
    ws_url: str = ""
    api_key: str | None = None
    priority: int = 0
    max_retries: int = 3
    timeout_ms: int = 5000


class RiskConfig(BaseSettings):
    """Risk management configuration."""
    max_position_size_eth: float = 50.0
    max_total_exposure_eth: float = 200.0
    max_concurrent_positions: int = 5
    max_hourly_loss_eth: float = 5.0
    max_daily_loss_eth: float = 20.0
    min_profit_eth: float = 0.001
    max_slippage_bps: int = 100
    max_gas_price_gwei: float = 300.0
    failure_cooldown_ms: int = 5000


class MonitoringConfig(BaseSettings):
    """Monitoring configuration."""
    prometheus_port: int = 9090
    health_check_port: int = 8080
    log_level: str = "INFO"
    metrics_interval_ms: int = 1000


class KafkaConfig(BaseSettings):
    """Kafka configuration."""
    brokers: str = "localhost:9092"
    group_id: str = "matrix-analysis"

    @property
    def broker_list(self) -> list[str]:
        return self.brokers.split(",")


class RedisConfig(BaseSettings):
    """Redis configuration."""
    host: str = "localhost"
    port: int = 6379
    db: int = 0
    password: str | None = None


class DatabaseConfig(BaseSettings):
    """Database configuration."""
    host: str = "localhost"
    port: int = 5432
    database: str = "matrix"
    user: str = "matrix"
    password: str = ""


class MatrixConfig(BaseSettings):
    """Main Matrix configuration."""

    model_config = {"env_prefix": "MATRIX_", "env_nested_delimiter": "__"}

    # Environment
    environment: str = Field(default="development")

    # Risk
    risk: RiskConfig = Field(default_factory=RiskConfig)

    # Monitoring
    monitoring: MonitoringConfig = Field(default_factory=MonitoringConfig)

    # Infrastructure
    kafka: KafkaConfig = Field(default_factory=KafkaConfig)
    redis: RedisConfig = Field(default_factory=RedisConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)

    # Chain RPC URLs
    eth_rpc_url: str = Field(default="https://eth.llamarpc.com")
    eth_ws_url: str = Field(default="wss://eth.llamarpc.com")
    arb_rpc_url: str = Field(default="https://arb1.arbitrum.io/rpc")
    arb_ws_url: str = Field(default="wss://arb1.arbitrum.io/ws")
    op_rpc_url: str = Field(default="https://mainnet.optimism.io")
    op_ws_url: str = Field(default="wss://mainnet.optimism.io")
    base_rpc_url: str = Field(default="https://mainnet.base.org")
    base_ws_url: str = Field(default="wss://mainnet.base.org")
    bsc_rpc_url: str = Field(default="https://bsc-dataseed.binance.org")
    bsc_ws_url: str = Field(default="wss://bsc-ws-node.nariox.org")

    # LLM API Keys (optional)
    openai_api_key: str | None = Field(default=None)
    anthropic_api_key: str | None = Field(default=None)

    def is_production(self) -> bool:
        """Check if running in production."""
        return self.environment == "production"

    def is_development(self) -> bool:
        """Check if running in development."""
        return self.environment == "development"

    def get_rpc_url(self, chain: str) -> str:
        """Get RPC URL for a chain."""
        urls = {
            "ethereum": self.eth_rpc_url,
            "arbitrum": self.arb_rpc_url,
            "optimism": self.op_rpc_url,
            "base": self.base_rpc_url,
            "bsc": self.bsc_rpc_url,
        }
        return urls.get(chain, "")

    def get_ws_url(self, chain: str) -> str:
        """Get WebSocket URL for a chain."""
        urls = {
            "ethereum": self.eth_ws_url,
            "arbitrum": self.arb_ws_url,
            "optimism": self.op_ws_url,
            "base": self.base_ws_url,
            "bsc": self.bsc_ws_url,
        }
        return urls.get(chain, "")


@lru_cache
def get_config() -> MatrixConfig:
    """Get cached configuration instance."""
    # Load .env file if present
    from dotenv import load_dotenv
    load_dotenv()

    return MatrixConfig()


def require_env(name: str) -> str:
    """Get required environment variable."""
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def get_env(name: str, default: str = "") -> str:
    """Get optional environment variable with default."""
    return os.environ.get(name, default)
