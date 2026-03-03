.PHONY: help build run test test-local test-unit test-docker coverage stop clean shell logs docs

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

test-local:
	@echo "Installing dependencies..."
	npm install
	@echo "Running all tests..."
	npm test

test-unit:
	@echo "Installing dependencies..."
	npm install
	@echo "Running unit tests (no Kafka required)..."
	npx jest --verbose --forceExit --testPathIgnorePatterns="integration"

docs:
	./scripts/generate-diagrams.sh

build:
	docker build -t $(IMAGE_NAME) .

run:
	docker run -d \
		--name $(CONTAINER_NAME) \
		--network host \
		-e KAFKA_BROKERS=$(KAFKA_BROKERS) \
		-p $(PORT):$(PORT) \
		$(IMAGE_NAME)

test:
	@echo "Running tests requires Kafka broker at KAFKA_BROKERS"
	@echo "Make sure Kafka/Redpanda is running at localhost:9092 or set KAFKA_BROKERS"
	@echo "Or use 'make test-docker' to run tests with Kafka in Docker"
	docker run --rm --network host -e KAFKA_BROKERS=$(KAFKA_BROKERS) $(IMAGE_NAME) npm test

coverage:
	@echo "Running tests with coverage requires Kafka broker at KAFKA_BROKERS"
	@echo "Make sure Kafka/Redpanda is running at localhost:9092 or set KAFKA_BROKERS"
	docker run --rm --network host -e KAFKA_BROKERS=$(KAFKA_BROKERS) $(IMAGE_NAME) npm run coverage

test-docker:
	./test/docker-tests.sh

coverage-docker:
	./test/docker-tests.sh coverage

shell:
	docker exec -it $(CONTAINER_NAME) /bin/sh

logs:
	docker logs -f $(CONTAINER_NAME)

stop:
	docker stop $(CONTAINER_NAME) 2>/dev/null || true

clean: stop
	docker rm $(CONTAINER_NAME) 2>/dev/null || true
	docker rmi $(IMAGE_NAME) 2>/dev/null || true
