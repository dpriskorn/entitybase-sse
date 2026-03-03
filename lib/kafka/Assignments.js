'use strict';

const P = require('bluebird');
const _ = require('lodash');

function validateAssignments(assignments) {
    console.log('[DEBUG] validateAssignments called with:', JSON.stringify(assignments));
    
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
    console.log('[DEBUG] topicsToPartitionAssignment:', { topics, atTimestamp, defaultOffset });
    
    topics = _.isArray(topics) ? topics : topics.split(',');
    const defaultResumePosition = atTimestamp ? { timestamp: atTimestamp } : { offset: defaultOffset };
    console.log('[DEBUG] defaultResumePosition:', defaultResumePosition);

    return _.flatten(
        topicsInfo.filter(t => _.includes(topics, t.name))
            .map(t => t.partitions.map(
                p => Object.assign({ topic: t.name, partition: p.partitionId }, defaultResumePosition)
            ))
    );
}

async function buildAssignments(consumer, metadata, assignments, atTimestamp, defaultOffset = -1) {
    console.log('[DEBUG] buildAssignments:', { assignments, atTimestamp, defaultOffset });
    
    const defaultResumePosition = atTimestamp ? { timestamp: atTimestamp } : { offset: defaultOffset };
    console.log('[DEBUG] buildAssignments defaultResumePosition:', defaultResumePosition);

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

    console.log('[DEBUG] assignments before resolveTimestamps:', JSON.stringify(assignments));
    return resolveTimestamps(consumer, assignments);
}

async function resolveTimestamps(consumer, assignments) {
    console.log('[DEBUG] resolveTimestamps called with:', JSON.stringify(assignments));
    
    const assignmentsWithTimestamps = assignments.filter(
        a => 'timestamp' in a && !('offset' in a)
    );

    console.log('[DEBUG] assignmentsWithTimestamps:', JSON.stringify(assignmentsWithTimestamps));

    if (assignmentsWithTimestamps.length === 0) {
        console.log('[DEBUG] No timestamps to resolve, returning assignments as-is');
        return assignments;
    }

    const admin = consumer.kafka.admin();
    await admin.connect();

    const timestamps = assignmentsWithTimestamps.map(a => ({
        topic: a.topic,
        partition: a.partition,
        timestamp: a.timestamp
    }));

    console.log('[DEBUG] Fetching offsets for timestamps:', JSON.stringify(timestamps));
    
    const offsetsForTimes = await admin.fetchOffsetsByTimestamp({ timestamps });
    console.log('[DEBUG] offsetsForTimes:', JSON.stringify(offsetsForTimes));
    
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
