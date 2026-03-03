const { validateAssignments, topicsToPartitionAssignment } = require('../lib/kafka/Assignments');
const { objectFactory, deserializeKafkaMessage } = require('../lib/sse/MessageHandler');

const topicsInfo = [
    { name: 'test0', partitions: [{ partitionId: 0, leader: 0, replicas: [0], isrs: [0] }] },
    { name: 'test1', partitions: [
        { partitionId: 0, leader: 0, replicas: [0], isrs: [0] },
        { partitionId: 1, leader: 0, replicas: [0], isrs: [0] }
    ] },
];

function getAvailableTopics(topicsInfo, allowedTopics) {
    const existentTopics = topicsInfo.map(t => t.name);
    if (allowedTopics) {
        return existentTopics.filter(t => allowedTopics.includes(t));
    }
    return existentTopics;
}

describe('objectFactory', () => {
    const o = {
        a: 'b',
        o2: { e: 1, r: 'abbbbc' },
        array: ['a', 'b', 'c']
    };

    test('should return same object if given object', () => {
        expect(objectFactory(o)).toBe(o);
    });

    test('should return object from JSON string', () => {
        expect(objectFactory(JSON.stringify(o))).toEqual(o);
    });

    test('should return object from JSON Buffer', () => {
        const buffer = Buffer.from(JSON.stringify(o));
        expect(objectFactory(buffer)).toEqual(o);
    });

    test('should fail with wrong type', () => {
        expect(() => objectFactory(12345)).toThrow();
    });
});

describe('getAvailableTopics', () => {
    test('should return existent topics if allowedTopics is not specified', () => {
        expect(getAvailableTopics(topicsInfo)).toEqual(['test0', 'test1']);
    });

    test('should return intersection of allowedTopics and existent topics', () => {
        const allowedTopics = ['test1'];
        expect(getAvailableTopics(topicsInfo, allowedTopics)).toEqual(allowedTopics);
    });
});

describe('validateAssignments', () => {
    test('should validate an array of topic names', () => {
        expect(() => validateAssignments(['a', 'b', 'c'])).not.toThrow();
    });

    test('should validate an array of assignment objects', () => {
        const assignments = [
            { topic: 'test0', partition: 0, offset: 123 },
            { topic: 'test1', partition: 0, offset: 456 },
            { topic: 'test1', partition: 1, offset: 234 }
        ];
        expect(() => validateAssignments(assignments)).not.toThrow();
    });

    test('should validate an array of assignment objects with timestamp set', () => {
        expect(() => validateAssignments([{ topic: 'test1', partition: 1, timestamp: 1527799576433 }])).not.toThrow();
    });

    test('should validate a combination of topic names and assignment objects', () => {
        const assignments = [
            'test0',
            { topic: 'test1', partition: 0, offset: 456 },
            { topic: 'test1', partition: 1, timestamp: 1527799576433 }
        ];
        expect(() => validateAssignments(assignments)).not.toThrow();
    });

    test('should fail validation of a non array', () => {
        expect(() => validateAssignments('nope')).toThrow();
    });

    test('should fail validation of an empty array', () => {
        expect(() => validateAssignments([])).toThrow();
    });

    test('should fail validation of topic names with bad elements', () => {
        expect(() => validateAssignments(['test0', 1234])).toThrow();
    });

    test('should fail validation of assignment objects with bad elements', () => {
        expect(() => validateAssignments([{ topic: 'test1', partition: 1, offset: 234 }, 1234])).toThrow();
    });

    test('should fail validation of assignment objects missing a property', () => {
        expect(() => validateAssignments([{ topic: 'test1', partition: 1 }])).toThrow();
    });

    test('should fail validation of assignment objects with bad properties', () => {
        expect(() => validateAssignments([{ topic: 1234, partition: 1, offset: 234 }])).toThrow();
        expect(() => validateAssignments([{ topic: 'test1', partition: 'hi', offset: 234 }])).toThrow();
        expect(() => validateAssignments([{ topic: 'test1', partition: 1, offset: ['bad', 'offset'] }])).toThrow();
    });
});

describe('topicsToPartitionAssignment', () => {
    test('should return empty array if topic does not exist', () => {
        expect(topicsToPartitionAssignment(topicsInfo, ['does-not-exist'])).toEqual([]);
    });

    test('should return assignments for a single partition topic', () => {
        expect(topicsToPartitionAssignment(topicsInfo, ['test0'])).toEqual([
            { topic: 'test0', partition: 0, offset: -1 }
        ]);
    });

    test('should return assignments for a multiple partition topic', () => {
        expect(topicsToPartitionAssignment(topicsInfo, ['test1'])).toEqual([
            { topic: 'test1', partition: 0, offset: -1 },
            { topic: 'test1', partition: 1, offset: -1 }
        ]);
    });

    test('should return assignments for a multiple topics', () => {
        expect(topicsToPartitionAssignment(topicsInfo, ['test0', 'test1'])).toEqual([
            { topic: 'test0', partition: 0, offset: -1 },
            { topic: 'test1', partition: 0, offset: -1 },
            { topic: 'test1', partition: 1, offset: -1 }
        ]);
    });
});

describe('deserializeKafkaMessage', () => {
    test('should return an augmented message from a Kafka message', () => {
        const kafkaMessage = {
            value: Buffer.from('{ "first_name": "Dorkus", "last_name": "Berry" }'),
            topic: 'test',
            partition: 1,
            offset: 123,
            key: 'myKey',
        };

        const msg = deserializeKafkaMessage(kafkaMessage);
        expect(msg.message.first_name).toBe('Dorkus');
        expect(msg.message._kafka.topic).toBe(kafkaMessage.topic);
        expect(msg.message._kafka.partition).toBe(kafkaMessage.partition);
        expect(msg.message._kafka.offset).toBe(kafkaMessage.offset);
        expect(msg.message._kafka.key).toBe(kafkaMessage.key);
    });
});
