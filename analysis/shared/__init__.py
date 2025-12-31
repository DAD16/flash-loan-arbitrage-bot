"""
Matrix Shared - Common types and utilities for Python analysis agents.
"""

from .types import (
    ChainId,
    DexId,
    PriceUpdate,
    Opportunity,
    SwapStep,
    ExecutionResult,
    AgentStatus,
    AgentHealth,
)
from .config import get_config, MatrixConfig
from .logger import get_logger, AgentLogger

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
