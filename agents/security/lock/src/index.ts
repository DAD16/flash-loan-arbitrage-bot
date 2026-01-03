/**
 * LOCK - Smart Contract Security Agent
 *
 * Named after Commander Lock from The Matrix who was obsessed with defending
 * Zion against machine attacks. This agent defends our smart contracts against
 * all possible attack vectors.
 *
 * Primary Responsibilities:
 * - Attack vector analysis and prevention
 * - Code obfuscation strategies
 * - Security pattern implementation
 * - Vulnerability detection
 * - Access control design
 *
 * Task Persistence:
 * - Uses AgentBase for crash-safe task logging
 * - Call onStartup() to recover incomplete tasks
 * - Call receiveTask() when given a new security analysis task
 */

import { Logger } from "winston";
import { AgentBase, AgentStartupResult } from "../../../shared/src/agentBase.js";
import type { AgentTask } from "../../../shared/src/taskQueue.js";

// ============ Types ============

export interface SecurityConfig {
  /** Enable strict mode (all checks) */
  strictMode: boolean;
  /** Attack vectors to check */
  attackVectors: AttackVector[];
  /** Security patterns to enforce */
  securityPatterns: SecurityPattern[];
  /** SWC IDs to check */
  swcChecks: string[];
}

export interface AttackVector {
  id: string;
  name: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  detection: string;
  prevention: string[];
  references: string[];
}

export interface SecurityPattern {
  id: string;
  name: string;
  description: string;
  implementation: string;
  example: string;
}

export interface VulnerabilityReport {
  contractName: string;
  findings: Finding[];
  overallRisk: "critical" | "high" | "medium" | "low" | "informational";
  recommendations: string[];
  timestamp: string;
}

export interface Finding {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "informational";
  location: string;
  description: string;
  recommendation: string;
  swcId?: string;
}

export interface ObfuscationStrategy {
  name: string;
  description: string;
  techniques: string[];
  tradeoffs: string[];
  implementation: string;
}

// ============ Attack Vectors Database ============

export const ATTACK_VECTORS: AttackVector[] = [
  {
    id: "AV-001",
    name: "Reentrancy",
    severity: "critical",
    description:
      "Attacker exploits external calls to re-enter a function before state updates complete",
    detection: "Look for external calls before state changes, missing reentrancy guards",
    prevention: [
      "Use ReentrancyGuard from OpenZeppelin",
      "Follow Checks-Effects-Interactions pattern",
      "Use pull over push for payments",
      "Mark functions as nonReentrant",
    ],
    references: [
      "SWC-107",
      "https://swcregistry.io/docs/SWC-107",
      "The DAO hack (2016)",
    ],
  },
  {
    id: "AV-002",
    name: "Flash Loan Attack",
    severity: "critical",
    description:
      "Attacker uses flash loans to manipulate prices or exploit protocol logic within a single transaction",
    detection:
      "Check for price oracle dependencies, single-block calculations, governance tokens",
    prevention: [
      "Use TWAP oracles instead of spot prices",
      "Implement time-delayed actions",
      "Add minimum holding periods for governance",
      "Use Chainlink price feeds",
      "Implement flash loan guards",
    ],
    references: [
      "bZx attacks",
      "Harvest Finance attack",
      "Cream Finance attacks",
    ],
  },
  {
    id: "AV-003",
    name: "Oracle Manipulation",
    severity: "critical",
    description:
      "Attacker manipulates price oracles to profit from incorrect pricing",
    detection:
      "Check oracle sources, look for spot price usage, check for single-source oracles",
    prevention: [
      "Use multiple oracle sources",
      "Implement TWAP (Time-Weighted Average Price)",
      "Use Chainlink decentralized oracles",
      "Add price deviation checks",
      "Implement circuit breakers for extreme prices",
    ],
    references: ["SWC-120", "Mango Markets exploit"],
  },
  {
    id: "AV-004",
    name: "Sandwich Attack",
    severity: "high",
    description:
      "Attacker front-runs and back-runs a victim's transaction to extract value",
    detection: "Check for slippage protection, MEV exposure in swap functions",
    prevention: [
      "Implement strict slippage limits",
      "Use private mempools (Flashbots)",
      "Add deadline parameters",
      "Consider commit-reveal schemes",
    ],
    references: ["MEV research", "Flashbots documentation"],
  },
  {
    id: "AV-005",
    name: "Front-Running",
    severity: "high",
    description: "Attacker sees pending transaction and submits their own with higher gas",
    detection: "Look for predictable outcomes, public state changes, profitable operations",
    prevention: [
      "Use commit-reveal schemes",
      "Submit via Flashbots Protect",
      "Implement batch auctions",
      "Add randomness where appropriate",
    ],
    references: ["SWC-114"],
  },
  {
    id: "AV-006",
    name: "Access Control",
    severity: "high",
    description: "Missing or improper access controls allow unauthorized actions",
    detection: "Check for missing modifiers, public sensitive functions, unprotected initializers",
    prevention: [
      "Use OpenZeppelin AccessControl",
      "Implement role-based access",
      "Add onlyOwner/onlyRole modifiers",
      "Protect initialization functions",
      "Use two-step ownership transfers",
    ],
    references: ["SWC-105", "SWC-106"],
  },
  {
    id: "AV-007",
    name: "Integer Overflow/Underflow",
    severity: "high",
    description: "Arithmetic operations exceed integer bounds causing unexpected values",
    detection: "Check for unchecked math, Solidity version < 0.8.0",
    prevention: [
      "Use Solidity 0.8.0+ (built-in overflow checks)",
      "Use SafeMath for older versions",
      "Add explicit bounds checking",
      "Use unchecked blocks only when safe",
    ],
    references: ["SWC-101"],
  },
  {
    id: "AV-008",
    name: "Denial of Service (DoS)",
    severity: "medium",
    description: "Attacker can block contract functionality or make it unusable",
    detection:
      "Look for unbounded loops, external call dependencies, gas griefing opportunities",
    prevention: [
      "Limit loop iterations",
      "Use pull over push patterns",
      "Implement gas limits on operations",
      "Avoid single points of failure",
    ],
    references: ["SWC-113", "SWC-128"],
  },
  {
    id: "AV-009",
    name: "Signature Replay",
    severity: "high",
    description: "Attacker reuses a valid signature in an unintended context",
    detection: "Check for nonce usage, domain separator, chain ID inclusion",
    prevention: [
      "Include nonces in signed messages",
      "Use EIP-712 typed data",
      "Include chain ID and contract address",
      "Implement signature deadlines",
    ],
    references: ["SWC-117", "SWC-121"],
  },
  {
    id: "AV-010",
    name: "Unchecked Return Values",
    severity: "medium",
    description: "Ignoring return values from external calls can lead to silent failures",
    detection: "Check for ignored return values, missing success checks",
    prevention: [
      "Use SafeERC20 for token transfers",
      "Always check return values",
      "Use require() on critical operations",
      "Handle failure cases explicitly",
    ],
    references: ["SWC-104"],
  },
];

// ============ Security Patterns ============

export const SECURITY_PATTERNS: SecurityPattern[] = [
  {
    id: "SP-001",
    name: "Checks-Effects-Interactions",
    description:
      "Order operations to check conditions, update state, then interact with external contracts",
    implementation: `
1. Check all preconditions (require statements)
2. Update all state variables
3. Perform external calls last
    `,
    example: `
function withdraw(uint256 amount) external {
    // Checks
    require(balances[msg.sender] >= amount, "Insufficient balance");

    // Effects
    balances[msg.sender] -= amount;

    // Interactions
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Transfer failed");
}
    `,
  },
  {
    id: "SP-002",
    name: "Reentrancy Guard",
    description: "Prevent recursive calls to sensitive functions",
    implementation: "Use OpenZeppelin ReentrancyGuard or implement custom lock",
    example: `
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MyContract is ReentrancyGuard {
    function sensitiveFunction() external nonReentrant {
        // Function body
    }
}
    `,
  },
  {
    id: "SP-003",
    name: "Pull Over Push",
    description: "Let users withdraw funds instead of pushing to them",
    implementation:
      "Track owed amounts, let users claim instead of automatic transfers",
    example: `
mapping(address => uint256) public pendingWithdrawals;

function requestWithdrawal() external {
    uint256 amount = calculateOwed(msg.sender);
    pendingWithdrawals[msg.sender] += amount;
}

function withdraw() external {
    uint256 amount = pendingWithdrawals[msg.sender];
    pendingWithdrawals[msg.sender] = 0;
    payable(msg.sender).transfer(amount);
}
    `,
  },
  {
    id: "SP-004",
    name: "Emergency Stop (Circuit Breaker)",
    description: "Ability to pause contract in case of emergency",
    implementation: "Use OpenZeppelin Pausable or custom implementation",
    example: `
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract MyContract is Pausable {
    function emergencyStop() external onlyOwner {
        _pause();
    }

    function resume() external onlyOwner {
        _unpause();
    }

    function sensitiveFunction() external whenNotPaused {
        // Function body
    }
}
    `,
  },
  {
    id: "SP-005",
    name: "Rate Limiting",
    description: "Limit the frequency or size of operations",
    implementation: "Track last action timestamp, enforce cooldown periods",
    example: `
mapping(address => uint256) public lastActionTime;
uint256 public constant COOLDOWN = 1 hours;

modifier rateLimited() {
    require(
        block.timestamp >= lastActionTime[msg.sender] + COOLDOWN,
        "Rate limited"
    );
    lastActionTime[msg.sender] = block.timestamp;
    _;
}
    `,
  },
  {
    id: "SP-006",
    name: "Two-Step Ownership Transfer",
    description: "Require new owner to accept ownership to prevent accidental transfers",
    implementation: "Use OpenZeppelin Ownable2Step",
    example: `
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract MyContract is Ownable2Step {
    // transferOwnership() sets pending owner
    // acceptOwnership() must be called by pending owner
}
    `,
  },
  {
    id: "SP-007",
    name: "Timelock",
    description: "Delay sensitive operations to allow review and cancellation",
    implementation: "Use OpenZeppelin TimelockController or custom implementation",
    example: `
uint256 public constant TIMELOCK_DURATION = 2 days;
mapping(bytes32 => uint256) public timelocks;

function scheduleAction(bytes32 actionId) external onlyOwner {
    timelocks[actionId] = block.timestamp + TIMELOCK_DURATION;
}

function executeAction(bytes32 actionId) external onlyOwner {
    require(timelocks[actionId] != 0, "Not scheduled");
    require(block.timestamp >= timelocks[actionId], "Timelock active");
    delete timelocks[actionId];
    // Execute action
}
    `,
  },
];

// ============ Obfuscation Strategies ============

export const OBFUSCATION_STRATEGIES: ObfuscationStrategy[] = [
  {
    name: "Function Selector Obfuscation",
    description:
      "Use non-obvious function names that result in specific selectors",
    techniques: [
      "Use randomly generated function names",
      "Create multiple functions with same selector (collision)",
      "Obfuscate function names with special characters",
    ],
    tradeoffs: [
      "Reduces code readability",
      "Makes debugging harder",
      "Verification becomes complex",
      "May not survive decompilation",
    ],
    implementation: `
// Instead of:
function withdraw() external { ... }

// Use:
function withdraw_aX7bY9() external { ... }

// Or generate names that hash to same selector as decoys
    `,
  },
  {
    name: "Logic Splitting",
    description: "Split logic across multiple contracts to obscure flow",
    techniques: [
      "Use proxy patterns with hidden implementation",
      "Split calculations across multiple contracts",
      "Use delegate calls to hide logic",
    ],
    tradeoffs: [
      "Increases gas costs",
      "More complex deployment",
      "Harder to audit",
      "May introduce new vulnerabilities",
    ],
    implementation: `
// Main contract delegates to hidden logic
contract Main {
    address private logicContract;

    fallback() external payable {
        _delegate(logicContract);
    }
}
    `,
  },
  {
    name: "State Encoding",
    description: "Encode state in non-obvious ways",
    techniques: [
      "Pack multiple values into single storage slots",
      "Use hash-based storage slots (EIP-1967)",
      "Encrypt sensitive values on-chain",
    ],
    tradeoffs: [
      "Increases complexity",
      "Higher gas for encoding/decoding",
      "On-chain encryption is limited",
    ],
    implementation: `
// Instead of:
mapping(address => uint256) public balances;

// Use hash-based slot:
bytes32 private constant BALANCE_SLOT = keccak256("matrix.balance.slot");

function _getBalance(address user) internal view returns (uint256) {
    bytes32 slot = keccak256(abi.encode(user, BALANCE_SLOT));
    uint256 balance;
    assembly {
        balance := sload(slot)
    }
    return balance;
}
    `,
  },
  {
    name: "Event Obfuscation",
    description: "Reduce information leaked through events",
    techniques: [
      "Use indexed parameters carefully",
      "Emit hashes instead of raw values",
      "Use generic event names",
    ],
    tradeoffs: [
      "Harder to track on block explorers",
      "Complicates front-end integration",
      "May break The Graph indexing",
    ],
    implementation: `
// Instead of:
event ArbitrageExecuted(address token, uint256 profit);

// Use:
event Action(bytes32 indexed actionHash, bytes data);

// Where actionHash = keccak256(abi.encode(type, params))
    `,
  },
  {
    name: "MEV Protection",
    description: "Protect transactions from MEV extraction",
    techniques: [
      "Use Flashbots Protect for submission",
      "Implement commit-reveal schemes",
      "Add private mempool submission",
      "Use encrypted mempools (Shutter, etc.)",
    ],
    tradeoffs: [
      "Slower transaction inclusion",
      "More complex submission flow",
      "May not work on all chains",
    ],
    implementation: `
// Commit-reveal pattern
mapping(bytes32 => uint256) public commits;

function commit(bytes32 hash) external {
    commits[hash] = block.timestamp;
}

function reveal(bytes calldata data) external {
    bytes32 hash = keccak256(data);
    require(commits[hash] > 0, "Not committed");
    require(block.timestamp >= commits[hash] + MIN_DELAY, "Too early");
    delete commits[hash];
    // Execute based on revealed data
}
    `,
  },
];

// ============ Our Contract Security Analysis ============

export const FLASH_LOAN_RECEIVER_ANALYSIS = {
  contractName: "FlashLoanReceiver",
  location: "contracts/src/FlashLoanReceiver.sol",
  securityFeatures: {
    implemented: [
      "ReentrancyGuard from OpenZeppelin",
      "Ownable access control",
      "DEX whitelist",
      "Authorized executor whitelist",
      "Minimum profit threshold",
      "SafeERC20 for token transfers",
      "Initiator validation",
      "Pool validation",
    ],
    missing: [
      "Pausable (emergency stop)",
      "Two-step ownership transfer",
      "Timelock for admin actions",
      "Rate limiting",
      "Maximum position size check",
    ],
  },
  attackVectorAssessment: [
    {
      vector: "Reentrancy",
      status: "PROTECTED",
      notes: "ReentrancyGuard implemented on executeArbitrage",
    },
    {
      vector: "Flash Loan Attack",
      status: "N/A",
      notes: "We are the flash loan user, not victim",
    },
    {
      vector: "Oracle Manipulation",
      status: "REVIEW",
      notes: "Price calculations in Python, verify before execution",
    },
    {
      vector: "Access Control",
      status: "PROTECTED",
      notes: "Ownable + authorizedExecutors + whitelistedDexes",
    },
    {
      vector: "Unchecked Return Values",
      status: "PROTECTED",
      notes: "SafeERC20 handles return values",
    },
  ],
  recommendations: [
    "Add Pausable functionality for emergency stops",
    "Implement Ownable2Step for safer ownership transfers",
    "Add timelock for whitelist changes",
    "Consider maximum flash loan size limits",
    "Add event for failed executions (not just successful)",
  ],
};

// ============ LOCK Agent Class ============

export class Lock extends AgentBase {
  private config: SecurityConfig;
  private logger?: Logger;

  constructor(config: Partial<SecurityConfig> = {}, logger?: Logger) {
    super('LOCK');
    this.config = {
      strictMode: true,
      attackVectors: ATTACK_VECTORS,
      securityPatterns: SECURITY_PATTERNS,
      swcChecks: ATTACK_VECTORS.flatMap((av) =>
        av.references.filter((r) => r.startsWith("SWC-"))
      ),
      ...config,
    };
    this.logger = logger;
  }
  /**
   * Initialize LOCK and recover any incomplete tasks.
   */
  async initialize(): Promise<AgentStartupResult> {
    const result = await this.onStartup();
    if (result.currentTask) {
      this.logger?.info(`LOCK resuming task: ${result.currentTask.taskDescription}`);
    }
    return result;
  }

  /**
   * Start a new security analysis task. Saved IMMEDIATELY for crash recovery.
   */
  async startSecurityTask(
    description: string,
    rawInput?: string
  ): Promise<AgentTask> {
    const task = await this.receiveTask(description, {
      rawInput: rawInput || description,
      priority: 'normal',
      metadata: { type: 'security' },
    });
    await this.startTask(task.id);
    return task;
  }

  /**
   * Complete the current security task.
   */
  async finishSecurityTask(result: string): Promise<void> {
    await this.completeTask(undefined, result);
  }

  /**
   * Get what LOCK is currently working on.
   */
  async whatAmIWorkingOn(): Promise<string | null> {
    const task = await this.getCurrentTask();
    return task ? task.taskDescription : null;
  }


  /**
   * Get all known attack vectors
   */
  getAttackVectors(): AttackVector[] {
    return this.config.attackVectors;
  }

  /**
   * Get attack vectors by severity
   */
  getAttackVectorsBySeverity(
    severity: "critical" | "high" | "medium" | "low"
  ): AttackVector[] {
    return this.config.attackVectors.filter((av) => av.severity === severity);
  }

  /**
   * Get all security patterns
   */
  getSecurityPatterns(): SecurityPattern[] {
    return this.config.securityPatterns;
  }

  /**
   * Get obfuscation strategies
   */
  getObfuscationStrategies(): ObfuscationStrategy[] {
    return OBFUSCATION_STRATEGIES;
  }

  /**
   * Analyze our FlashLoanReceiver contract
   */
  analyzeFlashLoanReceiver(): typeof FLASH_LOAN_RECEIVER_ANALYSIS {
    return FLASH_LOAN_RECEIVER_ANALYSIS;
  }

  /**
   * Generate a comprehensive security report
   */
  generateSecurityReport(): string {
    const analysis = this.analyzeFlashLoanReceiver();
    const criticalVectors = this.getAttackVectorsBySeverity("critical");
    const highVectors = this.getAttackVectorsBySeverity("high");

    return `
# LOCK Security Analysis Report

## Contract: ${analysis.contractName}
Location: ${analysis.location}

## Security Features Assessment

### Implemented:
${analysis.securityFeatures.implemented.map((f) => `- [x] ${f}`).join("\n")}

### Missing (Recommended):
${analysis.securityFeatures.missing.map((f) => `- [ ] ${f}`).join("\n")}

## Attack Vector Assessment

${analysis.attackVectorAssessment
  .map(
    (a) => `### ${a.vector}
Status: **${a.status}**
Notes: ${a.notes}`
  )
  .join("\n\n")}

## Critical Attack Vectors to Monitor

${criticalVectors
  .map(
    (av) => `### ${av.name} (${av.id})
Severity: CRITICAL
Description: ${av.description}
Prevention:
${av.prevention.map((p) => `- ${p}`).join("\n")}`
  )
  .join("\n\n")}

## High-Severity Attack Vectors

${highVectors
  .map(
    (av) => `### ${av.name} (${av.id})
Severity: HIGH
Description: ${av.description}
Prevention:
${av.prevention.map((p) => `- ${p}`).join("\n")}`
  )
  .join("\n\n")}

## Recommendations

${analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## Obfuscation Options

${OBFUSCATION_STRATEGIES.map(
  (s) => `### ${s.name}
${s.description}
Tradeoffs: ${s.tradeoffs.join(", ")}`
).join("\n\n")}

## Next Steps

1. Implement Pausable functionality
2. Add Ownable2Step for ownership transfers
3. Add timelock for admin operations
4. Review oracle price validation
5. Consider MEV protection strategies
6. Schedule formal security audit

---
Generated by LOCK - Smart Contract Security Agent
    `.trim();
  }
}

// ============ Export ============

export default Lock;
