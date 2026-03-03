.PHONY: help build run test test-local test-unit test-docker coverage stop clean shell logs docs check

IMAGE_NAME=kafkasse
CONTAINER_NAME=kafkasse
PORT=8081
KAFKA_BROKERS?=localhost:9092

help:
	@echo "KafkaSSE Makefile"
	@echo ""
	@echo "Local targets (no Docker/Kafka required):"
	@echo "  make test-local   - Install deps and run all tests locally"
	@echo "  make test-unit   - Run unit tests only (no Kafka needed)"
	@echo ""
	@echo "Docker targets (requires Docker):"
	@echo "  make check        - Check if Redpanda is running"
	@echo "  make build        - Build Docker image"
	@echo "  make run          - Run container (requires redpanda at localhost:9092)"
	@echo "  make test-docker  - Run integration tests with Redpanda in Docker"
	@echo "  make coverage-docker - Run integration tests with coverage"
	@echo ""
	@echo "Other targets:"
	@echo "  make shell        - Open shell in running container"
	@echo "  make logs         - View container logs"
	@echo "  make stop         - Stop running container"
	@echo "  make clean        - Remove container and image"
	@echo "  make docs         - Generate PlantUML diagrams"
	@echo ""
	@echo "Environment variables:"
	@echo "  KAFKA_BROKERS     - Kafka broker address (default: localhost:9092)"
	@echo "  LOG_LEVEL         - Log level: trace, debug, info, warn, error (default: warn)"

check:
	@echo "Checking if Redpanda is running..."
	@docker ps --format '{{.Names}}\t{{.Status}}' | grep -q redpanda && echo "✅ Redpanda is running" || (echo "❌ Redpanda is not running" && echo "Start Redpanda: cd ../entitybase-backend && make api" && exit 1)

test-local:
	@echo "Installing dependencies..."
	npm install
	@echo "Running all tests..."
	LOG_LEVEL=debug npm test

test-unit:
	@echo "Installing dependencies..."
	npm install
	@echo "Running unit tests (no Kafka required)..."
	LOG_LEVEL=debug npx jest --verbose --forceExit --testPathIgnorePatterns="integration"

docs:
	./scripts/generate-diagrams.sh

build:
	docker build -t $(IMAGE_NAME) .

run:
	@make check || exit 1
	@make build || exit 1
	@docker run -d \
		--name $(CONTAINER_NAME) \
		--network host \
		-e KAFKA_BROKERS=$(KAFKA_BROKERS) \
		-e LOG_LEVEL=$(LOG_LEVEL) \
		-p $(PORT):$(PORT) \
		$(IMAGE_NAME) 2>&1 | grep -v "WARNING" || true
	@echo ""
	@echo "✅ KafkaSSE server running"
	@echo "   - Server: http://localhost:$(PORT)"
	@echo "   - Docs:   http://localhost:$(PORT)/docs"

test:
	@echo "Running tests requires Kafka broker at KAFKA_BROKERS"
	@echo "Make sure Kafka/Redpanda is running at localhost:9092 or set KAFKA_BROKERS"
	@echo "Or use 'make test-docker' to run tests with Kafka in Docker"
	docker run --rm --network host -e KAFKA_BROKERS=$(KAFKA_BROKERS) -e LOG_LEVEL=$(LOG_LEVEL) $(IMAGE_NAME) npm test

coverage:
	@echo "Running tests with coverage requires Kafka broker at KAFKA_BROKERS"
	@echo "Make sure Kafka/Redpanda is running at localhost:9092 or set KAFKA_BROKERS"
	docker run --rm --network host -e KAFKA_BROKERS=$(KAFKA_BROKERS) -e LOG_LEVEL=$(LOG_LEVEL) $(IMAGE_NAME) npm run coverage

test-docker:
	@make check || exit 1
	@echo "Running integration tests with Redpanda..."
	LOG_LEVEL=debug ./test/docker-tests.sh

coverage-docker:
	@make check || exit 1
	@echo "Running integration tests with coverage..."
	LOG_LEVEL=debug ./test/docker-tests.sh coverage

shell:
	docker exec -it $(CONTAINER_NAME) /bin/sh

logs:
	docker logs -f $(CONTAINER_NAME)

stop:
	docker stop $(CONTAINER_NAME) 2>/dev/null || true

clean: stop
	docker rm $(CONTAINER_NAME) 2>/dev/null || true
	docker rmi $(IMAGE_NAME) 2>/dev/null || true
