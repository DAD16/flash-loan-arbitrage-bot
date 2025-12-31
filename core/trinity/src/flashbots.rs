//! Flashbots bundle submission
//!
//! Handles MEV-protected transaction submission via Flashbots relay.

use ethers::types::{Bytes, H256, U256, U64};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Flashbots relay URLs
pub const FLASHBOTS_RELAY: &str = "https://relay.flashbots.net";
pub const FLASHBOTS_PROTECT: &str = "https://rpc.flashbots.net";

/// Flashbots errors
#[derive(Error, Debug)]
pub enum FlashbotsError {
    #[error("Bundle simulation failed: {0}")]
    SimulationFailed(String),

    #[error("Bundle rejected: {0}")]
    BundleRejected(String),

    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),

    #[error("Signing error: {0}")]
    SigningError(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),
}

/// Flashbots bundle
#[derive(Debug, Clone, Serialize)]
pub struct Bundle {
    /// Signed transactions (RLP encoded, hex)
    #[serde(rename = "txs")]
    pub transactions: Vec<String>,

    /// Target block number
    #[serde(rename = "blockNumber")]
    pub block_number: String,

    /// Minimum timestamp (optional)
    #[serde(rename = "minTimestamp", skip_serializing_if = "Option::is_none")]
    pub min_timestamp: Option<u64>,

    /// Maximum timestamp (optional)
    #[serde(rename = "maxTimestamp", skip_serializing_if = "Option::is_none")]
    pub max_timestamp: Option<u64>,

    /// Revert protection - list of tx hashes that can revert
    #[serde(rename = "revertingTxHashes", skip_serializing_if = "Vec::is_empty")]
    pub reverting_tx_hashes: Vec<String>,
}

/// Simulation result
#[derive(Debug, Clone, Deserialize)]
pub struct SimulationResult {
    /// Bundle hash
    #[serde(rename = "bundleHash")]
    pub bundle_hash: String,

    /// Coinbase diff (miner payment)
    #[serde(rename = "coinbaseDiff")]
    pub coinbase_diff: String,

    /// Gas used
    #[serde(rename = "gasUsed")]
    pub gas_used: u64,

    /// Total gas used by bundle
    #[serde(rename = "totalGasUsed")]
    pub total_gas_used: Option<u64>,

    /// Simulation results per transaction
    pub results: Option<Vec<TxSimResult>>,
}

/// Per-transaction simulation result
#[derive(Debug, Clone, Deserialize)]
pub struct TxSimResult {
    /// Transaction hash
    #[serde(rename = "txHash")]
    pub tx_hash: String,

    /// Gas used
    #[serde(rename = "gasUsed")]
    pub gas_used: u64,

    /// Gas price
    #[serde(rename = "gasPrice")]
    pub gas_price: String,

    /// Whether transaction reverted
    pub revert: Option<String>,
}

/// Bundle submission result
#[derive(Debug, Clone, Deserialize)]
pub struct SubmissionResult {
    /// Bundle hash
    #[serde(rename = "bundleHash")]
    pub bundle_hash: String,
}

/// Flashbots client
pub struct FlashbotsClient {
    client: Client,
    relay_url: String,
    signing_key: Option<String>,
}

impl FlashbotsClient {
    /// Create a new Flashbots client
    pub fn new(relay_url: Option<String>) -> Self {
        Self {
            client: Client::new(),
            relay_url: relay_url.unwrap_or_else(|| FLASHBOTS_RELAY.to_string()),
            signing_key: None,
        }
    }

    /// Set the signing key for bundle authentication
    pub fn with_signing_key(mut self, key: String) -> Self {
        self.signing_key = Some(key);
        self
    }

    /// Simulate a bundle
    pub async fn simulate_bundle(
        &self,
        bundle: &Bundle,
        state_block: U64,
    ) -> Result<SimulationResult, FlashbotsError> {
        let params = serde_json::json!({
            "txs": bundle.transactions,
            "blockNumber": bundle.block_number,
            "stateBlockNumber": format!("0x{:x}", state_block),
        });

        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_callBundle",
            "params": [params],
        });

        let response = self
            .client
            .post(&self.relay_url)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        let result: serde_json::Value = response.json().await?;

        if let Some(error) = result.get("error") {
            return Err(FlashbotsError::SimulationFailed(
                error.get("message").and_then(|m| m.as_str()).unwrap_or("Unknown error").to_string(),
            ));
        }

        let sim_result: SimulationResult = serde_json::from_value(
            result.get("result").cloned().ok_or_else(|| {
                FlashbotsError::InvalidResponse("Missing result".to_string())
            })?,
        )
        .map_err(|e| FlashbotsError::InvalidResponse(e.to_string()))?;

        Ok(sim_result)
    }

    /// Submit a bundle
    pub async fn send_bundle(
        &self,
        bundle: &Bundle,
    ) -> Result<SubmissionResult, FlashbotsError> {
        let params = serde_json::json!({
            "txs": bundle.transactions,
            "blockNumber": bundle.block_number,
            "minTimestamp": bundle.min_timestamp,
            "maxTimestamp": bundle.max_timestamp,
            "revertingTxHashes": bundle.reverting_tx_hashes,
        });

        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_sendBundle",
            "params": [params],
        });

        let mut req_builder = self
            .client
            .post(&self.relay_url)
            .header("Content-Type", "application/json");

        // Add Flashbots signature header if signing key is set
        if let Some(ref key) = self.signing_key {
            let body = serde_json::to_string(&request)
                .map_err(|e| FlashbotsError::SigningError(e.to_string()))?;
            let signature = self.sign_payload(&body, key)?;
            req_builder = req_builder.header("X-Flashbots-Signature", signature);
        }

        let response = req_builder.json(&request).send().await?;

        let result: serde_json::Value = response.json().await?;

        if let Some(error) = result.get("error") {
            return Err(FlashbotsError::BundleRejected(
                error.get("message").and_then(|m| m.as_str()).unwrap_or("Unknown error").to_string(),
            ));
        }

        let submission: SubmissionResult = serde_json::from_value(
            result.get("result").cloned().ok_or_else(|| {
                FlashbotsError::InvalidResponse("Missing result".to_string())
            })?,
        )
        .map_err(|e| FlashbotsError::InvalidResponse(e.to_string()))?;

        Ok(submission)
    }

    /// Get bundle stats
    pub async fn get_bundle_stats(
        &self,
        bundle_hash: &str,
        block_number: U64,
    ) -> Result<serde_json::Value, FlashbotsError> {
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "flashbots_getBundleStats",
            "params": [{
                "bundleHash": bundle_hash,
                "blockNumber": format!("0x{:x}", block_number),
            }],
        });

        let response = self
            .client
            .post(&self.relay_url)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        let result: serde_json::Value = response.json().await?;
        Ok(result)
    }

    /// Sign payload for Flashbots authentication
    fn sign_payload(&self, payload: &str, key: &str) -> Result<String, FlashbotsError> {
        // In production, this would use proper ECDSA signing
        // For now, return a placeholder signature format
        let hash = format!("{:x}", md5::compute(payload));
        Ok(format!("{}:{}", key.chars().take(10).collect::<String>(), hash))
    }
}

/// Bundle builder helper
pub struct BundleBuilder {
    transactions: Vec<String>,
    block_number: U64,
    min_timestamp: Option<u64>,
    max_timestamp: Option<u64>,
    reverting_tx_hashes: Vec<String>,
}

impl BundleBuilder {
    /// Create a new bundle builder
    pub fn new(block_number: U64) -> Self {
        Self {
            transactions: Vec::new(),
            block_number,
            min_timestamp: None,
            max_timestamp: None,
            reverting_tx_hashes: Vec::new(),
        }
    }

    /// Add a signed transaction
    pub fn add_transaction(mut self, signed_tx: String) -> Self {
        self.transactions.push(signed_tx);
        self
    }

    /// Add multiple transactions
    pub fn add_transactions(mut self, txs: Vec<String>) -> Self {
        self.transactions.extend(txs);
        self
    }

    /// Set timestamp constraints
    pub fn with_timestamps(mut self, min: Option<u64>, max: Option<u64>) -> Self {
        self.min_timestamp = min;
        self.max_timestamp = max;
        self
    }

    /// Allow specific transactions to revert
    pub fn allow_revert(mut self, tx_hash: String) -> Self {
        self.reverting_tx_hashes.push(tx_hash);
        self
    }

    /// Build the bundle
    pub fn build(self) -> Bundle {
        Bundle {
            transactions: self.transactions,
            block_number: format!("0x{:x}", self.block_number),
            min_timestamp: self.min_timestamp,
            max_timestamp: self.max_timestamp,
            reverting_tx_hashes: self.reverting_tx_hashes,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bundle_builder() {
        let bundle = BundleBuilder::new(U64::from(18000000))
            .add_transaction("0x1234...".to_string())
            .add_transaction("0x5678...".to_string())
            .with_timestamps(Some(1699999999), Some(1700000100))
            .build();

        assert_eq!(bundle.transactions.len(), 2);
        assert_eq!(bundle.block_number, "0x112a880");
        assert_eq!(bundle.min_timestamp, Some(1699999999));
    }

    #[test]
    fn test_flashbots_client_creation() {
        let client = FlashbotsClient::new(None);
        assert_eq!(client.relay_url, FLASHBOTS_RELAY);

        let custom_client = FlashbotsClient::new(Some("https://custom.relay".to_string()));
        assert_eq!(custom_client.relay_url, "https://custom.relay");
    }
}
