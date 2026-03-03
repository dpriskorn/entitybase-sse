#!/bin/bash
set -e

APP_NETWORK="kafka_net"
APP_NAME="testkafkasse"
DOCKER_COMPOSE_CMD="docker-compose -p ${APP_NAME}"
IMAGE_NAME="testkafkasse"
REDPANDA_CONTAINER="${APP_NAME}-redpanda-1"

cleanup() {
    echo "Cleaning up..."
    docker rm -f ${REDPANDA_CONTAINER} 2>/dev/null || true
}

trap cleanup EXIT

echo "Starting Redpanda..."
cd test/docker
${DOCKER_COMPOSE_CMD} up -d redpanda
cd ../..

sleep 15

echo "Loading fixtures using rpk from Redpanda container..."

# Use rpk from the Redpanda container to create topics and produce test data
docker exec ${REDPANDA_CONTAINER} rpk topic create kafkaSSE_test_01 -p 1 -r 1 2>/dev/null || true
docker exec ${REDPANDA_CONTAINER} rpk topic create kafkaSSE_test_02 -p 1 -r 1 2>/dev/null || true
docker exec ${REDPANDA_CONTAINER} rpk topic create kafkaSSE_test_03 -p 1 -r 1 2>/dev/null || true
docker exec ${REDPANDA_CONTAINER} rpk topic create kafkaSSE_test_04 -p 1 -r 1 2>/dev/null || true

# Produce test data
docker exec -i ${REDPANDA_CONTAINER} rpk topic produce kafkaSSE_test_01 < test/utils/test_data1.json 2>/dev/null || true
docker exec -i ${REDPANDA_CONTAINER} rpk topic produce kafkaSSE_test_02 < test/utils/test_data2.json 2>/dev/null || true
docker exec -i ${REDPANDA_CONTAINER} rpk topic produce kafkaSSE_test_03 < test/utils/test_data3.json 2>/dev/null || true
docker exec -i ${REDPANDA_CONTAINER} rpk topic produce kafkaSSE_test_04 < test/utils/test_data2.json 2>/dev/null || true

echo "Fixtures loaded!"

echo "Running tests..."
docker build -t "${IMAGE_NAME}" . 2>&1

docker run --rm \
    --net "${APP_NAME}_${APP_NETWORK}" \
    -e KAFKA_BROKERS=redpanda:9092 \
    -e UV_THREADPOOL_SIZE=128 \
    ${IMAGE_NAME} \
    npx mocha test/*.js -R spec --timeout 10000 2>&1

echo "Done!"
