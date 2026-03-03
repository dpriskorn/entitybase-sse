'use strict';

class KafkaSSEError extends Error {
    constructor(message, extra) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
        if (extra) {
            Object.assign(this, extra);
        }
    }

    toJSON() {
        const obj = { name: this.name, message: this.message };
        for (const key of Object.keys(this)) {
            if (key !== 'name' && key !== 'message' && key !== 'stack') {
                obj[key] = this[key];
            }
        }
        return obj;
    }
}

class ConfigurationError extends KafkaSSEError {}
class InvalidAssignmentError extends KafkaSSEError {}
class TopicNotAvailableError extends KafkaSSEError {}
class DeserializationError extends KafkaSSEError {}
class FilterError extends KafkaSSEError {}

module.exports = {
    KafkaSSEError,
    ConfigurationError,
    InvalidAssignmentError,
    TopicNotAvailableError,
    DeserializationError,
    FilterError
};
