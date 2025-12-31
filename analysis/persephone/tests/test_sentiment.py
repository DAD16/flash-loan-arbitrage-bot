"""Tests for the Persephone sentiment analyzer."""

import time

import pytest

from persephone.sentiment import (
    SentimentAnalyzer,
    SentimentSignal,
    MarketSentiment,
    SentimentLevel,
)


class TestSentimentAnalyzer:
    """Test suite for SentimentAnalyzer."""

    def test_initialization(self):
        """Test analyzer initializes correctly."""
        analyzer = SentimentAnalyzer()
        assert analyzer is not None
        stats = analyzer.get_stats()
        assert stats["total_signals"] == 0

    def test_analyze_bullish_text(self):
        """Test analysis of bullish text."""
        analyzer = SentimentAnalyzer()

        signal = analyzer.analyze_text(
            "ETH is going to the moon! Super bullish on this pump!",
            source="twitter"
        )

        assert isinstance(signal, SentimentSignal)
        assert signal.sentiment_score > 0  # Bullish should be positive
        assert signal.source == "twitter"
        assert len(signal.keywords) > 0

    def test_analyze_bearish_text(self):
        """Test analysis of bearish text."""
        analyzer = SentimentAnalyzer()

        signal = analyzer.analyze_text(
            "This looks like a rug pull. Market is going to crash. So bearish!",
            source="discord"
        )

        assert isinstance(signal, SentimentSignal)
        assert signal.sentiment_score < 0  # Bearish should be negative
        assert signal.source == "discord"

    def test_analyze_neutral_text(self):
        """Test analysis of neutral text."""
        analyzer = SentimentAnalyzer()

        signal = analyzer.analyze_text(
            "The market is trading sideways today. Volume is average.",
            source="news"
        )

        assert isinstance(signal, SentimentSignal)
        # Neutral text should be close to 0
        assert -0.5 <= signal.sentiment_score <= 0.5

    def test_add_signal(self):
        """Test adding signals manually."""
        analyzer = SentimentAnalyzer()

        signal = SentimentSignal(
            source="manual",
            timestamp_ms=int(time.time() * 1000),
            sentiment_score=0.8,
            confidence=0.9,
            keywords=["bullish", "moon"],
        )

        analyzer.add_signal(signal)
        stats = analyzer.get_stats()
        assert stats["total_signals"] == 1

    def test_get_market_sentiment_empty(self):
        """Test market sentiment with no signals."""
        analyzer = SentimentAnalyzer()

        sentiment = analyzer.get_market_sentiment()

        assert isinstance(sentiment, MarketSentiment)
        assert sentiment.level == SentimentLevel.NEUTRAL
        assert sentiment.confidence == 0.0

    def test_get_market_sentiment_bullish(self):
        """Test market sentiment with bullish signals."""
        analyzer = SentimentAnalyzer()

        # Add multiple bullish signals
        for i in range(5):
            analyzer.analyze_text(
                f"So bullish! Going to moon! Buy buy buy! #{i}",
                source="twitter"
            )

        sentiment = analyzer.get_market_sentiment()

        assert sentiment.score > 0
        assert sentiment.level in [SentimentLevel.GREED, SentimentLevel.EXTREME_GREED]
        # Contrarian recommendation
        assert sentiment.recommendation == "bearish"

    def test_get_market_sentiment_bearish(self):
        """Test market sentiment with bearish signals."""
        analyzer = SentimentAnalyzer()

        # Add multiple bearish signals
        for i in range(5):
            analyzer.analyze_text(
                f"Crash incoming! Dump it! This is a scam! #{i}",
                source="twitter"
            )

        sentiment = analyzer.get_market_sentiment()

        assert sentiment.score < 0
        assert sentiment.level in [SentimentLevel.FEAR, SentimentLevel.EXTREME_FEAR]
        # Contrarian recommendation
        assert sentiment.recommendation == "bullish"

    def test_time_window_filtering(self):
        """Test that time window properly filters signals."""
        analyzer = SentimentAnalyzer()

        # Add a signal
        analyzer.analyze_text("Bullish moon pump!", source="twitter")

        # Get sentiment with 1 hour time window
        sentiment = analyzer.get_market_sentiment(time_window_ms=3600000)
        assert len(sentiment.signals) > 0

    def test_signal_truncation(self):
        """Test that old signals are truncated."""
        analyzer = SentimentAnalyzer()
        analyzer.max_signals = 10  # Set low limit for testing

        # Add more signals than the limit
        for i in range(15):
            analyzer.analyze_text(f"Test message {i}", source="test")

        stats = analyzer.get_stats()
        assert stats["total_signals"] <= 10

    def test_weighted_sentiment(self):
        """Test that confidence-weighted averaging works."""
        analyzer = SentimentAnalyzer()
        ts = int(time.time() * 1000)

        # Add high confidence bullish signal
        signal1 = SentimentSignal(
            source="expert",
            timestamp_ms=ts,
            sentiment_score=0.9,
            confidence=0.95,
            keywords=["bullish"],
        )

        # Add low confidence bearish signal
        signal2 = SentimentSignal(
            source="random",
            timestamp_ms=ts,
            sentiment_score=-0.9,
            confidence=0.1,
            keywords=["bearish"],
        )

        analyzer.add_signal(signal1)
        analyzer.add_signal(signal2)

        sentiment = analyzer.get_market_sentiment()

        # High confidence bullish should outweigh low confidence bearish
        assert sentiment.score > 0

    def test_multiple_sources(self):
        """Test signals from multiple sources."""
        analyzer = SentimentAnalyzer()

        analyzer.analyze_text("Bullish from Twitter!", source="twitter")
        analyzer.analyze_text("Bearish from Discord!", source="discord")
        analyzer.analyze_text("Neutral from news.", source="news")

        stats = analyzer.get_stats()
        assert len(stats["sources"]) == 3
        assert "twitter" in stats["sources"]
        assert "discord" in stats["sources"]
        assert "news" in stats["sources"]

    def test_sentiment_levels(self):
        """Test sentiment level classification."""
        analyzer = SentimentAnalyzer()
        ts = int(time.time() * 1000)

        # Test extreme fear
        signal = SentimentSignal(
            source="test",
            timestamp_ms=ts,
            sentiment_score=-0.8,
            confidence=1.0,
            keywords=[],
        )
        analyzer.add_signal(signal)
        sentiment = analyzer.get_market_sentiment()
        assert sentiment.level == SentimentLevel.EXTREME_FEAR

    def test_raw_text_storage(self):
        """Test that raw text is stored (truncated if needed)."""
        analyzer = SentimentAnalyzer()

        long_text = "Bullish! " * 100  # Very long text
        signal = analyzer.analyze_text(long_text, source="test")

        # Raw text should be truncated to 500 chars
        assert signal.raw_text is not None
        assert len(signal.raw_text) <= 500

    def test_keyword_detection(self):
        """Test keyword detection in text."""
        analyzer = SentimentAnalyzer()

        # Test bullish keywords
        signal = analyzer.analyze_text("This is going to moon and pump!", source="test")
        assert "moon" in signal.keywords or "pump" in signal.keywords

        # Test bearish keywords
        signal = analyzer.analyze_text("This will crash and dump!", source="test")
        assert "crash" in signal.keywords or "dump" in signal.keywords
