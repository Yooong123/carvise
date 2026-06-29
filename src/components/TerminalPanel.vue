<template>
  <div class="terminal-panel">
    <div class="terminal-header">
      <div class="terminal-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.name"
          class="tab-btn"
          :class="{ active: activeTab === tab.name }"
          @click="$emit('tabChange', tab.name)"
        >
          <span class="tab-dot" :class="`dot-${getLogCount(tab.name)}`"></span>
          {{ tab.label }}
        </button>
      </div>
      <button class="clear-btn" @click="$emit('clear', activeTab)" title="清屏">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
        </svg>
      </button>
    </div>
    <div class="terminal-body" ref="terminalBody" @click="handleTerminalClick">
      <div class="terminal-content">
        <div v-if="!currentLogs.length" class="terminal-empty">
          <span class="blink-cursor">_</span> 等待输出...
        </div>
        <div
          v-for="(log, i) in currentLogs"
          :key="i"
          class="log-line"
          :class="getLogClass(log.text)"
        >
          <span class="log-time">{{ log.time }}</span>
          <span class="log-text" v-html="formatLogText(log.text)"></span>
        </div>
        <div v-if="currentLogs.length" class="terminal-cursor">
          <span class="blink-cursor">_</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'

const props = defineProps({
  tabs: { type: Array, default: () => [] },
  activeTab: { type: String, default: '' },
  logs: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['tabChange', 'clear'])

const terminalBody = ref(null)

const currentLogs = computed(() => {
  return props.logs[props.activeTab] || []
})

// 自动滚动到底部
watch(currentLogs, () => {
  nextTick(() => {
    if (terminalBody.value) {
      terminalBody.value.scrollTop = terminalBody.value.scrollHeight
    }
  })
}, { deep: true })

function getLogCount(tabName) {
  const count = (props.logs[tabName] || []).length
  if (count === 0) return 'empty'
  if (count > 100) return 'many'
  return 'some'
}

function getLogClass(text) {
  if (text.includes('[ERROR]')) return 'log-error'
  if (text.includes('[WARN]')) return 'log-warn'
  if (text.includes('[OK]')) return 'log-ok'
  if (text.includes('[INFO]')) return 'log-info'
  if (text.includes('[STDERR]')) return 'log-stderr'
  return ''
}

function formatLogText(text) {
  // 清理 ANSI 颜色码，转义 HTML 特殊字符，然后高亮 http:// URL
  // 注意：& 必须在 < > 之前转义，否则 &lt; 会被二次转义
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /(https?:\/\/[^\s<&]+)/g,
      '<span class="log-url">$1</span>'
    )
}

function handleTerminalClick(e) {
  const urlEl = e.target.closest('.log-url')
  if (urlEl) {
    const url = urlEl.textContent
    window.serviceAPI.openUrl(url)
  }
}
</script>
