# Matrix Flash Loan Arbitrage Bot - Makefile

.PHONY: all build test clean install dev run lint fmt

# Default target
all: build

# ============ Installation ============

install: install-rust install-node install-python install-foundry
	@echo "All dependencies installed"

install-rust:
	@echo "Installing Rust dependencies..."
	cd core && cargo fetch

install-node:
	@echo "Installing Node.js dependencies..."
	cd agents && npm ci

install-python:
	@echo "Installing Python dependencies..."
	cd analysis && pip install uv && uv pip install -e ".[dev,ml]" --system

install-foundry:
	@echo "Installing Foundry dependencies..."
	cd contracts && forge install

# ============ Building ============

build: build-cpp build-rust build-typescript build-python build-solidity
	@echo "All components built"

build-cpp:
	@echo "Building C++ hot path..."
	cmake -B hotpath/build -S hotpath -DCMAKE_BUILD_TYPE=Release
	cmake --build hotpath/build

build-rust:
	@echo "Building Rust core..."
	cd core && cargo build --release

build-typescript:
	@echo "Building TypeScript agents..."
	cd agents && npm run build

build-python:
	@echo "Building Python analysis..."
	cd analysis && python -m compileall .

build-solidity:
	@echo "Building Solidity contracts..."
	cd contracts && forge build

# ============ Testing ============

test: test-cpp test-rust test-typescript test-python test-solidity
	@echo "All tests passed"

test-cpp:
	@echo "Testing C++ hot path..."
	cd hotpath/build && ctest --output-on-failure

test-rust:
	@echo "Testing Rust core..."
	cd core && cargo test

test-typescript:
	@echo "Testing TypeScript agents..."
	cd agents && npm test

test-python:
	@echo "Testing Python analysis..."
	cd analysis && pytest

test-solidity:
	@echo "Testing Solidity contracts..."
	cd contracts && forge test -vvv

# ============ Linting ============

lint: lint-rust lint-typescript lint-python lint-solidity
	@echo "All linting passed"

lint-rust:
	cd core && cargo clippy --all-targets --all-features -- -D warnings

lint-typescript:
	cd agents && npm run lint

lint-python:
	cd analysis && ruff check . && mypy .

lint-solidity:
	cd contracts && forge fmt --check

# ============ Formatting ============

fmt: fmt-rust fmt-typescript fmt-python fmt-solidity
	@echo "All formatting applied"

fmt-rust:
	cd core && cargo fmt

fmt-typescript:
	cd agents && npm run lint:fix

fmt-python:
	cd analysis && ruff check --fix . && black .

fmt-solidity:
	cd contracts && forge fmt

# ============ Running ============

dev:
	docker-compose --profile dev up -d
	@echo "Development environment started"
	@echo "Grafana: http://localhost:3000"
	@echo "Prometheus: http://localhost:9090"
	@echo "Kafka UI: http://localhost:8080"

run:
	docker-compose up -d
	@echo "Infrastructure started"

run-agents:
	docker-compose --profile agents up -d
	@echo "Agents started"

stop:
	docker-compose down
	@echo "All services stopped"

# ============ Cleaning ============

clean: clean-cpp clean-rust clean-typescript clean-python clean-solidity
	@echo "All build artifacts cleaned"

clean-cpp:
	rm -rf hotpath/build

clean-rust:
	cd core && cargo clean

clean-typescript:
	cd agents && rm -rf dist node_modules

clean-python:
	cd analysis && rm -rf __pycache__ .pytest_cache .mypy_cache .ruff_cache

clean-solidity:
	cd contracts && forge clean

# ============ Docker ============

docker-build:
	docker-compose build

docker-push:
	docker-compose push

# ============ Deployment ============

deploy-contracts-testnet:
	cd contracts && forge script script/Deploy.s.sol --rpc-url $${SEPOLIA_RPC_URL} --broadcast

deploy-contracts-mainnet:
	cd contracts && forge script script/Deploy.s.sol --rpc-url $${ETH_RPC_URL} --broadcast --verify

# ============ Utilities ============

check-env:
	@echo "Checking environment..."
	@test -n "$${ETH_RPC_URL}" || (echo "ETH_RPC_URL not set" && exit 1)
	@echo "Environment OK"

logs:
	docker-compose logs -f

health:
	@echo "Checking service health..."
	@curl -s http://localhost:9090/-/healthy || echo "Prometheus: DOWN"
	@curl -s http://localhost:3000/api/health || echo "Grafana: DOWN"
	@echo "Health check complete"
