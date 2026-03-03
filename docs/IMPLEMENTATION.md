# Implementation Details

## How It Works

Entitybase-SSE uses [kafkajs](https://kafkajs.github.io/) to consume messages from Kafka/Redpanda and streams them to clients over HTTP using [Server-Sent Events (SSE)](https://html.spec.whatwg.org/multipage/server-sent-events.html).

## Auto-Resume

The `Last-Event-ID` header and EventSource `id` field handle automatic resume on client disconnect. Every message includes an `id` field containing a JSON array with topic, partition, and offset information. On reconnect, this is sent back as `Last-Event-ID`, allowing the consumer to resume from where it left off.

### Timestamp-Based Resume

If the Kafka cluster supports timestamp-based consumption, the `id` field may contain timestamps instead of offsets. This enables historical consumption without knowing partition offsets.

Use `useTimestampForId` option to always use timestamps. Note: timestamps are less precise than offsets but useful for multi-DC setups.

## Custom Deserializer

The default deserializer assumes `kafkaMessage.value` is a UTF-8 JSON string. Override with:

```javascript
function customDeserializer(kafkaMessage) {
    kafkaMessage.message = JSON.parse(kafkaMessage.value.toString());
    return kafkaMessage;
}

kafkaSse(req, res, topics, { deserializer: customDeserializer });
```

## Server-Side Filtering

```javascript
function filterFunction(kafkaMessage) {
    return kafkaMessage.message.price >= 10.0;
}

kafkaSse(req, res, topics, { filterer: filterFunction });
```

## Consumer State

Offset commits are not supported. Instead, subscription state is sent as the EventSource `id` field. Use this in `Last-Event-ID` to specify consumption start positions:

```javascript
[
    { topic: 'topicA', partition: 0, offset: 12345 },
    { topic: 'topicB', partition: 0, offset: 46666 }
]
```

Each SSE client gets its own consumer group named after the `x-request-id` header or a UUID.

## Client Example

```javascript
const EventSource = require('eventsource');
const url = `http://localhost:8081/your-topic`;
let eventSource = new EventSource(url);

eventSource.onmessage = function(event) {
    console.log(JSON.parse(event.data));
};
```

## Errors

Once SSE starts (HTTP 200 sent), errors are delivered as `onerror` events. Register an `onerror` handler to receive them.
