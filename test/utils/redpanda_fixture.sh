#!/bin/bash
set -e

KAFKA_BROKER=${KAFKA_BROKER:-localhost:9092}

echo "Using Kafka broker: $KAFKA_BROKER"

dropTopics() {
    local pattern=$1
    echo "Looking for topics matching '*${pattern}*'..."
    TOPICS=$(rpk topic list --brokers "$KAFKA_BROKER" 2>/dev/null | grep "$pattern" | awk '{print $1}')
    for TOPIC in ${TOPICS}; do
        echo "Deleting topic ${TOPIC}"
        rpk topic delete "$TOPIC" --brokers "$KAFKA_BROKER" 2>/dev/null || true
    done
}

createTopic() {
    local topic=$1
    echo "Creating topic ${topic}"
    rpk topic create "$topic" -p 1 -r 1 --brokers "$KAFKA_BROKER" 2>/dev/null || true
}

produceTestData() {
    local topic=$1
    local file=$2
    echo "Producing ${file} into topic ${topic}"
    rpk topic produce "$topic" --brokers "$KAFKA_BROKER" < "$file" 2>/dev/null || true
}

check() {
    local port=$1
    local service=$2
    if ! nc -z localhost "$port" 2>/dev/null; then
        echo "$service not running on port $port"
        exit 1
    fi
}

echo "Checking services..."
check 9092 "Redpanda/Kafka"
dropTopics "kafkaSSE_test_"
sleep 2

# Create topics and produce test data
(createTopic kafkaSSE_test_01 && produceTestData kafkaSSE_test_01 "$(dirname "$0")/test_data1.json") &
(createTopic kafkaSSE_test_02 && produceTestData kafkaSSE_test_02 "$(dirname "$0")/test_data2.json") &
(createTopic kafkaSSE_test_03 && produceTestData kafkaSSE_test_03 "$(dirname "$0")/test_data3.json") &
(createTopic kafkaSSE_test_04 && produceTestData kafkaSSE_test_04 "$(dirname "$0")/test_data2.json") &

wait

echo "Fixtures loaded successfully"
