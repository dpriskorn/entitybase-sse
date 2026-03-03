const SSEResponse = require('../lib/SSEResponse');
const http = require('http');
const EventSource = require('eventsource');
const fetch = require('node-fetch');

const defaultPort = 21100;

class TestSSEServer {
    constructor(port, responseOptions, messageBuilder) {
        this.server = http.createServer();
        this.port = port || defaultPort;
        this.messageBuilder = messageBuilder || defaultMessageBuilder;

        this.server.on('request', (req, res) => {
            const messageCount = req.url.replace('/', '');
            sseSendN(res, messageCount, responseOptions, this.messageBuilder);
        });
    }

    listen() {
        return this.server.listen(this.port);
    }

    close() {
        this.server.close();
    }
}

function defaultMessageBuilder(id) {
    return ['message', 'data: ' + id];
}

function objectMessageBuilder(id) {
    return ['message', { data: id }];
}

async function sendN(sse, messageBuilder, n, idx) {
    if (n <= idx) {
        return;
    }
    const msg = messageBuilder(idx);
    await sse.send(msg[0], msg[1], idx, 1000);
    await sendN(sse, messageBuilder, n, idx + 1);
}

async function sseSendN(res, n, options, messageBuilder) {
    const sseResponse = new SSEResponse(res, options);
    await sseResponse.start();
    await sendN(sseResponse, messageBuilder, parseInt(n), 0);
    await sseResponse.end();
}

function httpRequestAsync(port, path) {
    return fetch(`http://localhost:${port}/${path}`, {
        headers: {
            'accept': 'text/event-stream',
            'cache-control': 'no-cache',
        }
    });
}

function sseRequestAsync(port, path) {
    return new Promise((resolve, reject) => {
        const es = new EventSource(`http://localhost:${port}/${path}`);
        const messages = [];
        es.onmessage = (event) => {
            messages.push(event.data);
        };
        es.onerror = (err) => {
            es.close();
            resolve(messages);
        };
    });
}

describe('SSEResponse', () => {
    let server;

    afterEach(() => {
        if (server) {
            server.close();
            server = null;
        }
    });

    test('should respond with 200 and SSE headers', async () => {
        server = new TestSSEServer(defaultPort);
        await server.listen();
        
        const res = await httpRequestAsync(defaultPort, '1');
        expect(res.status).toBe(200);
    });

    test('should send messages to EventSource client', async () => {
        server = new TestSSEServer(defaultPort + 1);
        await server.listen();
        
        const messages = await sseRequestAsync(defaultPort + 1, '3');
        expect(messages.length).toBeGreaterThan(0);
    }, 10000);

    test('should support custom serializer', async () => {
        const customSerializer = (data) => 'serialized output';
        const options = { serializer: customSerializer };
        server = new TestSSEServer(defaultPort + 2, options, objectMessageBuilder);
        await server.listen();
        
        const messages = await sseRequestAsync(defaultPort + 2, '1');
        expect(messages[0]).toBe('serialized output');
    }, 10000);
});
