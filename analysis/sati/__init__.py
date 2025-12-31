"""
SATI - Machine Learning Agent

"I made a choice, and that choice was to love."

Program created from love of patterns, learns optimal strategies.
Trains models on historical data and predicts opportunity success.
"""

from .models.gas_optimizer import GasOptimizer
from .models.opportunity_predictor import OpportunityPredictor

__all__ = ["OpportunityPredictor", "GasOptimizer"]
