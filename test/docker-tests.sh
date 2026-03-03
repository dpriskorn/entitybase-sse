#!/bin/bash
set -e

# This code has been tested with:
# - docker-engine^1.12.4
# - docker-compose^1.9.0
# Given it uses version 2 of docker-compose files,
# it should not be compatible with earlier versions.

# Network name configured in docker file:
APP_NETWORK="kafka_net"

# Internally used variables
APP_NAME="testkafkasse"
DOCKER_COMPOSE_CMD="docker-compose -p ${APP_NAME}"
IMAGE_NAME="testkafkasse"

# Initialised to empty
REDPANDA_CONTAINERS=""


# Build and start redpanda container
start_redpanda() {
    echo "Starting Redpanda container..."
    pushd test/docker > /dev/null
    ${DOCKER_COMPOSE_CMD} up -d redpanda 2>/dev/null || true
    popd > /dev/null

    # Wait for Redpanda to be ready
    echo "Waiting for Redpanda to be ready..."
    sleep 10

    # Check redpanda container is running
    REDPANDA_CONTAINERS=$(docker ps | grep "redpanda")
    if [ -z "${REDPANDA_CONTAINERS}" ]; then
        echo "No redpanda container running - Stopping in error!" && exit 1
    else
        echo "Redpanda container running - Moving forward!"
    fi
}

stop_redpanda() {
    echo "Stopping Redpanda container (if any)..."
    pushd test/docker > /dev/null
    ${DOCKER_COMPOSE_CMD} stop redpanda 2>/dev/null || true
    ${DOCKER_COMPOSE_CMD} rm -f redpanda 2>&1 || true
    popd > /dev/null

    # Also try to clean up any leftover containers
    docker rm -f testkafkasse_redpanda_1 2>/dev/null || true

    REDPANDA_CONTAINERS=$(docker ps | grep "redpanda" || true)
    if [ -z "${REDPANDA_CONTAINERS}" ]; then
        echo "No redpanda container running - Good!"
    else
        echo "Redpanda container still running - Not good!" && exit 1
    fi
}


build_and_test() {
    # Build testKafkaSSE image and run it (execute tests)
    echo "Building ${IMAGE_NAME} docker image."
    docker build -t "${IMAGE_NAME}" . 2>&1
    echo "Executing ${IMAGE_NAME} docker image (run tests)."
    TEST_OUTPUT=$(docker run --rm --net "${APP_NAME}_${APP_NETWORK}" -e KAFKA_BROKERS=redpanda:9092 "${IMAGE_NAME}" npm run test-redpanda 2>&1)
    echo "${TEST_OUTPUT}"
    
    # Check if there were any errors
    if echo "${TEST_OUTPUT}" | grep -qi "ERR"; then
        TEST_SUCCESS="ERRORS FOUND"
    else
        TEST_SUCCESS=""
    fi
}

check_test() {
    if [ -z "${TEST_SUCCESS}" ]; then
        echo "Tests successful !" && exit 0
    else
        echo "Tests NOT successful :(" 
        echo "${TEST_SUCCESS}"
        exit 1
    fi
}


stop_redpanda

start_redpanda

# Give some time for Redpanda to be fully ready
sleep 5

build_and_test

stop_redpanda

check_test
