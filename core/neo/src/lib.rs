//! NEO - The Orchestrator
//!
//! Master coordinator that supervises all Matrix agents and makes
//! final execution decisions. Implements OTP-style supervision trees
//! for fault tolerance.
//!
//! # Responsibilities
//! - Coordinate all agent activities
//! - Manage system state via Raft consensus
//! - Handle failover and recovery
//! - Route opportunities to execution

use async_trait::async_trait;
use thiserror::Error;

/// NEO agent errors
#[derive(Error, Debug)]
pub enum NeoError {
    #[error("Agent not found: {0}")]
    AgentNotFound(String),

    #[error("State error: {0}")]
    StateError(String),

    #[error("Supervision error: {0}")]
    SupervisionError(String),
}

/// Agent status
#[derive(Debug, Clone, PartialEq)]
pub enum AgentStatus {
    Starting,
    Running,
    Stopping,
    Stopped,
    Failed(String),
}

/// Agent trait - all Matrix agents implement this
#[async_trait]
pub trait Agent: Send + Sync {
    /// Agent name
    fn name(&self) -> &str;

    /// Start the agent
    async fn start(&mut self) -> Result<(), NeoError>;

    /// Stop the agent gracefully
    async fn stop(&mut self) -> Result<(), NeoError>;

    /// Get current status
    fn status(&self) -> AgentStatus;

    /// Health check
    async fn health_check(&self) -> bool;
}

/// NEO orchestrator
pub struct Neo {
    agents: dashmap::DashMap<String, Box<dyn Agent>>,
    status: AgentStatus,
}

impl Neo {
    pub fn new() -> Self {
        tracing::info!("NEO: The One awakens...");
        Self {
            agents: dashmap::DashMap::new(),
            status: AgentStatus::Starting,
        }
    }

    /// Register an agent
    pub fn register(&self, agent: Box<dyn Agent>) {
        let name = agent.name().to_string();
        tracing::info!("NEO: Registering agent '{}'", name);
        self.agents.insert(name, agent);
    }

    /// Start all agents
    pub async fn start_all(&mut self) -> Result<(), NeoError> {
        tracing::info!("NEO: Starting all agents...");
        self.status = AgentStatus::Running;
        // Implementation will iterate and start each agent
        Ok(())
    }

    /// Stop all agents
    pub async fn stop_all(&mut self) -> Result<(), NeoError> {
        tracing::info!("NEO: Stopping all agents...");
        self.status = AgentStatus::Stopped;
        Ok(())
    }
}

impl Default for Neo {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_neo_creation() {
        let neo = Neo::new();
        assert_eq!(neo.status, AgentStatus::Starting);
    }
}
