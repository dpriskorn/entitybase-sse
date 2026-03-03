const errors = require('../lib/errors');

describe('KafkaSSEError', () => {
    test('should construct and set name', () => {
        const ke = new errors.KafkaSSEError('test error');
        expect(ke.message).toBe('test error');
        expect(ke.name).toBe('KafkaSSEError');
    });

    test('should construct with extra properties', () => {
        const extra = { prop1: 'a property value' };
        const ke = new errors.KafkaSSEError('test error', extra);
        expect(ke.prop1).toBe(extra.prop1);
    });

    test('should serialize to JSON and back with extra properties', () => {
        const extra = { prop1: 'a property value' };
        const ke = new errors.KafkaSSEError('test error', extra);
        const deserializedError = JSON.parse(JSON.stringify(ke));
        expect(deserializedError.message).toBe(ke.message);
        expect(deserializedError.name).toBe(ke.name);
        expect(deserializedError.prop1).toBe(ke.prop1);
    });
});

describe('ConfigurationError', () => {
    test('should be instanceof KafkaSSEError', () => {
        const ce = new errors.ConfigurationError('test error');
        expect(ce).toBeInstanceOf(errors.KafkaSSEError);
    });
});
