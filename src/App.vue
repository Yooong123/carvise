<template>
  <div class="app-container" @click="closeContextMenu">
    <!-- 左侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1 class="sidebar-logo">Carvis</h1>
        <span class="sidebar-version">v1.0.2</span>
      </div>

      <!-- 中间可滚动区域：搜索 + 服务列表 + 端口清理 -->
      <div class="sidebar-scroll">
      <!-- 搜索框 -->
      <div class="sidebar-search">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="7" cy="7" r="5"/>
          <path d="M11 11l3 3"/>
        </svg>
        <input type="text" placeholder="搜索服务..." v-model="searchQuery" />
      </div>

      <!-- 服务列表（分组显示） -->
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          <span>服务</span>
          <div class="section-title-right">
            <span class="service-count">{{ filteredServices.length }}</span>
          </div>
        </div>

        <div class="service-list">
          <!-- 按分组展示服务 -->
          <template v-for="group in groupedServices" :key="group.groupId">
            <!-- 分组头 -->
            <div
              class="group-header"
              :class="{ expanded: groupExpanded[group.groupId] }"
              @click="toggleGroupExpand(group.groupId)"
              @contextmenu.prevent="showGroupContextMenu($event, group.groupId, group.groupName)"
            >
              <svg class="group-arrow" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                <path d="M6 3l5 5-5 5V3z"/>
              </svg>
              <span class="group-name">{{ group.groupName }}</span>
              <span v-if="group.groupColor" class="group-color-dot" :style="{ background: colorMap[group.groupColor] }"></span>
              <span class="group-count">({{ group.services.length }})</span>
            </div>
            <!-- 分组内的服务列表 -->
            <template v-if="groupExpanded[group.groupId]">
              <div class="group-bulk-actions">
                <button
                  class="footer-btn footer-btn-start"
                  :disabled="group.services.every(s => statuses[s.id] === ServiceStatus.RUNNING || statuses[s.id] === ServiceStatus.STARTING)"
                  @click.stop="handleGroupStartAll(group.groupId)"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
                  启动全部
                </button>
                <button
                  class="footer-btn footer-btn-stop"
                  :disabled="group.services.every(s => statuses[s.id] === ServiceStatus.STOPPED || statuses[s.id] === ServiceStatus.STOPPING)"
                  @click.stop="handleGroupStopAll(group.groupId)"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="3" y="3" width="10" height="10"/></svg>
                  停止全部
                </button>
              </div>
              <div
                v-for="service in group.services"
                :key="service.id"
                class="service-item service-item-grouped"
                :class="{ active: serviceSelection === service.id }"
                @click="handleSidebarClick(service.id)"
                @contextmenu.prevent="showContextMenu($event, service)"
              >
                <span class="service-status-dot" :class="`status-${statuses[service.id] || 'stopped'}`"></span>
                <div class="service-item-info">
                  <span class="service-item-name">{{ service.label }}</span>
                  <span class="service-item-port">:{{ service.port }}</span>
                </div>
                <div class="service-item-actions" @click.stop>
                  <button class="item-action-btn" :disabled="statuses[service.id] === ServiceStatus.RUNNING || statuses[service.id] === ServiceStatus.STARTING" @click="handleStart(service.id)" title="启动">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
                  </button>
                  <button class="item-action-btn" :disabled="statuses[service.id] === ServiceStatus.STOPPED || statuses[service.id] === ServiceStatus.STOPPING" @click="handleStop(service.id)" title="停止">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><rect x="3" y="3" width="10" height="10"/></svg>
                  </button>
                </div>
              </div>
            </template>
          </template>

          <!-- 未分组服务 -->
          <template v-if="ungroupedServices.length > 0">
            <div
              class="group-header"
              :class="{ expanded: groupExpanded['__ungrouped__'] }"
              @click="toggleGroupExpand('__ungrouped__')"
            >
              <svg class="group-arrow" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                <path d="M6 3l5 5-5 5V3z"/>
              </svg>
              <span class="group-name">未分组</span>
              <span class="group-count">({{ ungroupedServices.length }})</span>
            </div>
            <template v-if="groupExpanded['__ungrouped__']">
              <div
                v-for="service in ungroupedServices"
                :key="service.id"
                class="service-item service-item-grouped"
                :class="{ active: serviceSelection === service.id }"
                @click="handleSidebarClick(service.id)"
                @contextmenu.prevent="showContextMenu($event, service)"
              >
                <span class="service-status-dot" :class="`status-${statuses[service.id] || 'stopped'}`"></span>
                <div class="service-item-info">
                  <span class="service-item-name">{{ service.label }}</span>
                  <span class="service-item-port">:{{ service.port }}</span>
                </div>
                <div class="service-item-actions" @click.stop>
                  <button class="item-action-btn" :disabled="statuses[service.id] === ServiceStatus.RUNNING || statuses[service.id] === ServiceStatus.STARTING" @click="handleStart(service.id)" title="启动">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
                  </button>
                  <button class="item-action-btn" :disabled="statuses[service.id] === ServiceStatus.STOPPED || statuses[service.id] === ServiceStatus.STOPPING" @click="handleStop(service.id)" title="停止">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><rect x="3" y="3" width="10" height="10"/></svg>
                  </button>
                </div>
              </div>
            </template>
          </template>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="services.length === 0" class="sidebar-empty">
        <p>暂无服务</p>
      </div>

      <div class="sidebar-divider"></div>

      <!-- 端口清理 -->
      <div v-if="killerPorts.length > 0" class="sidebar-section">
        <div class="sidebar-section-title">
          <span>端口清理</span>
        </div>
        <div class="port-killer-list">
          <PortKiller v-for="port in killerPorts" :key="port" :port="port" />
        </div>
      </div>
      </div><!-- end sidebar-scroll -->

      <!-- 侧边栏底部 -->
      <div class="sidebar-footer">
        <!-- 启动全部/停止全部 暂时隐藏
        <div class="footer-actions">
          <button class="footer-btn footer-btn-start" :disabled="isAllRunning || isBulkStarting || services.length === 0" @click="handleStartAll">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
            <span>启动全部</span>
            <span class="footer-count-spacer"></span>
            <span class="footer-count">{{ runningCount }}/{{ services.length }}</span>
          </button>
          <button class="footer-btn footer-btn-stop" :disabled="runningCount === 0" @click="handleStopAll">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="3" y="3" width="10" height="10"/></svg>
            <span>停止全部</span>
          </button>
        </div>
        -->
        <button class="settings-btn" @click="showSettings = true">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3">
            <circle cx="8" cy="8" r="2.5"/>
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41"/>
          </svg>
          <span>设置</span>
        </button>
      </div>
    </aside>

    <!-- 右键上下文菜单 -->
    <Teleport to="body">
      <div v-if="contextMenu.show" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click.stop>
        <template v-if="contextMenu.isGroup">
          <div class="context-menu-item" @click="handleGroupRenameFromMenu">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/>
            </svg>
            重命名
          </div>
          <div class="context-menu-item" @click.stop="showGroupColor = !showGroupColor">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="8" cy="8" r="6"/>
              <path d="M8 1C6 1 4 4 4 8s2 7 4 7"/>
            </svg>
            标记
          </div>
          <div v-if="showGroupColor" class="group-color-menu" @click.stop>
            <div class="color-menu-title">选择颜色</div>
            <div class="color-menu-options">
              <div
                v-for="c in colorOptions"
                :key="c.value"
                class="color-menu-item"
                :class="{ active: getGroupColor(contextMenu.groupId) === c.value }"
                @click="selectGroupColor(c.value)"
              >
                <span class="color-swatch" :style="{ background: c.color }"></span>
                <span>{{ c.label }}</span>
                <span v-if="getGroupColor(contextMenu.groupId) === c.value" class="color-check">✓</span>
              </div>
              <div class="color-menu-divider"></div>
              <div class="color-menu-item" @click="clearGroupColor">
                <span class="color-swatch" style="background: transparent; border: 1px dashed var(--text-muted);"></span>
                <span style="color: var(--text-muted);">清除</span>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="context-menu-item" @click="handleRenameFromMenu">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/>
            </svg>
            重命名
          </div>
          <div class="context-menu-item" @click.stop="handleAssignToGroup">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M1 8h14M8 1v14"/>
            </svg>
            分配到组
            <div v-if="showGroupAssign" class="group-assign-dropdown" @click.stop>
              <div class="group-assign-option" :class="{ selected: !getServiceGroup(contextMenu.service?.id) }" @click="doAssignToGroup(null)">未分组</div>
              <div v-for="g in groups" :key="g.id" class="group-assign-option" :class="{ selected: getServiceGroup(contextMenu.service?.id) === g.id }" @click="doAssignToGroup(g.id)">{{ g.name }}</div>
            </div>
          </div>
          <div class="context-menu-divider"></div>
          <div class="context-menu-item" @click="handleOpenFolderFromMenu">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 4l2-2h4l2 2h4v9H2z"/>
            </svg>
            打开文件夹
          </div>
        </template>
      </div>
    </Teleport>

    <!-- 重命名弹窗 -->
    <Teleport to="body">
      <div v-if="renameModal.visible" class="rename-overlay" @click.self="closeRenameModal">
        <div class="rename-modal">
          <div class="rename-modal-header">
            <span class="rename-modal-title">编辑名称</span>
            <button class="rename-modal-close" @click="closeRenameModal">&times;</button>
          </div>
          <div class="rename-modal-body">
            <input
              v-model="renameModal.value"
              class="rename-modal-input"
              placeholder="请输入名称"
              ref="renameModalInputRef"
              @keydown.enter="confirmRename"
              @keydown.escape="closeRenameModal"
            />
          </div>
          <div class="rename-modal-footer">
            <button class="rename-modal-btn rename-modal-btn-cancel" @click="closeRenameModal">取消</button>
            <button class="rename-modal-btn rename-modal-btn-confirm" @click="confirmRename">确定</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 右侧主内容区 -->
    <main class="main-content">
      <!-- 顶部拖动区域 -->
      <div class="drag-region"></div>

      <!-- 窗口控制按钮 -->
      <div v-if="!isMacPlatform" class="window-controls">
        <button class="win-btn" @click="minimizeWindow" title="最小化">
          <svg viewBox="0 0 12 12" width="12" height="12"><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
        <button class="win-btn win-btn-max" @click="maximizeWindow" title="最大化">
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="1.5" width="9" height="9" rx="1"/></svg>
        </button>
        <button class="win-btn win-btn-close" @click="closeWindow" title="关闭">
          <svg viewBox="0 0 12 12" width="12" height="12"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.5"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
      </div>

      <!-- 空状态：无服务或未选中任何服务时显示欢迎信息 -->
      <div v-if="!serviceSelection" class="empty-state">
        <div class="empty-icon">
          <img :src="jueseImage" alt="Carvis" style="width: 80px; height: 80px; object-fit: cover;" />
        </div>
        <h3 class="empty-title">Carvis</h3>
        <p class="empty-desc">菜维斯 为你分担一点点🤏工作</p>
        <button v-if="services.length === 0" class="empty-btn" @click="showSettings = true">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1v14M1 8h14"/></svg>
          添加服务
        </button>
      </div>

      <!-- 服务详情 + 终端 -->
      <template v-if="serviceSelection">
        <div v-if="currentService" class="service-header">
          <div class="service-avatar">
            <img :src="jueseImage" alt="Carvis" class="avatar-img" />
          </div>
          <div class="service-header-info">
            <h1 class="service-header-name">Carvis</h1>
            <p class="service-header-slogan">菜维斯 为你分担一点点🤏工作</p>
          </div>
          <div class="service-header-actions">
            <button class="header-action-btn btn-start" :disabled="currentServiceStatus === ServiceStatus.RUNNING || currentServiceStatus === ServiceStatus.STARTING" @click="handleStart(serviceSelection)">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
              启动
            </button>
            <button class="header-action-btn btn-stop" :disabled="currentServiceStatus === ServiceStatus.STOPPED || currentServiceStatus === ServiceStatus.STOPPING" @click="handleStop(serviceSelection)">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="3" y="3" width="10" height="10"/></svg>
              停止
            </button>
            <button class="header-action-btn btn-restart" :disabled="currentServiceStatus === ServiceStatus.STARTING || currentServiceStatus === ServiceStatus.STOPPING" @click="handleRestart(serviceSelection)">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5"/>
                <path d="M8 0.5v4h4" fill="none"/>
              </svg>
              重启
            </button>
          </div>
        </div>

        <div class="service-info-card">
          <div class="info-card-row">
            <div class="info-card-item">
              <div class="info-card-icon">
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M1 3h14v10H1z"/><path d="M1 7h14"/><path d="M4 5V3M8 5V3M12 5V3"/>
                </svg>
              </div>
              <div class="info-card-content">
                <span class="info-card-label">工作目录</span>
                <code class="info-card-path">{{ displayService?.cwd || '-' }}</code>
              </div>
              <button v-if="displayService?.cwd" class="info-card-action" @click="openFolder(displayService.cwd)" title="打开文件夹">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M2 4l2-2h4l2 2h4v9H2z"/><path d="M6 8l2 2 2-2"/><path d="M8 6v4"/>
                </svg>
              </button>
            </div>
            <div class="info-card-item">
              <div class="info-card-icon">
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>
                </svg>
              </div>
              <div class="info-card-content">
                <span class="info-card-label">运行端口</span>
                <code>{{ displayService?.port ? ':' + displayService.port : '-' }}</code>
              </div>
            </div>
            <div class="info-card-item">
              <div class="info-card-icon">
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <polyline points="4 6 8 10 12 6"/>
                </svg>
              </div>
              <div class="info-card-content">
                <span class="info-card-label">启动命令</span>
                <code>{{ displayService?.command || '-' }}</code>
              </div>
            </div>
          </div>
        </div>

        <TerminalPanel
          :tabs="terminalTabs"
          :activeTab="terminalTab"
          :logs="logs"
          @tabChange="terminalTab = $event"
          @clear="handleClearLogs"
        />
      </template>
    </main>

    <SettingsModal
      v-if="showSettings"
      :config="currentConfig"
      :settings="currentSettings"
      :groups="groups"
      @close="showSettings = false"
      @save="handleSaveConfig"
    />
  </div>
</template>

<script setup>
import { ref, reactive, shallowReactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import TerminalPanel from './components/TerminalPanel.vue'
import PortKiller from './components/PortKiller.vue'
import SettingsModal from './components/SettingsModal.vue'

/**
 * 图片资源（位于 public/ 目录）
 * 使用相对路径兼容开发模式 (http://localhost:5173/) 和打包后 (file://)
 */
const jueseImg = './juese.png'
const jueseBlackImg = './juese-black.png'

// ========================
// 常量定义
// ========================

/** 日志最大条数 */
const MAX_LOG_COUNT = 500

/** 服务状态枚举（与后端保持一致） */
const ServiceStatus = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  FAILED: 'failed',
}

// ========================
// 分组颜色标记
// ========================

/** 颜色选项列表 */
const colorOptions = [
  { value: 'red',    color: '#e74c3c', label: '红色' },
  { value: 'orange', color: '#e67e22', label: '橙色' },
  { value: 'yellow', color: '#f1c40f', label: '黄色' },
  { value: 'green',  color: '#2ecc71', label: '绿色' },
  { value: 'blue',   color: '#3498db', label: '蓝色' },
  { value: 'purple', color: '#9b59b6', label: '紫色' },
]

/** 颜色值 -> CSS 色值映射 */
const colorMap = Object.fromEntries(colorOptions.map(c => [c.value, c.color]))

/**
 * 获取分组的当前颜色
 * @param {string} groupId
 * @returns {string} 颜色值或空字符串
 */
function getGroupColor(groupId) {
  const group = groups.value.find(g => g.id === groupId)
  return group?.color || ''
}

const services = ref([])
const killerPorts = ref([])
const groups = ref([])
const statuses = reactive({})
const logs = shallowReactive({})
const showSettings = ref(false)
const currentConfig = ref(null)
const searchQuery = ref('')
const terminalTab = ref('')
const serviceSelection = ref('')
const currentSettings = ref(null)
/** 是否为 macOS 平台 */
const isMacPlatform = ref(false)
/** 当前主题模式，跟随系统时的实际值 */
const resolvedTheme = ref('light')
/** 系统主题偏好监听器 */
let systemThemeMediaQuery = null
let skipTerminalSync = false

// 分组展开/折叠状态
const groupExpanded = reactive({})

// 重命名弹窗
const renameModal = reactive({
  visible: false,
  type: '',   // 'group' | 'service'
  id: '',
  value: '',
})
const renameModalInputRef = ref(null)

// 上下文菜单
const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  service: null,
  isGroup: false,
  groupId: '',
  groupName: '',
})
const showGroupAssign = ref(false)
const showGroupColor = ref(false)

let unsubscribeLog = null
let unsubscribeStatus = null
let unsubscribeShutdown = null

// ========================
// 双向同步：侧边栏 ↔ 终端tab
// ========================

function handleSidebarClick(serviceId) {
  serviceSelection.value = serviceId
  skipTerminalSync = true
  terminalTab.value = serviceId
}

watch(terminalTab, (newTab) => {
  if (skipTerminalSync) {
    skipTerminalSync = false
    return
  }
  if (services.value.some(s => s.id === newTab)) {
    serviceSelection.value = newTab
  }
})

// ========================
// 计算属性
// ========================

const filteredServices = computed(() => {
  if (!searchQuery.value) return services.value
  const query = searchQuery.value.toLowerCase()
  return services.value.filter(s =>
    s.label.toLowerCase().includes(query) ||
    s.id.toLowerCase().includes(query)
  )
})

const groupedServiceIdSet = computed(() => {
  const ids = new Set()
  for (const group of groups.value) {
    for (const sid of (group.serviceIds || [])) {
      ids.add(sid)
    }
  }
  return ids
})

const groupedServices = computed(() => {
  return groups.value
    .filter(g => g.serviceIds && g.serviceIds.length > 0)
    .map(group => ({
      groupId: group.id,
      groupName: group.name,
      groupColor: group.color,
      services: filteredServices.value.filter(s =>
        group.serviceIds.includes(s.id)
      ),
    }))
    .filter(g => g.services.length > 0)
})

const ungroupedServices = computed(() => {
  return filteredServices.value.filter(s => !groupedServiceIdSet.value.has(s.id))
})

const currentService = computed(() => {
  return services.value.find(s => s.id === serviceSelection.value)
})

const displayService = computed(() => {
  return services.value.find(s => s.id === terminalTab.value) || null
})

const currentServiceStatus = computed(() => {
  return statuses[serviceSelection.value] || 'stopped'
})

const terminalTabs = computed(() => {
  const selectedGroupId = serviceSelection.value
    ? getServiceGroup(serviceSelection.value)
    : null
  let filtered
  if (selectedGroupId) {
    const group = groups.value.find(g => g.id === selectedGroupId)
    filtered = services.value.filter(s =>
      group && group.serviceIds.includes(s.id)
    )
  } else {
    filtered = services.value.filter(s => !groupedServiceIdSet.value.has(s.id))
  }
  const tabs = filtered.map(s => ({ name: s.id, label: s.label }))
  if (killerPorts.value.length > 0) {
    tabs.push({ name: 'port-killer', label: `端口 ${killerPorts.value.join('/')}` })
  }
  return tabs
})

const runningCount = computed(() => {
  return services.value.filter(s => {
    const st = statuses[s.id]
    return st === ServiceStatus.RUNNING || st === ServiceStatus.STARTING
  }).length
})

const isAllRunning = computed(() => {
  return services.value.length > 0 && runningCount.value === services.value.length
})

const isBulkStarting = ref(false)

/** 当前用户偏好的主题设置：system / light / dark */
const themeMode = ref('system')

/** 根据主题设置返回对应的图片资源 */
const jueseImage = computed(() => {
  if (resolvedTheme.value === 'dark') return jueseBlackImg
  return jueseImg
})

function getStatusLabel(status) {
  const map = {
    running: '运行中',
    stopped: '已停止',
    starting: '启动中...',
    stopping: '停止中...',
  }
  return map[status] || '未知'
}

function getServiceGroup(serviceId) {
  for (const g of groups.value) {
    if (g.serviceIds && g.serviceIds.includes(serviceId)) {
      return g.id
    }
  }
  return null
}

/**
 * 应用主题到 HTML 根元素
 * @param {'light'|'dark'} theme - 实际要应用的主题
 */
function applyHtmlTheme(theme) {
  resolvedTheme.value = theme
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

/**
 * 根据用户设置和系统偏好解析最终主题
 * @param {'system'|'light'|'dark'} mode
 */
function resolveAndApplyTheme(mode) {
  if (mode === 'dark') {
    applyHtmlTheme('dark')
  } else if (mode === 'light') {
    applyHtmlTheme('light')
  } else {
    // 跟随系统
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    applyHtmlTheme(prefersDark ? 'dark' : 'light')
  }
}

/**
 * 初始化系统主题监听，同时设置初始主题
 * @param {'system'|'light'|'dark'} mode
 */
function initSystemThemeListener(mode) {
  // 清理旧监听器
  if (systemThemeMediaQuery) {
    systemThemeMediaQuery.removeEventListener('change', systemThemeMediaQuery._handler)
    systemThemeMediaQuery = null
  }

  // 立即解析并应用
  resolveAndApplyTheme(mode)

  // 如果是跟随系统模式，监听系统变化
  if (mode === 'system') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => {
      applyHtmlTheme(e.matches ? 'dark' : 'light')
    }
    mq._handler = handler
    mq.addEventListener('change', handler)
    systemThemeMediaQuery = mq
  }
}

// ========================
// 初始化
// ========================

function initFromConfig(config) {
  const svcs = (config.services || []).map(s => ({
    id: s.id,
    name: s.name || s.id,
    label: s.label,
    port: s.port,
    cwd: s.cwd,
    command: `${s.command} ${s.args.join(' ')}`,
  }))

  services.value = svcs
  killerPorts.value = config.portKiller?.ports || []
  Object.keys(groupExpanded).forEach(key => {
    delete groupExpanded[key]
  })
  groups.value = (config.groups || []).map(g => ({
    id: g.id,
    name: g.name,
    serviceIds: g.serviceIds || [],
    color: g.color || '',
    // 默认收缩，只有明确为 true 时才展开
    _expanded: false,
  }))

  for (const g of groups.value) {
      // 默认收缩，只有明确为 true 时才展开
      groupExpanded[g.id] = false
  }
  groupExpanded['__ungrouped__'] = false
    // 未分组默认收缩
  for (const s of svcs) {
    if (!logs[s.id]) logs[s.id] = []
    if (!statuses[s.id]) statuses[s.id] = 'stopped'
  }
  for (const p of killerPorts.value) {
    if (!logs['port-killer']) logs['port-killer'] = []
  }

  if (!svcs.some(s => s.id === terminalTab.value)) {
    terminalTab.value = svcs[0]?.id || ''
  }
  if (!svcs.some(s => s.id === serviceSelection.value)) {
    serviceSelection.value = svcs[0]?.id || ''
  }
}

// ========================
// 重命名弹窗操作
// ========================

/**
 * 打开重命名弹窗
 * @param {'group'|'service'} type
 * @param {string} id
 * @param {string} currentName
 */
function openRenameModal(type, id, currentName) {
  renameModal.type = type
  renameModal.id = id
  renameModal.value = currentName
  renameModal.visible = true
  closeContextMenu()
  nextTick(() => {
    if (renameModalInputRef.value) {
      renameModalInputRef.value.focus()
      renameModalInputRef.value.select()
    }
  })
}

/** 关闭重命名弹窗 */
function closeRenameModal() {
  renameModal.visible = false
  renameModal.type = ''
  renameModal.id = ''
  renameModal.value = ''
}

/** 确认重命名 */
async function confirmRename() {
  try {
    const newName = renameModal.value.trim()
    if (!newName) {
      return
    }

    if (renameModal.type === 'group') {
      // 重命名分组
      groups.value = groups.value.map(g =>
        g.id === renameModal.id ? { ...g, name: newName } : g
      )
      await saveGroupsToConfig()
    } else if (renameModal.type === 'service') {
      // 重命名服务
      if (!currentConfig.value) {
        return
      }
      const svc = currentConfig.value.services.find(s => s.id === renameModal.id)
      if (svc) {
        svc.label = newName
        svc.name = newName
      }
      const result = await window.serviceAPI.saveConfig(currentConfig.value)
      if (result.success) {
        const localSvc = services.value.find(s => s.id === renameModal.id)
        if (localSvc) localSvc.label = newName
      }
    }
  } catch (e) {
    console.error('重命名失败:', e)
  } finally {
    closeRenameModal()
  }
}

// ========================
// 分组管理
// ========================

async function saveGroupsToConfig() {
  if (!currentConfig.value) return
  currentConfig.value.groups = groups.value.map(g => ({
    id: g.id,
    name: g.name,
    serviceIds: g.serviceIds || [],
    _expanded: false,
    color: g.color || '',
  }))
  const result = await window.serviceAPI.saveConfig(currentConfig.value)
  if (!result.success && result.error) {
    console.error('Save groups failed:', result.error)
  }
}

function toggleGroupExpand(groupId) {
  groupExpanded[groupId] = !groupExpanded[groupId]
}

async function handleRemoveGroup(groupId) {
  groups.value = groups.value.filter(g => g.id !== groupId)
  delete groupExpanded[groupId]
  await saveGroupsToConfig()
}

async function handleGroupStartAll(groupId) {
  const group = groups.value.find(g => g.id === groupId)
  if (!group) return
  const stoppedServices = services.value.filter(s =>
    group.serviceIds.includes(s.id) &&
    statuses[s.id] === ServiceStatus.STOPPED
  )
  for (const svc of stoppedServices) {
    await window.serviceAPI.start(svc.id)
    await new Promise(r => setTimeout(r, 500))
  }
}

async function handleGroupStopAll(groupId) {
  const group = groups.value.find(g => g.id === groupId)
  if (!group) return
  const runningServices = services.value.filter(s =>
    group.serviceIds.includes(s.id) &&
    (statuses[s.id] === ServiceStatus.RUNNING || statuses[s.id] === ServiceStatus.STARTING)
  )
  for (const svc of runningServices) {
    await window.serviceAPI.stop(svc.id)
    await new Promise(r => setTimeout(r, 300))
  }
}

// ========================
// 上下文菜单（右键菜单）
// ========================

/**
 * 计算右键菜单的最终坐标，防止菜单溢出视口边界
 * 菜单预估尺寸：宽约 180px，高约 120px
 */
function clampMenuPosition(x, y) {
  const menuWidth = 180
  const menuHeight = 120
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight
  return {
    x: Math.min(x, viewportW - menuWidth),
    y: Math.min(y, viewportH - menuHeight),
  }
}

/** 显示服务右键菜单 */
function showContextMenu(event, service) {
  const pos = clampMenuPosition(event.clientX, event.clientY)
  contextMenu.show = true
  contextMenu.x = pos.x
  contextMenu.y = pos.y
  contextMenu.service = service
  contextMenu.isGroup = false
  showGroupAssign.value = false
}

/** 显示分组右键菜单 */
function showGroupContextMenu(event, groupId, groupName) {
  const pos = clampMenuPosition(event.clientX, event.clientY)
  contextMenu.show = true
  contextMenu.x = pos.x
  contextMenu.y = pos.y
  contextMenu.isGroup = true
  contextMenu.groupId = groupId
  contextMenu.groupName = groupName
  showGroupAssign.value = false
  showGroupColor.value = false
}

/** 关闭右键菜单 */
function closeContextMenu() {
  contextMenu.show = false
  showGroupAssign.value = false
  showGroupColor.value = false
}

/** 服务菜单：重命名 → 打开弹窗 */
function handleRenameFromMenu() {
  if (!contextMenu.service) return
  openRenameModal('service', contextMenu.service.id, contextMenu.service.label)
}

/** 分组菜单：重命名 → 打开弹窗 */
function handleGroupRenameFromMenu() {
  openRenameModal('group', contextMenu.groupId, contextMenu.groupName)
}

/** 分组菜单：选择颜色标记 */
function selectGroupColor(colorValue) {
  const group = groups.value.find(g => g.id === contextMenu.groupId)
  if (group) {
    group.color = colorValue
    saveGroupsToConfig()
  }
  showGroupColor.value = false
  closeContextMenu()
}

/** 分组菜单：清除颜色标记 */
function clearGroupColor() {
  const group = groups.value.find(g => g.id === contextMenu.groupId)
  if (group) {
    group.color = ''
    saveGroupsToConfig()
  }
  showGroupColor.value = false
  closeContextMenu()
}

/** 分配到组：展开下拉 */
function handleAssignToGroup() {
  showGroupAssign.value = !showGroupAssign.value
}

/** 执行分配到组操作 */
async function doAssignToGroup(groupId) {
  if (!contextMenu.service) return
  const serviceId = contextMenu.service.id
  const oldGroupId = getServiceGroup(serviceId)

  if (oldGroupId) {
    const oldGroup = groups.value.find(g => g.id === oldGroupId)
    if (oldGroup) {
      oldGroup.serviceIds = oldGroup.serviceIds.filter(id => id !== serviceId)
    }
  }
  if (groupId) {
    const newGroup = groups.value.find(g => g.id === groupId)
    if (newGroup) {
      newGroup.serviceIds = [...newGroup.serviceIds, serviceId]
    }
  }

  closeContextMenu()
  await saveGroupsToConfig()
}

/** 从菜单打开文件夹 */
function handleOpenFolderFromMenu() {
  if (contextMenu.service && contextMenu.service.cwd) {
    window.serviceAPI.openFolder(contextMenu.service.cwd)
  }
  closeContextMenu()
}

// ========================
// 生命周期
// ========================

onMounted(async () => {
  // 检测平台
  if (window.carvisPlatform) {
    isMacPlatform.value = window.carvisPlatform.isMac
    if (window.carvisPlatform.isMac) {
      document.documentElement.setAttribute('data-platform', 'mac')
    }
  }

  // 并行发起配置获取（减少串行等待时间）
  const [settingsResult, configResult] = await Promise.all([
    window.serviceAPI.getSettings().catch(() => ({ success: false })),
    window.serviceAPI.getFullConfig().catch(() => ({ success: false })),
  ])

  // 初始化配置后立即渲染 UI
  if (settingsResult.success && settingsResult.data) {
    currentSettings.value = settingsResult.data
  }
  if (configResult.success && configResult.data) {
    currentConfig.value = configResult.data
    initFromConfig(configResult.data)
  }

  // 根据设置初始化主题
  const savedTheme = currentSettings.value?.theme || 'system'
  themeMode.value = savedTheme
  initSystemThemeListener(savedTheme)

  // 懒加载服务状态：不阻塞首屏渲染，异步更新状态
  window.serviceAPI.getAllStatus().then(statusResult => {
    if (statusResult.success && statusResult.data) {
      for (const [name, status] of Object.entries(statusResult.data)) {
        statuses[name] = status
      }
    }
  })

  // 监听服务日志
  unsubscribeLog = window.serviceAPI.onLog((data) => {
    if (!logs[data.service]) logs[data.service] = []
    const lines = data.text.split('\n')
    const newLogs = []
    for (const line of lines) {
      if (line.trim()) {
        newLogs.push({
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          text: line,
        })
      }
    }
    if (newLogs.length > 0) {
      // 重新赋值数组引用以触发 shallowReactive 的响应式更新
      logs[data.service] = logs[data.service].concat(newLogs)
      // 日志内存保护：超过最大条数时裁剪
      if (logs[data.service].length > MAX_LOG_COUNT) {
        logs[data.service] = logs[data.service].slice(-Math.floor(MAX_LOG_COUNT * 0.8))
      }
    }
  })

  // 监听状态变更
  unsubscribeStatus = window.serviceAPI.onStatusChange((data) => {
    statuses[data.service] = data.status
  })

  // 监听应用关闭准备事件
  unsubscribeShutdown = window.serviceAPI.onAppShutdownReady(() => {
    console.log('App shutdown ready')
  })
})

onUnmounted(() => {
  if (unsubscribeLog) unsubscribeLog()
  if (unsubscribeStatus) unsubscribeStatus()
  if (unsubscribeShutdown) unsubscribeShutdown()
  // 清理系统主题监听器
  if (systemThemeMediaQuery) {
    systemThemeMediaQuery.removeEventListener('change', systemThemeMediaQuery._handler)
    systemThemeMediaQuery = null
  }
})

async function handleStart(serviceId) {
  const result = await window.serviceAPI.start(serviceId)
  if (!result.success && result.error) {
    console.error('Start service failed:', result.error)
  }
}

async function handleStop(serviceId) {
  const result = await window.serviceAPI.stop(serviceId)
  if (!result.success && result.error) {
    console.error('Stop service failed:', result.error)
  }
}

async function handleRestart(serviceId) {
  const st = statuses[serviceId]
  if (st === ServiceStatus.RUNNING || st === ServiceStatus.STARTING) {
    await window.serviceAPI.stop(serviceId)
    await new Promise(r => setTimeout(r, 1500))
  }
  await window.serviceAPI.start(serviceId)
}

async function handleStartAll() {
  isBulkStarting.value = true
  const stoppedServices = services.value.filter(s => {
    const st = statuses[s.id]
    return st === ServiceStatus.STOPPED
  })
  for (const svc of stoppedServices) {
    await window.serviceAPI.start(svc.id)
    await new Promise(r => setTimeout(r, 500))
  }
  isBulkStarting.value = false
}

async function handleStopAll() {
  const runningServices = services.value.filter(s => {
    const st = statuses[s.id]
    return st === ServiceStatus.RUNNING || st === ServiceStatus.STARTING
  })
  for (const svc of runningServices) {
    await window.serviceAPI.stop(svc.id)
    await new Promise(r => setTimeout(r, 300))
  }
}

/** 清空指定服务的日志 */
function handleClearLogs(serviceId) {
  logs[serviceId] = []
}

async function handleSaveConfig(payload) {
  console.log('[App:handleSaveConfig] received payload keys:', Object.keys(payload || {}))
  console.log('[App:handleSaveConfig] payload.config keys:', Object.keys(payload?.config || {}))
  console.log('[App:handleSaveConfig] payload.settings:', payload?.settings)

  const nextConfig = payload?.config || payload
  const nextSettings = payload?.settings || null

  console.log('[App:handleSaveConfig] nextConfig keys:', Object.keys(nextConfig || {}))
  console.log('[App:handleSaveConfig] nextSettings:', nextSettings)

  console.log('[App:handleSaveConfig] before saveConfig IPC')
  const result = await window.serviceAPI.saveConfig(nextConfig)
  console.log('[App:handleSaveConfig] after saveConfig IPC, result:', JSON.stringify(result))

  if (result && result.success) {
    console.log('[App:handleSaveConfig] save success, updating local state')
    currentConfig.value = nextConfig
    if (nextSettings) {
      currentSettings.value = { ...nextSettings }
    }
    initFromConfig(nextConfig)
    showSettings.value = false
    console.log('[App:handleSaveConfig] dialog closed, state updated')

    // 同步开机自启动到操作系统级别
    if (nextSettings && typeof nextSettings.autoStart !== 'undefined') {
      console.log('[App:handleSaveConfig] syncing autoStart to OS:', nextSettings.autoStart)
      window.serviceAPI.setAutoStart(nextSettings.autoStart).catch(e =>
        console.error('[App:handleSaveConfig] setAutoStart failed:', e)
      )
    }

    // 应用主题设置
    if (nextSettings && nextSettings.theme) {
      themeMode.value = nextSettings.theme
      initSystemThemeListener(nextSettings.theme)
    }
  } else {
    console.error('[App:handleSaveConfig] Save config failed:', result?.error || 'unknown error')
    // 即使保存失败也关闭弹窗（避免弹窗无法关闭）
    showSettings.value = false
  }
}

function minimizeWindow() {
  window.serviceAPI.minimizeWindow()
}

function maximizeWindow() {
  window.serviceAPI.maximizeWindow?.()
}

function closeWindow() {
  window.serviceAPI.closeWindow()
}

async function openFolder(folderPath) {
  await window.serviceAPI.openFolder(folderPath)
}
</script>
