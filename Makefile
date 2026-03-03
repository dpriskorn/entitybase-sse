.PHONY: help build run test test-docker stop clean shell logs docs

IMAGE_NAME=kafkasse
CONTAINER_NAME=kafkasse
PORT=8081
KAFKA_BROKERS?=localhost:9092

help:
	@echo "KafkaSSE Docker Makefile"
	@echo ""
	@echo "Targets:"
	@echo "  make build        - Build Docker image"
	@echo "  make run          - Run container (requires redpanda at localhost:9092)"
	@echo "  make test         - Run tests (requires Kafka at KAFKA_BROKERS, default localhost:9092)"
	@echo "  make test-docker  - Run docker-compose tests (kafka in docker)"
	@echo "  make shell        - Open shell in running container"
	@echo "  make logs         - View container logs"
	@echo "  make stop         - Stop running container"
	@echo "  make clean        - Remove container and image"
	@echo "  make docs         - Generate PlantUML diagrams"
	@echo ""
	@echo "Environment variables:"
	@echo "  KAFKA_BROKERS     - Kafka broker address (default: localhost:9092)"

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

test-docker:
	./test/docker-tests.sh

shell:
	docker exec -it $(CONTAINER_NAME) /bin/sh

logs:
	docker logs -f $(CONTAINER_NAME)

stop:
	docker stop $(CONTAINER_NAME) 2>/dev/null || true

clean: stop
	docker rm $(CONTAINER_NAME) 2>/dev/null || true
	docker rmi $(IMAGE_NAME) 2>/dev/null || true
