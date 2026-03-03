'use strict';

const { Kafka } = require('kafkajs');
const P = require('bluebird');

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
        this.admin = null;
    }

    async connect() {
        const brokers = parseBrokers(this.kafkaConfig['metadata.broker.list'] || DEFAULT_BROKER);
        const clientId = this.kafkaConfig['client.id'] || 'kafkasse';

        this.log.info({ brokers, clientId }, 'Connecting to Kafka...');

        const kafka = new Kafka({
            clientId,
            brokers,
            retry: {
                initialRetryTime: 100,
                retries: 3
            }
        });

        this.consumer = kafka.consumer({
            groupId: this.kafkaConfig['group.id'] || `kafkasse-${Date.now()}`,
            sessionTimeout: 30000,
            heartbeatInterval: 3000
        });

        await this.consumer.connect();
        this.log.info('Kafka consumer connected successfully');
        return this.consumer;
    }

    async getTopicMetadata(allowedTopics) {
        this.admin = this.consumer.kafka.admin();
        await this.admin.connect();
        const metadata = await this.admin.fetchTopicMetadata();
        await this.admin.disconnect();

        const topics = metadata.topics
            .map(t => t.name)
            .filter(t => t !== '__consumer_offsets');

        if (allowedTopics) {
            this.log.info({ allowed: allowedTopics, available: topics }, 'Filtering topics');
            return topics.filter(t => allowedTopics.includes(t));
        }

        return topics;
    }

    async getFullTopicMetadata() {
        const admin = this.consumer.kafka.admin();
        await admin.connect();
        const metadata = await admin.fetchTopicMetadata();
        await admin.disconnect();
        return metadata.topics.filter(t => t.name !== '__consumer_offsets');
    }

    async assign(partitions) {
        this.log.info({ partitions }, 'Assigning partitions');
        await this.consumer.assign({ partitions });
        this.log.info('Partitions assigned successfully');
    }

    consume() {
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
