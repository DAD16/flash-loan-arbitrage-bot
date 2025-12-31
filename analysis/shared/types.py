"""
Shared types for Matrix Python agents.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List


class ChainId(str, Enum):
    """Supported blockchain networks."""
    ETHEREUM = "ethereum"
    ARBITRUM = "arbitrum"
    OPTIMISM = "optimism"
    BASE = "base"
    BSC = "bsc"

    @property
    def chain_id(self) -> int:
        """Get numeric chain ID."""
        chain_ids = {
            ChainId.ETHEREUM: 1,
            ChainId.ARBITRUM: 42161,
            ChainId.OPTIMISM: 10,
            ChainId.BASE: 8453,
            ChainId.BSC: 56,
        }
        return chain_ids[self]


class DexId(str, Enum):
    """Supported DEX protocols."""
    UNISWAP_V3 = "uniswap_v3"
    SUSHISWAP = "sushiswap"
    CURVE = "curve"
    BALANCER = "balancer"
    PANCAKESWAP = "pancakeswap"
    CAMELOT = "camelot"
    VELODROME = "velodrome"
    AERODROME = "aerodrome"


class AgentStatus(str, Enum):
    """Agent status values."""
    STARTING = "starting"
    RUNNING = "running"
    DEGRADED = "degraded"
    STOPPING = "stopping"
    STOPPED = "stopped"
    FAILED = "failed"


@dataclass
class PriceUpdate:
    """Price update from market data feed."""
    timestamp_ms: int
    chain: ChainId
    dex: DexId
    pool: str  # Address
    token0: str  # Address
    token1: str  # Address
    reserve0: int  # Wei
    reserve1: int  # Wei
    price: int  # 18 decimals


@dataclass
class SwapStep:
    """Single swap step in arbitrage path."""
    dex: DexId
    pool: str
    token_in: str
    token_out: str
    amount_in: int
    amount_out: int


@dataclass
class Opportunity:
    """Arbitrage opportunity."""
    id: int
    timestamp_ms: int
    chain: ChainId
    profit_wei: int
    gas_estimate: int
    path: List[SwapStep]
    flash_loan_token: str
    flash_loan_amount: int
    confidence: float = 0.0  # 0-1


@dataclass
class ExecutionResult:
    """Execution result from trade."""
    opportunity_id: int
    tx_hash: str
    success: bool
    actual_profit: int
    gas_used: int
    block_number: int
    timestamp_ms: int


@dataclass
class AgentHealth:
    """Agent health status."""
    name: str
    status: AgentStatus
    last_heartbeat_ms: int
    error_count: int
    metrics: Dict[str, float] = field(default_factory=dict)
