<template>
  <div class="port-killer">
    <span class="killer-port">:{{ port }}</span>
    <button
      class="btn-kill"
      :disabled="isKilling"
      @click="handleKill"
    >
      {{ isKilling ? '清理中...' : '清理端口' }}
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  port: { type: Number, required: true },
})

const isKilling = ref(false)

async function handleKill() {
  isKilling.value = true
  try {
    const result = await window.serviceAPI.killPort(props.port)
    if (!result.success && result.error) {
      console.error('Kill port failed:', result.error)
    }
  } catch (e) {
    console.error('Kill port error:', e)
  } finally {
    isKilling.value = false
  }
}
</script>
