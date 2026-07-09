<template>
  <div class="port-killer-panel">
    <!-- 顶部操作栏 -->
    <div class="port-ops-bar">
      <div class="port-ops-left">
        <h2 class="port-panel-title">端口清理</h2>
        <span class="port-ops-count">{{ ports.length }} 个端口 · {{ pinnedPorts.length }} 已固定</span>
      </div>
      <button class="btn-clean-all" :disabled="ports.length === 0" @click="$emit('clean-all')">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M2 5h12M6 5V3h4v2M4 5l1 9h6l1-9"/>
        </svg>
        全部清除
      </button>
    </div>

    <!-- 端口网格 -->
    <div class="port-grid">
      <div
        v-for="port in ports"
        :key="port"
        class="port-card"
        :class="{ pinned: pinnedPorts.includes(port) }"
      >
        <!-- 第一行：端口号 + 清理按钮 -->
        <div class="port-card-head">
          <span class="port-card-port">:{{ port }}</span>
          <button
            class="card-btn clean"
            :disabled="!isOccupied(port)"
            @click="$emit('clean', port)"
            title="清理该端口占用进程"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M2 5h12M6 5V3h4v2M4 5l1 9h6l1-9"/>
            </svg>
            清理
          </button>
        </div>
        <!-- 第二行：状态（空闲/占用）+ 固定图标 -->
        <div class="port-card-foot">
          <span class="port-status" :class="statusClass(port)">{{ statusText(port) }}</span>
          <button
            class="card-btn pin-icon"
            :class="{ active: pinnedPorts.includes(port) }"
            @click="$emit('toggle-pin', port)"
            :title="pinnedPorts.includes(port) ? '取消固定' : '固定到左栏'"
          >
            <svg v-if="pinnedPorts.includes(port)" viewBox="0 0 16 16" width="13" height="13" fill="currentColor" stroke="none">
              <path d="M10 1.5l4.5 4.5L8 12.5 3.5 14l1.5-4.5L10 1.5z"/>
            </svg>
            <svg v-else viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M10 1.5l4.5 4.5L8 12.5 3.5 14l1.5-4.5L10 1.5z"/>
            </svg>
          </button>
        </div>
      </div>

      <div v-if="ports.length === 0" class="port-grid-empty">
        暂未配置端口，请在「设置」中添加需要跟踪的端口
      </div>
    </div>

    <!-- 清理日志（固定占 1/4 屏，底部对齐，无折叠） -->
    <div class="port-logs">
      <div class="port-logs-head">
        <span>清理日志</span>
      </div>
      <div class="port-logs-body">
        <div v-for="(log, i) in logs" :key="i" class="port-log-line">
          <span class="port-log-time">{{ log.time }}</span>{{ log.text }}
        </div>
        <div v-if="!logs.length" class="port-log-empty">暂无日志</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  ports: { type: Array, default: () => [] },
  pinnedPorts: { type: Array, default: () => [] },
  statuses: { type: Object, default: () => ({}) },
  logs: { type: Array, default: () => [] },
})

const emit = defineEmits(['toggle-pin', 'clean', 'clean-all'])

function isOccupied(port) {
  const s = props.statuses[port]
  return !!(s && s.occupied)
}

function statusText(port) {
  const s = props.statuses[port]
  if (!s) return '检测中'
  return s.occupied ? `· 占用中 · ${s.processCount}` : '· 空闲'
}

function statusClass(port) {
  const s = props.statuses[port]
  if (!s) return 'checking'
  return s.occupied ? 'occupied' : 'free'
}
</script>
