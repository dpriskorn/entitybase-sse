'use strict';


// mocha defines to avoid JSHint breakage
/* global describe, it, before, beforeEach, after, afterEach */

const assert = require('assert');

const errors                 = require('../lib/errors');
const KafkaSSEError           = errors.KafkaSSEError;
const ConfigurationError       = errors.ConfigurationError;


describe('KafkaSSEError', () => {
    it('should construct and set name', function() {
        let m = 'error string';
        let ke = new KafkaSSEError(m);

        assert.equal(ke.message, m);
        assert.equal(ke.name, 'KafkaSSEError');
    });

    it('should construct with extra properties', function() {
        let m = 'error string';
        let extra = { 'prop1': 'a property value' };
        let ke = new KafkaSSEError(m, extra);

        assert.equal(ke.prop1, extra.prop1);
    });

    it('should serialize to JSON and back with extra properties', function() {
        let m = 'error string';
        let extra = { 'prop1': 'a property value' };
        let ke = new KafkaSSEError(m, extra);

        let deserializedError = JSON.parse(JSON.stringify(ke));
        assert.equal(deserializedError.message, ke.message);
        assert.equal(deserializedError.name, ke.name);
        assert.equal(deserializedError.prop1, ke.prop1);
    });
});


describe('ConfigurationError', () => {
    it('should be instanceof KafkaSSEError', function() {
        let ce = new ConfigurationError('test error');
        assert(ce instanceof KafkaSSEError);
    });
});
