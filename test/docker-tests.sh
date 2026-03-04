#!/bin/bash
set -e

APP_NETWORK="kafka_net"
APP_NAME="entitybase-sse-test"
DOCKER_COMPOSE_CMD="docker-compose -p ${APP_NAME}"
IMAGE_NAME="entitybase-sse-test"
REDPANDA_CONTAINER="${APP_NAME}-redpanda-1"
TEST_TYPE="${1:-test}"

cleanup() {
    echo "Cleaning up..."
    docker rm -f ${REDPANDA_CONTAINER} 2>/dev/null || true
}

trap cleanup EXIT

# Check if Redpanda is already running
EXISTING_REDPANDA=$(docker ps --format '{{.Names}}' | grep -E '^redpanda$' | head -1)

if [ -n "$EXISTING_REDPANDA" ]; then
    echo "Using existing Redpanda container: $EXISTING_REDPANDA"
    REDPANDA_CONTAINER="$EXISTING_REDPANDA"
    
    # Load fixtures using existing Redpanda
    echo "Loading fixtures..."
    docker exec ${REDPANDA_CONTAINER} rpk topic create kafkaSSE_test_01 -p 1 -r 1 2>/dev/null || true
    docker exec ${REDPANDA_CONTAINER} rpk topic create kafkaSSE_test_02 -p 1 -r 1 2>/dev/null || true
    docker exec ${REDPANDA_CONTAINER} rpk topic create kafkaSSE_test_03 -p 1 -r 1 2>/dev/null || true
    docker exec ${REDPANDA_CONTAINER} rpk topic create kafkaSSE_test_04 -p 1 -r 1 2>/dev/null || true

    docker exec -i ${REDPANDA_CONTAINER} rpk topic produce kafkaSSE_test_01 < test/utils/test_data1.json 2>/dev/null || true
    docker exec -i ${REDPANDA_CONTAINER} rpk topic produce kafkaSSE_test_02 < test/utils/test_data2.json 2>/dev/null || true
    docker exec -i ${REDPANDA_CONTAINER} rpk topic produce kafkaSSE_test_03 < test/utils/test_data3.json 2>/dev/null || true
    docker exec -i ${REDPANDA_CONTAINER} rpk topic produce kafkaSSE_test_04 < test/utils/test_data2.json 2>/dev/null || true
    
    echo "Fixtures loaded!"
    
    # Build and run tests with host network
    echo "Building image..."
    docker build -t "${IMAGE_NAME}" . 2>&1
    
    echo "Running tests with Docker..."
    docker run --rm \
        --network host \
        -e KAFKA_BROKERS=localhost:9092 \
        -e UV_THREADPOOL_SIZE=128 \
        ${IMAGE_NAME} \
        npm test 2>&1
else
    echo "Starting Redpanda..."
    cd test/docker
    ${DOCKER_COMPOSE_CMD} up -d redpanda
    cd ../..

    sleep 15

    echo "Loading fixtures using rpk from Redpanda container..."

    docker exec ${REDPANDA_CONTAINER} rpk topic create kafkaSSE_test_01 -p 1 -r 1 2>/dev/null || true
    docker exec ${REDPANDA_CONTAINER} rpk topic create kafkaSSE_test_02 -p 1 -r 1 2>/dev/null || true
    docker exec ${REDPANDA_CONTAINER} rpk topic create kafkaSSE_test_03 -p 1 -r 1 2>/dev/null || true
    docker exec ${REDPANDA_CONTAINER} rpk topic create kafkaSSE_test_04 -p 1 -r 1 2>/dev/null || true

    docker exec -i ${REDPANDA_CONTAINER} rpk topic produce kafkaSSE_test_01 < test/utils/test_data1.json 2>/dev/null || true
    docker exec -i ${REDPANDA_CONTAINER} rpk topic produce kafkaSSE_test_02 < test/utils/test_data2.json 2>/dev/null || true
    docker exec -i ${REDPANDA_CONTAINER} rpk topic produce kafkaSSE_test_03 < test/utils/test_data3.json 2>/dev/null || true
    docker exec -i ${REDPANDA_CONTAINER} rpk topic produce kafkaSSE_test_04 < test/utils/test_data2.json 2>/dev/null || true

    echo "Fixtures loaded!"

    echo "Running tests with Docker..."
    docker build -t "${IMAGE_NAME}" . 2>&1

    echo "Executing tests..."
    docker run --rm \
        --net "${APP_NAME}_${APP_NETWORK}" \
        -e KAFKA_BROKERS=redpanda:9092 \
        -e UV_THREADPOOL_SIZE=128 \
        ${IMAGE_NAME} \
        npm test 2>&1
fi

echo "Done!"
