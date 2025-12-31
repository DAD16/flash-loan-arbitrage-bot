"""
PERSEPHONE - Sentiment Analysis Implementation
"""

from dataclasses import dataclass
from enum import Enum

from shared import AgentLogger


class SentimentLevel(str, Enum):
    """Market sentiment levels."""
    EXTREME_FEAR = "extreme_fear"
    FEAR = "fear"
    NEUTRAL = "neutral"
    GREED = "greed"
    EXTREME_GREED = "extreme_greed"


@dataclass
class SentimentSignal:
    """Sentiment signal from a source."""
    source: str
    timestamp_ms: int
    sentiment_score: float  # -1 to 1
    confidence: float  # 0 to 1
    keywords: list[str]
    raw_text: str | None = None


@dataclass
class MarketSentiment:
    """Aggregated market sentiment."""
    level: SentimentLevel
    score: float  # -1 to 1
    confidence: float
    signals: list[SentimentSignal]
    recommendation: str  # "bullish", "bearish", "neutral"


class SentimentAnalyzer:
    """
    Analyzes market sentiment from multiple sources.

    Sources include:
    - Crypto Twitter
    - Discord communities
    - News articles
    - On-chain whale activity
    """

    def __init__(self):
        self.logger = AgentLogger("PERSEPHONE")
        self.signals: list[SentimentSignal] = []
        self.max_signals = 1000

        # Keywords for sentiment analysis
        self.bullish_keywords = [
            "moon", "pump", "bullish", "buy", "long", "breakout",
            "accumulate", "undervalued", "gem", "rocket",
        ]
        self.bearish_keywords = [
            "dump", "crash", "bearish", "sell", "short", "breakdown",
            "overvalued", "scam", "rug", "rekt",
        ]

        self.logger.info("Sentiment analyzer initialized")

    def add_signal(self, signal: SentimentSignal) -> None:
        """Add a sentiment signal."""
        self.signals.append(signal)

        # Trim old signals
        if len(self.signals) > self.max_signals:
            self.signals = self.signals[-self.max_signals:]

    def analyze_text(self, text: str, source: str) -> SentimentSignal:
        """Analyze sentiment from text."""
        import time

        text_lower = text.lower()

        # Count keyword matches
        bullish_count = sum(1 for kw in self.bullish_keywords if kw in text_lower)
        bearish_count = sum(1 for kw in self.bearish_keywords if kw in text_lower)

        total = bullish_count + bearish_count
        if total == 0:
            score = 0.0
            confidence = 0.3
        else:
            score = (bullish_count - bearish_count) / total
            confidence = min(1.0, total / 5)  # More keywords = higher confidence

        # Extract matched keywords
        keywords = []
        for kw in self.bullish_keywords + self.bearish_keywords:
            if kw in text_lower:
                keywords.append(kw)

        signal = SentimentSignal(
            source=source,
            timestamp_ms=int(time.time() * 1000),
            sentiment_score=score,
            confidence=confidence,
            keywords=keywords,
            raw_text=text[:500] if len(text) > 500 else text,
        )

        self.add_signal(signal)
        return signal

    def get_market_sentiment(
        self,
        time_window_ms: int = 3600000,  # 1 hour
    ) -> MarketSentiment:
        """Get aggregated market sentiment."""
        import time

        current_time = int(time.time() * 1000)
        cutoff = current_time - time_window_ms

        # Filter recent signals
        recent = [s for s in self.signals if s.timestamp_ms >= cutoff]

        if not recent:
            return MarketSentiment(
                level=SentimentLevel.NEUTRAL,
                score=0.0,
                confidence=0.0,
                signals=[],
                recommendation="neutral",
            )

        # Weighted average by confidence
        total_weight = sum(s.confidence for s in recent)
        if total_weight == 0:
            avg_score = 0.0
        else:
            avg_score = sum(s.sentiment_score * s.confidence for s in recent) / total_weight

        # Average confidence
        avg_confidence = sum(s.confidence for s in recent) / len(recent)

        # Determine level
        if avg_score <= -0.6:
            level = SentimentLevel.EXTREME_FEAR
        elif avg_score <= -0.2:
            level = SentimentLevel.FEAR
        elif avg_score >= 0.6:
            level = SentimentLevel.EXTREME_GREED
        elif avg_score >= 0.2:
            level = SentimentLevel.GREED
        else:
            level = SentimentLevel.NEUTRAL

        # Recommendation (contrarian by default)
        if level in [SentimentLevel.EXTREME_FEAR, SentimentLevel.FEAR]:
            recommendation = "bullish"  # Buy fear
        elif level in [SentimentLevel.EXTREME_GREED, SentimentLevel.GREED]:
            recommendation = "bearish"  # Sell greed
        else:
            recommendation = "neutral"

        return MarketSentiment(
            level=level,
            score=avg_score,
            confidence=avg_confidence,
            signals=recent,
            recommendation=recommendation,
        )

    def get_stats(self) -> dict:
        """Get analyzer statistics."""
        return {
            "total_signals": len(self.signals),
            "sources": list({s.source for s in self.signals}),
        }
