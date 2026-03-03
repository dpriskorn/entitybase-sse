'use strict';

const P = require('bluebird');
const bunyan = require('bunyan');
const _ = require('lodash');
const uuid = require('uuid');
const EventEmitter = require('events');

const SSEResponse = require('./SSEResponse');
const { KafkaConsumerManager } = require('./kafka');
const { validateAssignments, buildAssignments } = require('./kafka');
const { MessageHandler } = require('./sse');
const { ConfigurationError, InvalidAssignmentError, TopicNotAvailableError } = require('./errors');

class KafkaSSE {
    constructor(req, res, options) {
        this.req = req;
        this.res = res;
        this.id = req.headers['x-request-id'] || uuid();
        this.isFinished = false;
        this._eventEmitter = new EventEmitter();
        this.options = options || {};

        this.log = this.options.logger || bunyan.createLogger({
            name: 'KafkaSSE',
            id: this.id,
            src: true,
            level: 'debug'
        });

        this.log.info({ requestId: this.id }, 'Creating new KafkaSSE instance');

        this.kafkaConfig = this._buildKafkaConfig();
    }

    _buildKafkaConfig() {
        return Object.assign(
            { 'metadata.broker.list': 'localhost:9092', 'client.id': `KafkaSSE-${this.id}` },
            this.options.kafkaConfig,
            { 'enable.auto.commit': false, 'group.id': `KafkaSSE-${this.id}` }
        );
    }

    connect(assignments, atTimestamp) {
        this._init(assignments, atTimestamp)
            .then(() => this._start())
            .catch((e) => {
                if (this.sse && !this._resFinished()) {
                    return this.sse.send('error', e, [])
                        .catch(() => {});
                }
            })
            .catch((e) => {
                this._handleConnectError(e);
            })
            .finally(() => {
                if (!this.isFinished) {
                    return this.disconnect('finally');
                }
            });

        return new P((resolve) => {
            this._eventEmitter.on('done', () => {
                this.log.info('KafkaSSE connection done');
                resolve();
            });
        });
    }

    async _init(assignments, atTimestamp) {
        console.log('[DEBUG] _init called with assignments:', JSON.stringify(assignments), 'atTimestamp:', atTimestamp);
        
        if (this.isFinished || this._resFinished()) {
            throw new ConfigurationError('Cannot re-use a KafkaSSE instance', { statusCode: 500 });
        }

        if ('last-event-id' in this.req.headers) {
            console.log('[DEBUG] Found last-event-id header:', this.req.headers['last-event-id']);
            try {
                assignments = JSON.parse(this.req.headers['last-event-id']);
                console.log('[DEBUG] Parsed last-event-id as assignments:', JSON.stringify(assignments));
            } catch (e) {
                throw new InvalidAssignmentError(e, {
                    lastEventId: this.req.headers['last-event-id'],
                    statusCode: 400
                });
            }
        }

        if (typeof assignments === 'string') {
            assignments = assignments.split(',');
        }

        console.log('[DEBUG] Validating assignments:', JSON.stringify(assignments));
        validateAssignments(assignments);

        console.log('[DEBUG] Creating KafkaConsumerManager...');
        this.consumerManager = new KafkaConsumerManager(this.kafkaConfig, this.log);
        console.log('[DEBUG] Connecting to Kafka...');
        await this.consumerManager.connect();

        console.log('[DEBUG] Getting topic metadata...');
        this.availableTopics = await this.consumerManager.getTopicMetadata(this.options.allowedTopics);
        console.log('[DEBUG] Available topics:', this.availableTopics);

        if (this.availableTopics.length === 0) {
            throw new ConfigurationError(
                'No topics available for consumption',
                { allowedTopics: this.options.allowedTopics, statusCode: 500 }
            );
        }

        const topics = _.uniq(assignments.map(a => _.isString(a) ? a : a.topic));
        console.log('[DEBUG] Requested topics:', topics);
        this._checkTopicsAvailable(topics);

        console.log('[DEBUG] Getting full topic metadata...');
        const fullMetadata = await this.consumerManager.getFullTopicMetadata();
        console.log('[DEBUG] Full metadata topics:', fullMetadata.map(t => t.name));
        
        console.log('[DEBUG] Building assignments with atTimestamp:', atTimestamp);
        const resolvedAssignments = await buildAssignments(
            this.consumerManager.consumer,
            fullMetadata,
            assignments,
            atTimestamp
        );
        
        console.log('[DEBUG] Resolved assignments:', JSON.stringify(resolvedAssignments));

        console.log('[DEBUG] Assigning partitions...');
        await this.consumerManager.assign(resolvedAssignments);
        console.log('[DEBUG] Partitions assigned successfully');
    }

    _checkTopicsAvailable(topics) {
        const unavailable = topics.filter(t => !this.availableTopics.includes(t));
        if (unavailable.length > 0) {
            throw new TopicNotAvailableError(
                `Topics ${unavailable.join(', ')} are not available`,
                { availableTopics: this.availableTopics, statusCode: 404 }
            );
        }
    }

    async _start() {
        const responseHeaders = {};
        let disableSSEFormatting = false;

        if (this.req.headers.accept) {
            if (this.req.headers.accept.startsWith('application/json')) {
                responseHeaders['content-type'] = 'application/json; charset=utf-8';
                disableSSEFormatting = true;
            } else {
                responseHeaders['content-type'] = 'text/event-stream; charset=utf-8';
            }
        }

        this.sse = new SSEResponse(this.res, {
            headers: responseHeaders,
            disableSSEFormatting,
            log: this.log
        });

        this.messageHandler = new MessageHandler(
            this.consumerManager.consumer,
            this.options,
            this.log
        );

        await this.sse.start();
        this.log.info('SSE started, beginning consume loop');
        await this._loop();
    }

    async _loop() {
        if (this.isFinished) return;

        const message = await this.messageHandler.process();

        if (this.isFinished) {
            return;
        }

        if (message && message.message) {
            this.log.debug({ offset: message.offset }, 'Sending message to SSE');
            await this.sse.send(
                'message',
                message.message,
                Object.values(this.messageHandler.latestOffsetsMap)
            ).catch((e) => {
                this.log.warn({ err: e }, 'Error sending SSE message');
            });
        }

        return this._loop();
    }

    _handleConnectError(e) {
        if (this.isFinished || this._resFinished()) return;

        try {
            this.res.statusCode = e.statusCode || 500;
            this.res.statusMessage = e.toString();
            this.res.write(JSON.stringify(e) + '\n');
        } catch (err) {}
    }

    _resFinished() {
        return !this.res || this.res.finished || 
            (this.res.connection && this.res.connection.destroyed);
    }

    async disconnect(reason) {
        if (this.isFinished) {
            this.log.debug(`Already finished, ignoring: ${reason}`);
            return;
        }

        this.isFinished = true;
        this.log.info(`Disconnecting: ${reason}`);

        if (this.messageHandler) {
            this.messageHandler.setFinished();
        }

        if (this.sse) {
            const sse = this.sse;
            this.sse = null;
            try {
                await sse.end();
            } catch (e) {
                this.log.warn({ err: e }, 'Error ending SSE');
            }
        }

        if (this.consumerManager) {
            await this.consumerManager.disconnect();
        }

        this._eventEmitter.emit('done');
    }
}

module.exports = KafkaSSE;
