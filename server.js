#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { Kafka } = require('kafkajs');
const kafkaSseHandler = require('./index');
const log = require('./lib/logger');

const port = 8888;
const kafkaBroker = process.env.KAFKA_BROKERS || 'localhost:9092';
const logLevel = process.env.LOG_LEVEL || 'debug';

log.setLevel(logLevel);
log.info(`Starting SSE server, LOG_LEVEL=${logLevel}, KAFKA_BROKERS=${kafkaBroker}`);

const openApiSpec = yaml.parse(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KafkaSSE API</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
</head>
<body>
    <div id="swagger-ui"></div>
    <script>
        window.onload = () => {
            window.ui = SwaggerUIBundle({
                url: '/openapi.yaml',
                dom_id: '#swagger-ui',
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIBundle.SwaggerUIStandalonePreset
                ]
            });
        };
    </script>
</body>
</html>`;

async function listTopics() {
    log.debug('Fetching topic metadata from Kafka...');
    const kafka = new Kafka({
        clientId: 'kafkasse-admin',
        brokers: kafkaBroker.split(',').map(b => b.trim())
    });
    const admin = kafka.admin();
    await admin.connect();
    const metadata = await admin.fetchTopicMetadata();
    await admin.disconnect();
    const topics = metadata.topics.map(t => t.name);
    log.debug({ topics }, 'Fetched topics from Kafka');
    return topics;
}

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

class KafkaSSEServer {

    constructor() {
        this.server = http.createServer();
        this.server.on('request', async (req, res) => {
            const url = req.url;
            const method = req.method;

            log.info({ method, url }, 'Incoming request');

            if (req.method === 'OPTIONS') {
                setCorsHeaders(res);
                res.writeHead(204);
                res.end();
                return;
            }

            if (url === '/' || url === '') {
                res.writeHead(302, { 'Location': '/docs' });
                res.end();
                return;
            }

            if (url === '/version') {
                setCorsHeaders(res);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ version: packageJson.version }));
                return;
            }

            if (url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'healthy' }));
                return;
            }

            if (url === '/docs' || url === '/docs/') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(swaggerHtml);
                return;
            }

            if (url === '/openapi.yaml' || url === '/spec') {
                res.writeHead(200, { 'Content-Type': 'application/yaml' });
                res.end(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));
                return;
            }

            if (url.startsWith('/v1/streams')) {
                setCorsHeaders(res);
                try {
                    const topics = await listTopics();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ streams: topics }));
                } catch (err) {
                    log.error({ method, url, err: err.message }, 'Error listing topics');
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
                return;
            }

            if (url.startsWith('/v1/stream/')) {
                const streamPath = url.replace('/v1/stream/', '');
                const [topicPart] = streamPath.split('?');
                const topics = topicPart.split(',');
                
                const urlObj = new URL(url, `http://localhost:${port}`);
                const partition = urlObj.searchParams.get('partition');
                const offset = urlObj.searchParams.get('offset');
                const timestamp = urlObj.searchParams.get('timestamp');
                
                let assignments = topics;
                if (partition !== null && offset !== null) {
                    assignments = topics.map(t => ({
                        topic: t,
                        partition: parseInt(partition, 10),
                        offset: parseInt(offset, 10)
                    }));
                }
                
                log.info({ topics, assignments, partition, offset, timestamp }, 'Handling SSE request');
                setCorsHeaders(res);
                const options = {
                    kafkaConfig: { 'metadata.broker.list': kafkaBroker },
                    useTimestampForId: true
                };
                kafkaSseHandler(req, res, assignments, options, timestamp ? parseInt(timestamp, 10) : null);
                return;
            }

            log.warn({ url }, 'Unhandled route, returning 404');
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        });
    }

    listen() {
        this.server.listen(port, '0.0.0.0');
        log.info(`Listening for HTTP SSE connections on port ${port}`);
        log.info(`API docs available at http://localhost:${port}/docs`);
    }
}

if (require.main === module) {
    new KafkaSSEServer().listen();
}

module.exports = KafkaSSEServer;
