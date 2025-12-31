"""
ORACLE - Price Prediction Engine

"You do not truly know someone until you fight them."

Sees the future, predicts price movements and opportunities.
Aggregates prices from multiple sources and detects arbitrage.
"""

from .aggregator import PriceAggregator
from .detector import ArbitrageDetector

__all__ = ["PriceAggregator", "ArbitrageDetector"]
