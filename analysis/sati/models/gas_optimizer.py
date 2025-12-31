"""
SATI - Gas Price Optimizer

Optimizes gas pricing strategy for transaction submission.
"""

from collections import deque
from dataclasses import dataclass

import numpy as np

from shared import AgentLogger


@dataclass
class GasRecommendation:
    """Gas price recommendation."""
    base_fee_gwei: float
    priority_fee_gwei: float
    total_gwei: float
    confidence: float
    urgency: str  # "low", "medium", "high"


@dataclass
class GasSample:
    """Historical gas price sample."""
    timestamp_ms: int
    base_fee_gwei: float
    priority_fee_gwei: float
    block_utilization: float


class GasOptimizer:
    """
    Optimizes gas pricing based on network conditions.

    Uses historical data and ML to predict optimal gas prices
    for different urgency levels.
    """

    def __init__(
        self,
        history_size: int = 1000,
        update_interval_ms: int = 1000,
    ):
        self.logger = AgentLogger("SATI-GAS")
        self.history_size = history_size
        self.update_interval_ms = update_interval_ms

        # Historical samples
        self.samples: deque[GasSample] = deque(maxlen=history_size)

        # Current estimates
        self.current_base_fee: float = 30.0
        self.current_priority_fee: float = 1.0

        # Statistics
        self.samples_processed = 0

        self.logger.info("Gas optimizer initialized")

    def add_sample(self, sample: GasSample) -> None:
        """Add a gas price sample."""
        self.samples.append(sample)
        self.samples_processed += 1

        # Update current estimates
        self._update_estimates()

    def get_recommendation(
        self,
        urgency: str = "medium",
        deadline_blocks: int = 3,
    ) -> GasRecommendation:
        """Get gas price recommendation."""
        if len(self.samples) < 10:
            # Not enough data, use current values with buffer
            multiplier = self._get_urgency_multiplier(urgency)
            return GasRecommendation(
                base_fee_gwei=self.current_base_fee,
                priority_fee_gwei=self.current_priority_fee * multiplier,
                total_gwei=self.current_base_fee + self.current_priority_fee * multiplier,
                confidence=0.5,
                urgency=urgency,
            )

        # Calculate percentiles for priority fee
        priority_fees = [s.priority_fee_gwei for s in self.samples]

        percentile_map = {
            "low": 25,
            "medium": 50,
            "high": 75,
            "urgent": 90,
        }
        percentile = percentile_map.get(urgency, 50)
        recommended_priority = np.percentile(priority_fees, percentile)

        # Predict base fee for target block
        predicted_base = self._predict_base_fee(deadline_blocks)

        # Calculate confidence based on sample count and variance
        confidence = min(1.0, len(self.samples) / 100)
        variance = np.var(priority_fees)
        if variance > 100:
            confidence *= 0.7

        return GasRecommendation(
            base_fee_gwei=predicted_base,
            priority_fee_gwei=recommended_priority,
            total_gwei=predicted_base + recommended_priority,
            confidence=confidence,
            urgency=urgency,
        )

    def _update_estimates(self) -> None:
        """Update current gas estimates from recent samples."""
        if not self.samples:
            return

        # Use last 10 samples for current estimate
        recent = list(self.samples)[-10:]
        self.current_base_fee = np.mean([s.base_fee_gwei for s in recent])
        self.current_priority_fee = np.mean([s.priority_fee_gwei for s in recent])

    def _predict_base_fee(self, blocks_ahead: int) -> float:
        """Predict base fee for future blocks."""
        if len(self.samples) < 10:
            return self.current_base_fee

        # Simple EIP-1559 prediction based on recent utilization
        recent = list(self.samples)[-10:]
        avg_utilization = np.mean([s.block_utilization for s in recent])
        avg_base_fee = np.mean([s.base_fee_gwei for s in recent])

        # Base fee adjustment per block
        # If utilization > 50%: base fee increases
        # If utilization < 50%: base fee decreases
        adjustment_per_block = 1.0
        if avg_utilization > 0.5:
            adjustment_per_block = 1 + (avg_utilization - 0.5) * 0.25
        else:
            adjustment_per_block = 1 - (0.5 - avg_utilization) * 0.125

        predicted = avg_base_fee * (adjustment_per_block ** blocks_ahead)
        return max(1.0, predicted)  # Minimum 1 gwei

    def _get_urgency_multiplier(self, urgency: str) -> float:
        """Get priority fee multiplier for urgency level."""
        multipliers = {
            "low": 1.0,
            "medium": 1.5,
            "high": 2.0,
            "urgent": 3.0,
        }
        return multipliers.get(urgency, 1.5)

    def get_current_prices(self) -> dict:
        """Get current gas price estimates."""
        return {
            "base_fee_gwei": self.current_base_fee,
            "priority_fee_gwei": self.current_priority_fee,
            "total_gwei": self.current_base_fee + self.current_priority_fee,
            "sample_count": len(self.samples),
        }

    def get_stats(self) -> dict:
        """Get optimizer statistics."""
        if not self.samples:
            return {
                "samples_processed": self.samples_processed,
                "history_size": 0,
            }

        priority_fees = [s.priority_fee_gwei for s in self.samples]

        return {
            "samples_processed": self.samples_processed,
            "history_size": len(self.samples),
            "avg_base_fee": round(self.current_base_fee, 2),
            "avg_priority_fee": round(self.current_priority_fee, 2),
            "priority_fee_std": round(np.std(priority_fees), 2),
        }
