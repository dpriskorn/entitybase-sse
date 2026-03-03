'use strict';

const P = require('bluebird');
const _ = require('lodash');

function validateAssignments(assignments) {
    let assignmentError = new Error(
        'Must provide either an array topic names, or ' +
        ' an array of objects with topic, partition and offset|timestamp.'
    );
    assignmentError.assignments = assignments;

    if (!_.isArray(assignments) || _.isEmpty(assignments)) {
        throw assignmentError;
    }

    if (!assignments.every((a) => (
        _.isString(a) || (
            _.isPlainObject(a) &&
            _.isString(a.topic) &&
            _.isInteger(a.partition) &&
            (_.isInteger(a.offset) || _.isInteger(a.timestamp))
        )
    ))) {
        throw assignmentError;
    }

    return true;
}

function topicsToPartitionAssignment(topicsInfo, topics, atTimestamp, defaultOffset = -1) {
    topics = _.isArray(topics) ? topics : topics.split(',');
    const defaultResumePosition = atTimestamp ? { timestamp: atTimestamp } : { offset: defaultOffset };

    return _.flatten(
        topicsInfo.filter(t => _.includes(topics, t.name))
            .map(t => t.partitions.map(
                p => Object.assign({ topic: t.name, partition: p.partitionId }, defaultResumePosition)
            ))
    );
}

async function buildAssignments(consumer, metadata, assignments, atTimestamp, defaultOffset = -1) {
    const defaultResumePosition = atTimestamp ? { timestamp: atTimestamp } : { offset: defaultOffset };

    assignments = _.flatten(
        assignments.map((a) => {
            if (_.isString(a)) {
                a = topicsToPartitionAssignment(metadata, a, atTimestamp, defaultOffset);
            } else if (!('offset' in a) && !('timestamp' in a)) {
                a = Object.assign(a, defaultResumePosition);
            }
            return a;
        })
    );

    return resolveTimestamps(consumer, assignments);
}

async function resolveTimestamps(consumer, assignments) {
    const assignmentsWithTimestamps = assignments.filter(
        a => 'timestamp' in a && !('offset' in a)
    );

    if (assignmentsWithTimestamps.length === 0) {
        return assignments;
    }

    const admin = consumer.kafka.admin();
    await admin.connect();

    const timestamps = assignmentsWithTimestamps.map(a => ({
        topic: a.topic,
        partition: a.partition,
        timestamp: a.timestamp
    }));

    const offsetsForTimes = await admin.fetchOffsetsByTimestamp({ timestamps });
    await admin.disconnect();

    const offsetMap = {};
    offsetsForTimes.forEach(o => {
        offsetMap[`${o.topic}-${o.partition}`] = o.offset;
    });

    return _.flatten([
        assignments.filter(a => !('timestamp' in a) && 'offset' in a),
        assignmentsWithTimestamps.map(a => ({
            topic: a.topic,
            partition: a.partition,
            offset: offsetMap[`${a.topic}-${a.partition}`] ?? -1
        }))
    ]);
}

module.exports = {
    validateAssignments,
    topicsToPartitionAssignment,
    buildAssignments,
    resolveTimestamps
};
