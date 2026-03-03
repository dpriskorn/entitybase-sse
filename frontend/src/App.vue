<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const backendUrl = ref('http://162.19.226.24:8081')
const version = ref('')
const streams = ref([])
const selectedStream = ref('')
const messages = ref([])
const prettyPrint = ref(false)
const isPaused = ref(false)
const error = ref('')
const info = ref('')

const rateCurrent = ref('..')
const rateAverage = ref('..')

let eventSource = null
let freqChecker = null
let messageCount = 0
let totalMessages = 0
let lastCheck = Date.now()

const streamUrl = computed(() => {
  if (!selectedStream.value) return ''
  return `${backendUrl.value}/v1/stream/${selectedStream.value}`
})

const formattedMessages = computed(() => {
  return messages.value.map(msg => {
    if (prettyPrint.value) {
      try {
        return JSON.stringify(JSON.parse(msg), null, 2)
      } catch {
        return msg
      }
    }
    return msg
  })
})

async function fetchStreams() {
  error.value = ''
  info.value = 'Loading streams...'
  try {
    const res = await fetch(`${backendUrl.value}/v1/streams/`)
    const data = await res.json()
    streams.value = data.streams || []
    if (streams.value.length === 0) {
      info.value = 'No streams found. Is the backend running?'
    } else {
      info.value = ''
    }
  } catch (e) {
    error.value = `Failed to load streams: ${e.message}`
    info.value = ''
  }
}

async function fetchVersion() {
  try {
    const res = await fetch(`${backendUrl.value}/version`)
    const data = await res.json()
    version.value = data.version || ''
  } catch (e) {
    version.value = ''
  }
}

function connectToStream() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }

  if (!selectedStream.value) {
    info.value = 'Select a stream to view messages'
    return
  }

  messages.value = []
  messageCount = 0
  totalMessages = 0
  lastCheck = Date.now()
  info.value = `Connecting to ${streamUrl.value}...`
  error.value = ''

  eventSource = new EventSource(streamUrl.value)

  eventSource.onopen = () => {
    info.value = 'Connected'
    startRateChecker()
  }

  eventSource.onmessage = (msg) => {
    messageCount++
    totalMessages++
    if (!isPaused.value) {
      messages.value.unshift(msg.data)
      if (messages.value.length > 200) {
        messages.value.pop()
      }
    }
  }

  eventSource.onerror = () => {
    error.value = 'Connection error'
    info.value = ''
    stopRateChecker()
  }
}

function startRateChecker() {
  stopRateChecker()
  freqChecker = setInterval(() => {
    const now = Date.now()
    const elapsed = now - lastCheck
    if (elapsed >= 1000) {
      rateCurrent.value = messageCount
      const avg = Math.round(totalMessages / ((now - lastCheck) / 1000))
      rateAverage.value = avg
      messageCount = 0
      lastCheck = now
    }
  }, 100)
}

function stopRateChecker() {
  if (freqChecker) {
    clearInterval(freqChecker)
    freqChecker = null
  }
}

function togglePause() {
  isPaused.value = !isPaused.value
}

async function copyMessages() {
  if (messages.value.length === 0) {
    alert('No messages to copy')
    return
  }
  try {
    await navigator.clipboard.writeText(messages.value.join('\n'))
    alert('Messages copied to clipboard!')
  } catch {
    alert('Failed to copy messages')
  }
}

function clearMessages() {
  messages.value = []
}

watch(selectedStream, () => {
  if (selectedStream.value) {
    connectToStream()
  }
})

watch(backendUrl, () => {
  fetchVersion()
  fetchStreams()
})

onMounted(() => {
  fetchVersion()
  fetchStreams()
})

onUnmounted(() => {
  if (eventSource) eventSource.close()
  stopRateChecker()
})
</script>

<template>
  <div class="container">
    <h1>Entitybase-SSE <span v-if="version" class="version">v{{ version }}</span></h1>
    
    <div class="controls">
      <div class="control-group">
        <label>Backend URL:</label>
        <input v-model="backendUrl" type="text" @change="fetchStreams" />
        <button @click="fetchStreams">Refresh Streams</button>
      </div>

      <div class="control-group">
        <label>Stream:</label>
        <select v-model="selectedStream">
          <option value="">Select a stream...</option>
          <option v-for="stream in streams" :key="stream" :value="stream">
            {{ stream }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="info" class="alert info">{{ info }}</div>

    <div class="rate-display">
      <span>Messages/sec: {{ rateCurrent }}</span>
      <span>(avg: {{ rateAverage }}/s)</span>
    </div>

    <div class="actions">
      <label>
        <input v-model="prettyPrint" type="checkbox" />
        Pretty print
      </label>
      <label>
        <input v-model="isPaused" type="checkbox" />
        Pause
      </label>
      <button @click="copyMessages">Copy</button>
      <button @click="clearMessages">Clear</button>
    </div>

    <pre class="feed"><code v-for="(msg, i) in formattedMessages" :key="i">{{ msg }}
</code></pre>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  margin: 0;
  padding: 20px;
  background: #f5f5f5;
}

.container {
  max-width: 900px;
  margin: 0 auto;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

h1 {
  margin-top: 0;
  color: #333;
}

.version {
  font-size: 0.5em;
  color: #666;
  font-weight: normal;
}

.controls {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 15px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-group label {
  font-weight: bold;
}

.control-group input[type="text"] {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  width: 250px;
}

.control-group select {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 200px;
}

.control-group button {
  padding: 6px 12px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.control-group button:hover {
  background: #0056b3;
}

.alert {
  padding: 10px 15px;
  border-radius: 4px;
  margin-bottom: 15px;
}

.alert.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.alert.info {
  background: #d1ecf1;
  color: #0c5460;
  border: 1px solid #bee5eb;
}

.rate-display {
  padding: 10px;
  background: #e9ecef;
  border-radius: 4px;
  margin-bottom: 15px;
}

.rate-display span {
  margin-right: 20px;
  font-weight: bold;
}

.actions {
  display: flex;
  gap: 15px;
  align-items: center;
  margin-bottom: 15px;
}

.actions label {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}

.actions button {
  padding: 6px 12px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.actions button:hover {
  background: #218838;
}

.feed {
  max-height: 500px;
  overflow-y: auto;
  background: #f9f9f9;
  border: 1px solid #ddd;
  padding: 10px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
}

.feed code {
  display: block;
}
</style>
