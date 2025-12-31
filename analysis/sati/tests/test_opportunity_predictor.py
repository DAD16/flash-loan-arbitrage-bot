"""Tests for the SATI opportunity predictor."""

import pytest

from sati.models.opportunity_predictor import OpportunityPredictor, PredictionResult
from shared import Opportunity, ChainId, DexId, SwapStep


def make_opportunity(
    profit_wei: int = 10_000_000_000_000_000,
    gas_estimate: int = 300_000,
    path_length: int = 2,
    confidence: float = 0.8,
) -> Opportunity:
    """Helper to create test opportunities."""
    path = [
        SwapStep(
            dex=DexId.UNISWAP_V3,
            pool=f"0x000{i}",
            token_in="WETH" if i == 0 else "USDC",
            token_out="USDC" if i == 0 else "WETH",
            amount_in=10**18,
            amount_out=10**18,
        )
        for i in range(path_length)
    ]

    return Opportunity(
        id=1,
        timestamp_ms=1234567890000,
        chain=ChainId.ETHEREUM,
        profit_wei=profit_wei,
        gas_estimate=gas_estimate,
        path=path,
        flash_loan_token="WETH",
        flash_loan_amount=10**18,
        confidence=confidence,
    )


class TestOpportunityPredictor:
    """Test suite for OpportunityPredictor."""

    def test_initialization(self):
        """Test predictor initializes correctly."""
        predictor = OpportunityPredictor()
        assert predictor is not None
        assert predictor.is_trained is False
        stats = predictor.get_stats()
        assert stats["is_trained"] is False

    def test_heuristic_prediction(self):
        """Test heuristic prediction when model is not trained."""
        predictor = OpportunityPredictor()
        opportunity = make_opportunity()

        result = predictor.predict(opportunity)

        assert isinstance(result, PredictionResult)
        assert 0 <= result.success_probability <= 1
        assert 0 <= result.confidence <= 1
        assert result.recommendation in ["execute", "skip", "uncertain"]

    def test_prediction_high_profit(self):
        """Test prediction with high profit opportunity."""
        predictor = OpportunityPredictor()
        opportunity = make_opportunity(
            profit_wei=50_000_000_000_000_000,  # 0.05 ETH (high)
            gas_estimate=200_000,
            confidence=0.9,
        )

        result = predictor.predict(opportunity)
        # High profit should generally lead to higher probability
        assert result.success_probability >= 0.5

    def test_prediction_low_profit(self):
        """Test prediction with low profit opportunity."""
        predictor = OpportunityPredictor()
        opportunity = make_opportunity(
            profit_wei=100_000_000_000_000,  # 0.0001 ETH (very low)
            gas_estimate=500_000,  # High gas
            confidence=0.3,
        )

        result = predictor.predict(opportunity)
        # Low profit with high gas should lead to lower probability
        assert isinstance(result, PredictionResult)

    def test_prediction_long_path(self):
        """Test prediction with long swap path."""
        predictor = OpportunityPredictor()
        opportunity = make_opportunity(
            profit_wei=20_000_000_000_000_000,
            gas_estimate=600_000,
            path_length=4,
            confidence=0.7,
        )

        result = predictor.predict(opportunity)
        assert isinstance(result, PredictionResult)

    def test_train_insufficient_data(self):
        """Test training with insufficient data."""
        predictor = OpportunityPredictor()

        # Only 10 samples (less than required 100)
        opportunities = [make_opportunity() for _ in range(10)]
        outcomes = [True] * 5 + [False] * 5

        result = predictor.train(opportunities, outcomes)
        assert result["status"] == "insufficient_data"
        assert predictor.is_trained is False

    def test_train_and_predict(self):
        """Test training and then predicting."""
        predictor = OpportunityPredictor()

        # Generate training data (150 samples)
        opportunities = []
        outcomes = []
        for i in range(150):
            profit = (i % 10 + 1) * 5_000_000_000_000_000
            gas = 200_000 + (i % 5) * 50_000
            opp = make_opportunity(
                profit_wei=profit,
                gas_estimate=gas,
                confidence=0.5 + (i % 5) * 0.1,
            )
            opportunities.append(opp)
            outcomes.append(profit > 25_000_000_000_000_000)

        result = predictor.train(opportunities, outcomes)
        assert result["status"] == "success"
        assert predictor.is_trained is True
        assert "accuracy" in result
        assert "feature_importance" in result

        # Now predict with trained model
        test_opp = make_opportunity(
            profit_wei=30_000_000_000_000_000,
            gas_estimate=250_000,
            confidence=0.8,
        )

        prediction = predictor.predict(test_opp)
        assert isinstance(prediction, PredictionResult)

    def test_feature_extraction(self):
        """Test that features are extracted correctly."""
        predictor = OpportunityPredictor()
        opportunity = make_opportunity()

        result = predictor.predict(opportunity)

        # Check that features dict contains expected keys
        assert "profit_eth" in result.features
        assert "gas_estimate" in result.features
        assert "path_length" in result.features
        assert "confidence_score" in result.features

    def test_recommendation_thresholds(self):
        """Test recommendation thresholds."""
        predictor = OpportunityPredictor()

        # Test various scenarios and check recommendations are valid
        for profit in [1_000_000_000_000_000, 50_000_000_000_000_000]:
            opp = make_opportunity(profit_wei=profit)
            result = predictor.predict(opp)
            assert result.recommendation in ["execute", "skip", "uncertain"]

    def test_stats(self):
        """Test statistics."""
        predictor = OpportunityPredictor()

        stats = predictor.get_stats()
        assert "is_trained" in stats
        assert "feature_count" in stats
        assert stats["feature_count"] > 0
