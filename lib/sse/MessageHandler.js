'use strict';

const P = require('bluebird');
const _ = require('lodash');
const log = require('../logger');
const { DeserializationError, FilterError } = require('../errors');

function objectFactory(data) {
    if (_.isPlainObject(data)) return data;

    if (data instanceof Buffer) {
        data = data.toString('utf-8');
    }

    if (_.isString(data)) {
        data = JSON.parse(data);
    } else {
        throw new Error(
            'Could not convert data into an object. ' +
            'Data must be a utf-8 byte buffer or a JSON string'
        );
    }

    return data;
}

function deserializeKafkaMessage(kafkaMessage) {
    kafkaMessage.message = objectFactory(kafkaMessage.value);

    kafkaMessage.message._kafka = {
        topic: kafkaMessage.topic,
        partition: kafkaMessage.partition,
        offset: Number(kafkaMessage.offset),
        timestamp: kafkaMessage.timestamp || null,
        key: kafkaMessage.key ? kafkaMessage.key.toString() : null,
    };

    return kafkaMessage;
}

class MessageHandler {
    constructor(consumer, options, logger) {
        this.consumer = consumer;
        this.options = options;
        this.log = logger || log;
        this.idleDelayMs = options.idleDelayMs || 100;
        this.deserializer = options.deserializer || deserializeKafkaMessage;
        this.filterer = options.filterer;
        this.latestOffsetsMap = {};
        this.isFinished = false;
    }

    setFinished() {
        this.isFinished = true;
    }

    updateLatestOffsets(kafkaMessage) {
        const key = `${kafkaMessage.topic}/${kafkaMessage.partition}`;
        this.latestOffsetsMap[key] = {
            topic: kafkaMessage.topic,
            partition: kafkaMessage.partition,
        };

        if (this.options.useTimestampForId) {
            this.latestOffsetsMap[key].timestamp = Number(kafkaMessage.timestamp) + 1;
        } else {
            this.latestOffsetsMap[key].offset = Number(kafkaMessage.offset) + 1;
        }

        return this.latestOffsetsMap;
    }

    async process() {
        if (this.isFinished) {
            this.log.debug('MessageHandler: finished, skipping');
            return null;
        }

        this.log.trace('Polling Kafka for messages...');
        const messages = this.consumer.consume(1);

        if (!messages || messages.length === 0) {
            this.log.trace('No messages received, sleeping...');
            await P.delay(this.idleDelayMs);
            return null;
        }

        const kafkaMessage = messages[0];
        this.log.debug(
            { topic: kafkaMessage.topic, partition: kafkaMessage.partition, offset: kafkaMessage.offset },
            'Received message from Kafka'
        );

        return this.handleMessage(kafkaMessage);
    }

    async handleMessage(kafkaMessage) {
        try {
            const deserialized = await this.deserialize(kafkaMessage);
            const filtered = await this.filter(deserialized);
            this.updateLatestOffsets(kafkaMessage);
            return filtered;
        } catch (e) {
            if (e instanceof DeserializationError || e instanceof FilterError) {
                this.log.warn({ err: e }, 'Message handling error, skipping');
                return null;
            }
            throw e;
        }
    }

    deserialize(kafkaMessage) {
        if (!this.deserializer) return kafkaMessage;

        try {
            return this.deserializer(kafkaMessage);
        } catch (e) {
            throw new DeserializationError(
                'Failed deserializing message: ' + e.toString(),
                { kafkaMessage, originalError: e }
            );
        }
    }

    filter(kafkaMessage) {
        if (!this.filterer) return kafkaMessage;

        const result = this.filterer(kafkaMessage);
        if (!result) {
            this.log.trace({ kafkaMessage }, 'Message filtered out');
        }
        return result ? kafkaMessage : false;
    }
}

module.exports = { MessageHandler, deserializeKafkaMessage, objectFactory };
