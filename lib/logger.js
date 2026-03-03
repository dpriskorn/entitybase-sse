'use strict';

const log = require('loglevel');

// Set level from environment variable (like Python logging)
const level = (process.env.LOG_LEVEL || 'warn').toLowerCase();

// Map environment variable to loglevel methods
const validLevels = ['trace', 'debug', 'info', 'warn', 'error'];
if (!validLevels.includes(level)) {
    console.warn(`Invalid LOG_LEVEL "${level}", defaulting to "warn". Valid: ${validLevels.join(', ')}`);
}

log.setLevel(level);

module.exports = log;
