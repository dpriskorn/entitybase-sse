#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const swaggerUi = require('swagger-ui-express');
const kafkaSseHandler = require('./index');

const port = 8081;
const kafkaBroker = process.env.KAFKA_BROKERS || 'localhost:9092';

const openApiSpec = yaml.parse(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));

class KafkaSSEServer {

    constructor() {
        this.server = http.createServer();
        this.server.on('request', (req, res) => {
            const url = req.url;

            if (url === '/' || url === '') {
                res.writeHead(302, { 'Location': '/docs' });
                res.end();
                return;
            }

            if (url === '/docs' || url.startsWith('/docs/')) {
                swaggerUi.setup(openApiSpec)(req, res);
                return;
            }

            if (url === '/openapi.yaml') {
                res.writeHead(200, { 'Content-Type': 'application/yaml' });
                res.end(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));
                return;
            }

            const splitUrl = url.replace('/', '').split("?timestamp=");
            const topics = splitUrl[0].split(',');
            console.log(`Handling SSE request for topics ${topics}`);
            const options = {
                kafkaConfig: { 'metadata.broker.list': kafkaBroker },
                useTimestampForId: true
            }

            let atTimestamp = splitUrl.length > 1 ? Number(splitUrl[1]) : undefined;

            kafkaSseHandler(req, res, topics, options, atTimestamp);
        });
    }

    listen() {
        this.server.listen(port);
        console.log(`Listening for HTTP SSE connections on port ${port}`);
        console.log(`API docs available at http://localhost:${port}/docs`);
    }
}

if (require.main === module) {
    new KafkaSSEServer().listen();
}

module.exports = KafkaSSEServer;
