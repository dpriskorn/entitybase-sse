#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const kafkaSseHandler = require('./index');

const port = 8081;
const kafkaBroker = process.env.KAFKA_BROKERS || 'localhost:9092';

const openApiSpec = yaml.parse(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));

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

            if (url === '/docs' || url === '/docs/') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(swaggerHtml);
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
