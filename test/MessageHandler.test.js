const { MessageHandler } = require('../lib/sse/MessageHandler');

describe('MessageHandler', () => {
    let mockConsumer;
    let mockLogger;
    let mockOptions;

    beforeEach(() => {
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn()
        };

        mockOptions = {
            useTimestampForId: false,
            idleDelayMs: 100
        };

        mockConsumer = {
            run: jest.fn().mockResolvedValue(undefined)
        };
    });

    test('should create MessageHandler instance', () => {
        const handler = new MessageHandler(mockConsumer, mockOptions, mockLogger);
        expect(handler.consumer).toBe(mockConsumer);
        expect(handler.options).toBe(mockOptions);
        expect(handler.log).toBe(mockLogger);
        expect(handler.isFinished).toBe(false);
        expect(handler.running).toBe(false);
    });

    test('should set finished state', () => {
        const handler = new MessageHandler(mockConsumer, mockOptions, mockLogger);
        handler.setFinished();
        expect(handler.isFinished).toBe(true);
    });

    test('should start and set running state', () => {
        const handler = new MessageHandler(mockConsumer, mockOptions, mockLogger);
        const callback = jest.fn();
        handler.start(callback);
        expect(handler.running).toBe(true);
        expect(handler.onMessageCallback).toBe(callback);
    });

    test('should warn if already running', () => {
        const handler = new MessageHandler(mockConsumer, mockOptions, mockLogger);
        const callback = jest.fn();
        handler.start(callback);
        handler.start(callback);
        expect(mockLogger.warn).toHaveBeenCalledWith('MessageHandler already running');
    });

    test('should update latest offsets with offset when useTimestampForId is false', () => {
        const handler = new MessageHandler(mockConsumer, { useTimestampForId: false }, mockLogger);
        const kafkaMessage = {
            topic: 'test-topic',
            partition: 0,
            offset: '123',
            timestamp: '1700000000000'
        };

        const result = handler.updateLatestOffsets(kafkaMessage);
        expect(result['test-topic/0'].offset).toBe(124);
    });

    test('should update latest offsets with timestamp when useTimestampForId is true', () => {
        const handler = new MessageHandler(mockConsumer, { useTimestampForId: true }, mockLogger);
        const kafkaMessage = {
            topic: 'test-topic',
            partition: 0,
            offset: '123',
            timestamp: '1700000000000'
        };

        const result = handler.updateLatestOffsets(kafkaMessage);
        expect(result['test-topic/0'].timestamp).toBe(1700000000001);
    });

    test('should process return null when finished', async () => {
        const handler = new MessageHandler(mockConsumer, mockOptions, mockLogger);
        handler.setFinished();
        const result = await handler.process();
        expect(result).toBeNull();
        expect(mockConsumer.run).not.toHaveBeenCalled();
    });

    test('should call consumer.run with onMessage callback', async () => {
        const handler = new MessageHandler(mockConsumer, mockOptions, mockLogger);
        const callback = jest.fn().mockResolvedValue({ message: { test: 'data' } });
        
        handler.start(callback);
        await handler.process();

        expect(mockConsumer.run).toHaveBeenCalledTimes(1);
        const runCall = mockConsumer.run.mock.calls[0][0];
        expect(runCall).toHaveProperty('eachMessage');
        expect(typeof runCall.eachMessage).toBe('function');
    });

    test('should call onMessageCallback when message is received', async () => {
        const handler = new MessageHandler(mockConsumer, mockOptions, mockLogger);
        const callback = jest.fn();
        
        handler.start(callback);
        handler.latestOffsetsMap = { 'test/0': { offset: 1 } };
        
        await handler.process();

        const runCall = mockConsumer.run.mock.calls[0][0];
        const mockMessage = {
            topic: 'test',
            partition: 0,
            offset: '0',
            value: Buffer.from('{"test":"data"}'),
            timestamp: '1700000000000'
        };

        await runCall.eachMessage({ topic: 'test', partition: 0, message: mockMessage });

        expect(callback).toHaveBeenCalled();
    });
});
