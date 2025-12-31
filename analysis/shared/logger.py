"""
Logging utilities for Matrix Python agents.
"""

import logging
import sys
from typing import Any, Dict, Optional

import structlog
from structlog.types import Processor


def get_logger(name: str) -> structlog.BoundLogger:
    """Get a structured logger for an agent."""
    return structlog.get_logger(name)


class AgentLogger:
    """Agent-specific logger with context."""

    def __init__(self, agent_name: str):
        self.logger = structlog.get_logger(agent_name)
        self.agent_name = agent_name

    def info(self, message: str, **context: Any) -> None:
        """Log info message."""
        self.logger.info(message, agent=self.agent_name, **context)

    def warning(self, message: str, **context: Any) -> None:
        """Log warning message."""
        self.logger.warning(message, agent=self.agent_name, **context)

    def error(self, message: str, **context: Any) -> None:
        """Log error message."""
        self.logger.error(message, agent=self.agent_name, **context)

    def debug(self, message: str, **context: Any) -> None:
        """Log debug message."""
        self.logger.debug(message, agent=self.agent_name, **context)

    def exception(self, message: str, **context: Any) -> None:
        """Log exception with traceback."""
        self.logger.exception(message, agent=self.agent_name, **context)

    def bind(self, **context: Any) -> "AgentLogger":
        """Create a new logger with additional bound context."""
        new_logger = AgentLogger(self.agent_name)
        new_logger.logger = self.logger.bind(**context)
        return new_logger


def configure_logging(
    level: str = "INFO",
    json_format: bool = False,
) -> None:
    """Configure structured logging for the application."""

    # Set up standard logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, level.upper()),
    )

    # Configure structlog processors
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if json_format:
        # JSON format for production
        processors: list[Processor] = shared_processors + [
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]
    else:
        # Console format for development
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper())
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


# Configure on import with defaults
configure_logging()
