"""
SATI - Opportunity Success Predictor

Predicts the probability of arbitrage opportunity success.
"""

from dataclasses import dataclass

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler

from shared import AgentLogger, Opportunity


@dataclass
class PredictionResult:
    """Result of opportunity prediction."""
    success_probability: float
    confidence: float
    features: dict[str, float]
    recommendation: str  # "execute", "skip", "uncertain"


class OpportunityPredictor:
    """
    ML model to predict arbitrage opportunity success.

    Uses gradient boosting on features like:
    - Expected profit
    - Gas estimate
    - Path length
    - Liquidity depth
    - Historical success rate for similar opportunities
    """

    def __init__(self):
        self.logger = AgentLogger("SATI-PREDICTOR")
        self.model: GradientBoostingClassifier | None = None
        self.scaler = StandardScaler()
        self.is_trained = False

        # Feature names for explainability
        self.feature_names = [
            "profit_eth",
            "gas_estimate",
            "path_length",
            "min_liquidity",
            "profit_to_gas_ratio",
            "confidence_score",
            "time_of_day_sin",
            "time_of_day_cos",
        ]

        self.logger.info("Opportunity predictor initialized")

    def train(
        self,
        opportunities: list[Opportunity],
        outcomes: list[bool],
    ) -> dict:
        """Train the model on historical data."""
        if len(opportunities) < 100:
            self.logger.warning("Insufficient training data", count=len(opportunities))
            return {"status": "insufficient_data", "count": len(opportunities)}

        self.logger.info("Training opportunity predictor", samples=len(opportunities))

        # Extract features
        X = np.array([self._extract_features(opp) for opp in opportunities])
        y = np.array(outcomes).astype(int)

        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        # Train model
        self.model = GradientBoostingClassifier(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42,
        )
        self.model.fit(X_scaled, y)
        self.is_trained = True

        # Calculate training metrics
        train_score = self.model.score(X_scaled, y)
        feature_importance = dict(zip(
            self.feature_names,
            self.model.feature_importances_,
            strict=True,
        ))

        self.logger.info(
            "Training completed",
            accuracy=round(train_score, 4),
            top_feature=max(feature_importance, key=feature_importance.get),
        )

        return {
            "status": "success",
            "accuracy": train_score,
            "feature_importance": feature_importance,
        }

    def predict(self, opportunity: Opportunity) -> PredictionResult:
        """Predict success probability for an opportunity."""
        if not self.is_trained or self.model is None:
            # Fallback to heuristic-based prediction
            return self._heuristic_predict(opportunity)

        # Extract and scale features
        features = self._extract_features(opportunity)
        X = np.array([features])
        X_scaled = self.scaler.transform(X)

        # Get probability
        prob = self.model.predict_proba(X_scaled)[0][1]

        # Calculate confidence based on probability distance from 0.5
        confidence = abs(prob - 0.5) * 2

        # Make recommendation
        if prob >= 0.7:
            recommendation = "execute"
        elif prob <= 0.3:
            recommendation = "skip"
        else:
            recommendation = "uncertain"

        return PredictionResult(
            success_probability=prob,
            confidence=confidence,
            features=dict(zip(self.feature_names, features, strict=True)),
            recommendation=recommendation,
        )

    def _extract_features(self, opportunity: Opportunity) -> list[float]:
        """Extract features from an opportunity."""
        import math
        from datetime import datetime

        # Basic features
        profit_eth = opportunity.profit_wei / 1e18
        gas_estimate = opportunity.gas_estimate
        path_length = len(opportunity.path)

        # Calculate minimum liquidity across path (placeholder)
        min_liquidity = opportunity.flash_loan_amount / 1e18

        # Profit to gas ratio
        gas_cost_eth = (gas_estimate * 30 * 1e9) / 1e18  # Assuming 30 gwei
        profit_to_gas = profit_eth / max(gas_cost_eth, 0.0001)

        # Time features (cyclical encoding)
        now = datetime.now()
        hour_of_day = now.hour + now.minute / 60
        time_sin = math.sin(2 * math.pi * hour_of_day / 24)
        time_cos = math.cos(2 * math.pi * hour_of_day / 24)

        return [
            profit_eth,
            gas_estimate,
            path_length,
            min_liquidity,
            profit_to_gas,
            opportunity.confidence,
            time_sin,
            time_cos,
        ]

    def _heuristic_predict(self, opportunity: Opportunity) -> PredictionResult:
        """Fallback heuristic-based prediction."""
        features = self._extract_features(opportunity)
        feature_dict = dict(zip(self.feature_names, features, strict=True))

        # Simple heuristics
        profit_eth = feature_dict["profit_eth"]
        profit_to_gas = feature_dict["profit_to_gas_ratio"]
        path_length = feature_dict["path_length"]

        # Score based on heuristics
        score = 0.5

        # Higher profit is better
        if profit_eth > 0.01:
            score += 0.15
        elif profit_eth > 0.005:
            score += 0.1

        # Better profit/gas ratio is better
        if profit_to_gas > 5:
            score += 0.15
        elif profit_to_gas > 2:
            score += 0.1

        # Shorter paths are more reliable
        if path_length <= 3:
            score += 0.1
        elif path_length > 4:
            score -= 0.1

        # Clamp to [0, 1]
        score = max(0.1, min(0.9, score))

        if score >= 0.65:
            recommendation = "execute"
        elif score <= 0.35:
            recommendation = "skip"
        else:
            recommendation = "uncertain"

        return PredictionResult(
            success_probability=score,
            confidence=0.5,  # Lower confidence for heuristic
            features=feature_dict,
            recommendation=recommendation,
        )

    def get_stats(self) -> dict:
        """Get model statistics."""
        return {
            "is_trained": self.is_trained,
            "feature_count": len(self.feature_names),
        }
