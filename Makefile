.PHONY: help backend-build backend-run backend-test backend-test-local backend-test-unit backend-test-docker backend-coverage backend-stop backend-clean backend-shell backend-logs backend-docs backend-check release frontend-install frontend-dev frontend-build frontend-preview frontend-test frontend-test-run frontend-lint

IMAGE_NAME=entitybase-sse
CONTAINER_NAME=entitybase-sse
PORT=8888
KAFKA_BROKERS?=localhost:9092

help:
	@echo "Entitybase-SSE Makefile"
	@echo ""
	@echo "Frontend targets:"
	@echo "  make frontend-install     - Install frontend dependencies"
	@echo "  make frontend-dev         - Run frontend dev server on port 8082"
	@echo "  make frontend-build       - Build frontend for production"
	@echo "  make frontend-serve       - Build and serve frontend on port 8082"
	@echo "  make frontend-preview     - Preview built frontend"
	@echo "  make frontend-test-run    - Run frontend tests"
	@echo "  make frontend-lint       - Run frontend linter"
	@echo "  make frontend-test        - Run frontend tests with UI"
	@echo ""
	@echo "Backend targets (Docker/Kafka required):"
	@echo "  make backend-check        - Check if Redpanda is running"
	@echo "  make backend-build        - Build Docker image"
	@echo "  make backend-run          - Run container (requires redpanda at localhost:9092)"
	@echo "  make backend-test-docker  - Run integration tests with Redpanda in Docker"
	@echo "  make backend-coverage-docker - Run integration tests with coverage"
	@echo ""
	@echo "Backend local targets (no Docker/Kafka required):"
	@echo "  make backend-test-local   - Install deps and run all tests locally"
	@echo "  make backend-test-unit    - Run unit tests only (no Kafka needed)"
	@echo ""
	@echo "Note: If running remotely, ensure firewall allows port $(PORT)"
	@echo ""
	@echo "Other targets:"
	@echo "  make backend-shell        - Open shell in running container"
	@echo "  make backend-logs         - View container logs"
	@echo "  make backend-stop         - Stop running container"
	@echo "  make backend-clean        - Remove container and image"
	@echo "  make backend-docs         - Generate PlantUML diagrams"
	@echo "  make release              - Create release: update version, commit, and tag (e.g., v2026.3.3)"
	@echo ""
	@echo "Environment variables:"
	@echo "  KAFKA_BROKERS     - Kafka broker address (default: localhost:9092)"
	@echo "  LOG_LEVEL         - Log level: trace, debug, info, warn, error (default: warn)"

backend-check:
	@echo "Checking if Redpanda is running..."
	@docker ps --format '{{.Names}}\t{{.Status}}' | grep -q redpanda && echo "✅ Redpanda is running" || (echo "❌ Redpanda is not running" && echo "Start Redpanda: cd ../entitybase-backend && make api" && exit 1)

release:
	./scripts/shell/run-release.sh

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

frontend-preview:
	cd frontend && npm run preview

frontend-serve:
	cd frontend && npm run build && npm run serve

frontend-test-run:
	cd frontend && npm run test:run

frontend-lint:
	cd frontend && npm run lint

frontend-test:
	cd frontend && npm run test:ui

backend-test-local:
	@echo "Installing dependencies..."
	npm install
	@echo "Running all tests..."
	LOG_LEVEL=debug npm test

backend-test-unit:
	@echo "Installing dependencies..."
	npm install
	@echo "Running unit tests (no Kafka required)..."
	LOG_LEVEL=debug npx jest --verbose --forceExit --testPathIgnorePatterns="integration"

backend-docs:
	./scripts/generate-diagrams.sh

backend-build:
	@make backend-stop || true
	docker build -t $(IMAGE_NAME) .

backend-run:
	@make backend-stop || true
	@make backend-check || exit 1
	@make backend-build || exit 1
	@docker run -d \
		--name $(CONTAINER_NAME) \
		--network host \
		-e KAFKA_BROKERS=$(KAFKA_BROKERS) \
		-e LOG_LEVEL=$(LOG_LEVEL) \
		-p $(PORT):$(PORT) \
		$(IMAGE_NAME) 2>&1 | grep -v "WARNING" || true
	@echo ""
	@echo "✅ Entitybase-SSE server running"
	@echo "   - Server: http://localhost:$(PORT)"
	@echo "   - Docs:   http://localhost:$(PORT)/docs"

backend-test:
	@echo "Running tests requires Kafka broker at KAFKA_BROKERS"
	@echo "Make sure Kafka/Redpanda is running at localhost:9092 or set KAFKA_BROKERS"
	@echo "Or use 'make backend-test-docker' to run tests with Kafka in Docker"
	docker run --rm --network host -e KAFKA_BROKERS=$(KAFKA_BROKERS) -e LOG_LEVEL=$(LOG_LEVEL) $(IMAGE_NAME) npm test

backend-coverage:
	@echo "Running tests with coverage requires Kafka broker at KAFKA_BROKERS"
	@echo "Make sure Kafka/Redpanda is running at localhost:9092 or set KAFKA_BROKERS"
	docker run --rm --network host -e KAFKA_BROKERS=$(KAFKA_BROKERS) -e LOG_LEVEL=$(LOG_LEVEL) $(IMAGE_NAME) npm run coverage

backend-test-docker:
	@make backend-check || exit 1
	@echo "Running integration tests with Redpanda..."
	LOG_LEVEL=debug ./test/docker-tests.sh

backend-coverage-docker:
	@make backend-check || exit 1
	@echo "Running integration tests with coverage..."
	LOG_LEVEL=debug ./test/docker-tests.sh coverage

backend-shell:
	docker exec -it $(CONTAINER_NAME) /bin/sh

backend-logs:
	docker logs -f $(CONTAINER_NAME)

backend-stop:
	docker stop $(CONTAINER_NAME) 2>/dev/null || true
	docker rm $(CONTAINER_NAME) 2>/dev/null || true

backend-clean: backend-stop
	docker rm $(CONTAINER_NAME) 2>/dev/null || true
	docker rmi $(IMAGE_NAME) 2>/dev/null || true
