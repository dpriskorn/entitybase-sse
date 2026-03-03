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

        // Derive admin brokers from regular brokers (replace port 9092 with 9644 for Redpanda)
        const adminBrokers = brokers.map(b => b.replace(/9092$/, '9644').replace(/9093$/, '9644'));

        console.log('[DEBUG] KafkaConsumerManager.connect - brokers:', brokers, 'adminBrokers:', adminBrokers, 'clientId:', clientId);

        this.log.info({ brokers, clientId }, 'Connecting to Kafka...');

        const kafka = new Kafka({
            clientId,
            brokers,
            admin: {
                brokers: adminBrokers,
                requestTimeout: 5000
            },
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

        console.log('[DEBUG] Connecting consumer to Kafka...');
        await this.consumer.connect();
        console.log('[DEBUG] Consumer connected successfully');
        return this.consumer;
    }

    async getTopicMetadata(allowedTopics) {
        console.log('[DEBUG] getTopicMetadata - creating admin client...');
        this.admin = this.consumer.kafka.admin();
        
        try {
            console.log('[DEBUG] getTopicMetadata - connecting admin...');
            await Promise.race([
                this.admin.connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Admin connect timeout')), 5000))
            ]);
            console.log('[DEBUG] getTopicMetadata - fetching topic metadata...');
            const metadata = await Promise.race([
                this.admin.fetchTopicMetadata(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch metadata timeout')), 5000))
            ]);
            console.log('[DEBUG] getTopicMetadata - disconnecting admin...');
            await this.admin.disconnect();
            console.log('[DEBUG] getTopicMetadata - done');

            const topics = metadata.topics
                .map(t => t.name)
                .filter(t => t !== '__consumer_offsets');

            if (allowedTopics) {
                this.log.info({ allowed: allowedTopics, available: topics }, 'Filtering topics');
                return topics.filter(t => allowedTopics.includes(t));
            }

            return topics;
        } catch (err) {
            console.error('[DEBUG] getTopicMetadata error:', err.message);
            throw err;
        }
    }

    async getFullTopicMetadata() {
        console.log('[DEBUG] getFullTopicMetadata - creating admin client...');
        const admin = this.consumer.kafka.admin();
        
        try {
            console.log('[DEBUG] getFullTopicMetadata - connecting admin...');
            await Promise.race([
                admin.connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Admin connect timeout')), 5000))
            ]);
            console.log('[DEBUG] getFullTopicMetadata - fetching topic metadata...');
            const metadata = await Promise.race([
                admin.fetchTopicMetadata(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch metadata timeout')), 5000))
            ]);
            console.log('[DEBUG] getFullTopicMetadata - disconnecting admin...');
            await admin.disconnect();
            console.log('[DEBUG] getFullTopicMetadata - done');
            return metadata.topics.filter(t => t.name !== '__consumer_offsets');
        } catch (err) {
            console.error('[DEBUG] getFullTopicMetadata error:', err.message);
            throw err;
        }
    }

    async assign(partitions) {
        this.log.info({ partitions }, 'Assigning partitions');
        await this.consumer.assign({ partitions });
        this.log.info('Partitions assigned successfully');
    }

    consume() {
        console.log('[DEBUG] Consumer.consume() called');
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
