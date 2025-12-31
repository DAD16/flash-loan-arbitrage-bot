"""Tests for the SATI gas optimizer."""

import time

import pytest

from sati.models.gas_optimizer import GasOptimizer, GasRecommendation, GasSample


class TestGasOptimizer:
    """Test suite for GasOptimizer."""

    def test_initialization(self):
        """Test optimizer initializes correctly."""
        optimizer = GasOptimizer()
        assert optimizer is not None
        stats = optimizer.get_stats()
        assert "samples_processed" in stats

    def test_add_sample(self):
        """Test adding gas price samples."""
        optimizer = GasOptimizer()

        sample = GasSample(
            timestamp_ms=int(time.time() * 1000),
            base_fee_gwei=30.0,
            priority_fee_gwei=2.0,
            block_utilization=0.6,
        )
        optimizer.add_sample(sample)

        stats = optimizer.get_stats()
        assert stats["samples_processed"] == 1

    def test_get_recommendation_no_data(self):
        """Test recommendation with no historical data."""
        optimizer = GasOptimizer()

        recommendation = optimizer.get_recommendation(urgency="medium")

        assert isinstance(recommendation, GasRecommendation)
        assert recommendation.base_fee_gwei > 0
        assert recommendation.priority_fee_gwei >= 0
        assert recommendation.urgency == "medium"

    def test_get_recommendation_with_data(self):
        """Test recommendation with historical data."""
        optimizer = GasOptimizer()
        ts = int(time.time() * 1000)

        # Add historical samples
        for i in range(20):
            sample = GasSample(
                timestamp_ms=ts - i * 1000,
                base_fee_gwei=30.0 + (i % 5),
                priority_fee_gwei=2.0 + (i % 3) * 0.5,
                block_utilization=0.5 + (i % 10) * 0.02,
            )
            optimizer.add_sample(sample)

        recommendation = optimizer.get_recommendation(urgency="medium")

        assert isinstance(recommendation, GasRecommendation)
        assert recommendation.confidence > 0

    def test_urgency_levels(self):
        """Test different urgency levels."""
        optimizer = GasOptimizer()
        ts = int(time.time() * 1000)

        # Add samples
        for i in range(20):
            optimizer.add_sample(GasSample(
                timestamp_ms=ts - i * 1000,
                base_fee_gwei=30.0,
                priority_fee_gwei=2.0,
                block_utilization=0.5,
            ))

        low = optimizer.get_recommendation(urgency="low")
        medium = optimizer.get_recommendation(urgency="medium")
        high = optimizer.get_recommendation(urgency="high")
        urgent = optimizer.get_recommendation(urgency="urgent")

        # Higher urgency should have higher priority fee
        assert low.priority_fee_gwei <= medium.priority_fee_gwei
        assert medium.priority_fee_gwei <= high.priority_fee_gwei
        assert high.priority_fee_gwei <= urgent.priority_fee_gwei

    def test_deadline_blocks_prediction(self):
        """Test base fee prediction for future blocks."""
        optimizer = GasOptimizer()
        ts = int(time.time() * 1000)

        # Add samples with high utilization (base fee should increase)
        for i in range(20):
            optimizer.add_sample(GasSample(
                timestamp_ms=ts - i * 1000,
                base_fee_gwei=30.0,
                priority_fee_gwei=2.0,
                block_utilization=0.7,  # High utilization
            ))

        rec_1_block = optimizer.get_recommendation(urgency="medium", deadline_blocks=1)
        rec_5_blocks = optimizer.get_recommendation(urgency="medium", deadline_blocks=5)

        # Both should return valid recommendations
        assert rec_1_block.base_fee_gwei > 0
        assert rec_5_blocks.base_fee_gwei > 0

    def test_get_current_prices(self):
        """Test getting current price estimates."""
        optimizer = GasOptimizer()
        ts = int(time.time() * 1000)

        optimizer.add_sample(GasSample(
            timestamp_ms=ts,
            base_fee_gwei=35.0,
            priority_fee_gwei=2.5,
            block_utilization=0.6,
        ))

        prices = optimizer.get_current_prices()

        assert "base_fee_gwei" in prices
        assert "priority_fee_gwei" in prices
        assert "total_gwei" in prices
        assert "sample_count" in prices

    def test_history_size_limit(self):
        """Test that history size is respected."""
        optimizer = GasOptimizer(history_size=10)
        ts = int(time.time() * 1000)

        # Add more samples than history_size
        for i in range(20):
            optimizer.add_sample(GasSample(
                timestamp_ms=ts - i * 1000,
                base_fee_gwei=30.0,
                priority_fee_gwei=2.0,
                block_utilization=0.5,
            ))

        stats = optimizer.get_stats()
        assert stats["history_size"] <= 10

    def test_stats(self):
        """Test statistics tracking."""
        optimizer = GasOptimizer()
        ts = int(time.time() * 1000)

        for i in range(15):
            optimizer.add_sample(GasSample(
                timestamp_ms=ts - i * 1000,
                base_fee_gwei=30.0 + i,
                priority_fee_gwei=2.0 + i * 0.1,
                block_utilization=0.5,
            ))

        stats = optimizer.get_stats()

        assert stats["samples_processed"] == 15
        assert "avg_base_fee" in stats
        assert "avg_priority_fee" in stats
        assert "priority_fee_std" in stats

    def test_total_gwei_calculation(self):
        """Test that total gwei is calculated correctly."""
        optimizer = GasOptimizer()

        recommendation = optimizer.get_recommendation(urgency="medium")

        expected_total = recommendation.base_fee_gwei + recommendation.priority_fee_gwei
        assert abs(recommendation.total_gwei - expected_total) < 0.01

    def test_confidence_increases_with_samples(self):
        """Test that confidence increases with more samples."""
        optimizer = GasOptimizer()
        ts = int(time.time() * 1000)

        # Get recommendation with few samples
        for i in range(5):
            optimizer.add_sample(GasSample(
                timestamp_ms=ts - i * 1000,
                base_fee_gwei=30.0,
                priority_fee_gwei=2.0,
                block_utilization=0.5,
            ))
        rec_few = optimizer.get_recommendation()

        # Add more samples
        for i in range(95):
            optimizer.add_sample(GasSample(
                timestamp_ms=ts - (i + 5) * 1000,
                base_fee_gwei=30.0,
                priority_fee_gwei=2.0,
                block_utilization=0.5,
            ))
        rec_many = optimizer.get_recommendation()

        # More samples should give higher confidence
        assert rec_many.confidence >= rec_few.confidence
