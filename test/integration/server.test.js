const http = require('http');

const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';

async function makeRequest(path, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, `http://localhost:8081`);
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
            });
        });
        req.on('error', reject);
        req.setTimeout(timeout, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

describe('KafkaSSEServer Endpoints', () => {
    const baseUrl = `http://localhost:${process.env.PORT || 8081}`;
    let server;

    beforeAll(async () => {
        process.env.KAFKA_BROKERS = KAFKA_BROKERS;
        process.env.LOG_LEVEL = 'error';
        const Server = require('../server');
        server = new Server();
        
        await new Promise((resolve) => {
            server.server.on('listening', resolve);
            server.server.on('error', (err) => {
                console.error('Server error:', err.message);
                resolve();
            });
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }, 30000);

    afterAll((done) => {
        if (server && server.server) {
            server.server.close(() => done());
            setTimeout(done, 1000);
        } else {
            done();
        }
    });

    describe('GET /', () => {
        test('should redirect to /docs', async () => {
            const res = await makeRequest('/');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/docs');
        });
    });

    describe('GET /docs', () => {
        test('should return HTML with Swagger UI', async () => {
            const res = await makeRequest('/docs');
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('text/html');
            expect(res.body).toContain('swagger-ui');
        });
    });

    describe('GET /openapi.yaml', () => {
        test('should return OpenAPI spec', async () => {
            const res = await makeRequest('/openapi.yaml');
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('application/yaml');
            expect(res.body).toContain('openapi:');
        });
    });

    describe('GET /spec', () => {
        test('should return OpenAPI spec (alias)', async () => {
            const res = await makeRequest('/spec');
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('application/yaml');
            expect(res.body).toContain('openapi:');
        });
    });

    describe('GET /v1/streams', () => {
        test('should return list of streams', async () => {
            const res = await makeRequest('/v1/streams', 15000);
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('application/json');
            const data = JSON.parse(res.body);
            expect(data).toHaveProperty('streams');
            expect(Array.isArray(data.streams)).toBe(true);
        }, 20000);
    });

    describe('GET /v1/streams?spec', () => {
        test('should return OpenAPI paths format', async () => {
            const res = await makeRequest('/v1/streams?spec', 15000);
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('application/json');
            const data = JSON.parse(res.body);
            expect(data).toHaveProperty('paths');
        }, 20000);
    });

    describe('GET /unknown', () => {
        test('should return 404 for unknown routes', async () => {
            const res = await makeRequest('/unknown');
            expect(res.statusCode).toBe(404);
            const data = JSON.parse(res.body);
            expect(data).toHaveProperty('error');
        });
    });
});
