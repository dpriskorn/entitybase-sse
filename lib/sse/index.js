'use strict';

const { MessageHandler, deserializeKafkaMessage } = require('./MessageHandler');

module.exports = {
    MessageHandler,
    deserializeKafkaMessage
};
