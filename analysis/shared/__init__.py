"""
Matrix Shared - Common types and utilities for Python analysis agents.
"""

from .config import MatrixConfig, get_config
from .logger import AgentLogger, get_logger
from .types import (
    AgentHealth,
    AgentStatus,
    ChainId,
    DexId,
    ExecutionResult,
    Opportunity,
    PriceUpdate,
    SwapStep,
)

__all__ = [
    # Types
    "ChainId",
    "DexId",
    "PriceUpdate",
    "Opportunity",
    "SwapStep",
    "ExecutionResult",
    "AgentStatus",
    "AgentHealth",
    # Config
    "get_config",
    "MatrixConfig",
    # Logger
    "get_logger",
    "AgentLogger",
]
