'use strict';

const { Kafka } = require('kafkajs');
const log = require('../logger');

const DEFAULT_BROKER = 'localhost:9092';

function parseBrokers(brokerList) {
    if (Array.isArray(brokerList)) return brokerList;
    if (typeof brokerList === 'string') {
        return brokerList.split(',').map(b => b.trim());
    }
    return [DEFAULT_BROKER];
}

class KafkaConsumerManager {
    constructor(kafkaConfig, logger) {
        this.log = logger;
        this.kafkaConfig = kafkaConfig;
        this.consumer = null;
        this.kafka = null;
    }

    async connect() {
        const brokers = parseBrokers(this.kafkaConfig['metadata.broker.list'] || DEFAULT_BROKER);
        const clientId = this.kafkaConfig['client.id'] || 'kafkasse';

        this.log.info({ brokers, clientId }, 'Connecting to Kafka...');

        this.kafka = new Kafka({
            clientId,
            brokers,
            retry: {
                initialRetryTime: 100,
                retries: 3
            }
        });

        this.consumer = this.kafka.consumer({
            groupId: this.kafkaConfig['group.id'] || `kafkasse-${Date.now()}`,
            sessionTimeout: 30000,
            heartbeatInterval: 3000
        });

        await this.consumer.connect();
        this.log.info('Kafka consumer connected successfully');
        return this.consumer;
    }

    async getTopicMetadata(allowedTopics) {
        if (allowedTopics) {
            return allowedTopics;
        }
        this.log.debug('Fetching topic metadata from Kafka...');
        const admin = this.kafka.admin();
        await admin.connect();
        const metadata = await admin.fetchTopicMetadata();
        await admin.disconnect();
        const topicNames = metadata.topics.map(t => t.name);
        this.log.debug({ topics: topicNames }, 'Got topics from Kafka');
        return topicNames;
    }

    async getFullTopicMetadata() {
        this.log.debug('Fetching full topic metadata from Kafka...');
        const admin = this.kafka.admin();
        await admin.connect();
        const metadata = await admin.fetchTopicMetadata();
        await admin.disconnect();
        this.log.debug({ topicCount: metadata.topics.length }, 'Got full topic metadata');
        return metadata.topics;
    }

    async assign(partitions) {
        this.log.info({ partitions }, 'Assigning partitions');
        for (const p of partitions) {
            this.log.debug({ partition: p }, 'Subscribing to topic');
            await this.consumer.subscribe({ topic: p.topic, fromBeginning: p.offset === -1 });
        }
        this.log.info('Partitions assigned successfully');
    }

    async consume() {
        this.log.debug('Consume method called');
        this.log.debug({ consumerMethods: Object.keys(this.consumer) }, 'Consumer keys');
        return this.consumer.consume(1);
    }

    async disconnect() {
        if (!this.consumer) return;
        try {
            await this.consumer.disconnect();
            this.log.debug('Kafka consumer disconnected');
        } catch (e) {
            this.log.warn({ err: e }, 'Error disconnecting consumer');
        }
    }
}

module.exports = { KafkaConsumerManager, parseBrokers };
