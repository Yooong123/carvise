<template>
  <div class="settings-overlay" @click.self="$emit('close')">
    <div class="settings-modal">
      <!-- 弹窗头部：标题 + 关闭按钮 -->
      <div class="settings-header">
        <h2 class="settings-title">
          <!-- 齿轮图标 -->
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3">
            <circle cx="8" cy="8" r="2.5"/>
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41"/>
          </svg>
          设置
        </h2>
        <button class="close-btn" @click="$emit('close')" title="关闭">
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <line x1="1" y1="1" x2="11" y2="11"/>
            <line x1="11" y1="1" x2="1" y2="11"/>
          </svg>
        </button>
      </div>

      <div class="settings-body">
        <!-- 应用内错误提示（替代 window.alert，macOS 下 window.alert 无效） -->
        <div v-if="errorMsg" class="settings-error-banner" @click="errorMsg = ''">{{ errorMsg }}</div>

        <!-- ======================== -->
        <!-- 服务管理（分组优先） -->
        <!-- ======================== -->
        <section class="settings-section">
          <div class="section-header">
            <h3>服务管理</h3>
            <button class="add-btn" @mousedown.prevent @click="addGroup">+ 新建分组</button>
          </div>

          <!-- 新建分组的内联输入框 -->
          <div v-if="creatingGroup" class="group-add-inline">
            <input
              ref="newGroupInputRef"
              v-model="newGroupName"
              class="field-input"
              placeholder="输入分组名称，按回车确认"
              @keydown.enter.prevent="confirmCreateGroup"
              @keydown.escape.prevent="cancelCreateGroup"
            />
          </div>

          <!-- 分组列表 -->
          <div class="group-list">
            <!-- 遍历每个已命名分组 -->
            <div v-for="(group, index) in localGroups" :key="group.id" class="group-container">
              <!-- 分组头部 -->
              <div
                class="settings-group-header"
                :class="{ expanded: groupExpanded[group.id] }"
                @click="toggleGroupExpand(group.id)"
              >
                <!-- 展开/折叠箭头 -->
                <svg
                  class="group-arrow"
                  viewBox="0 0 12 12"
                  width="12" height="12"
                  fill="none" stroke="currentColor" stroke-width="1.5"
                >
                  <path d="M4 2l4 4-4 4"/>
                </svg>

                <!-- 分组名称：重命名模式 vs 显示模式 -->
                <template v-if="renamingGroupId === group.id">
                  <input
                    ref="renameInputRef"
                    v-model="renamingValue"
                    class="field-input group-rename-input"
                    placeholder="分组名称"
                    @click.stop
                    @keydown.enter.prevent="confirmRename(group.id)"
                    @keydown.escape.prevent="cancelRename"
                    @blur="confirmRename(group.id)"
                  />
                </template>
                <template v-else>
                  <span class="settings-group-name">{{ group.name }}</span>
                  <span v-if="group.color" class="settings-group-color-dot" :style="{ background: colorMap[group.color] }"></span>
                  <span class="group-count">{{ groupServiceCounts[group.id] || 0 }} 个服务</span>
                </template>

                <!-- 分组操作按钮（hover 显示） -->
                <div class="group-actions" @click.stop>
                  <!-- 上移 -->
                  <button
                    class="group-action-btn"
                    title="上移"
                    :disabled="index === 0"
                    @mousedown.prevent
                    @click="moveGroupUp(index)"
                  >
                    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M7 11V3M3 7l4-4 4 4"/>
                    </svg>
                  </button>
                  <!-- 下移 -->
                  <button
                    class="group-action-btn"
                    title="下移"
                    :disabled="index === localGroups.length - 1"
                    @mousedown.prevent
                    @click="moveGroupDown(index)"
                  >
                    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M7 3v8M3 7l4 4 4-4"/>
                    </svg>
                  </button>
                  <button
                    class="group-action-btn"
                    title="重命名"
                    @mousedown.prevent
                    @click="startRename(group)"
                  >
                    <!-- 铅笔图标 -->
                    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3">
                      <path d="M10 1.5l2.5 2.5L4.5 12H2v-2.5L10 1.5z"/>
                    </svg>
                  </button>
                  <button
                    class="group-action-btn group-action-delete"
                    title="删除分组"
                    @mousedown.prevent
                    @click="deleteGroup(group.id)"
                  >
                    <!-- 垃圾桶图标 -->
                    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3">
                      <path d="M2 3.5h10M5 3.5V2a1 1 0 011-1h2a1 1 0 011 1v1.5M3 3.5l.5 8.5a1 1 0 001 1h5a1 1 0 001-1l.5-8.5"/>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- 分组内容（可折叠动画） -->
              <Transition name="collapse">
                <div v-show="groupExpanded[group.id]" class="group-content">
                  <!-- 分组内的服务卡片 -->
                  <div
                    v-for="svc in getGroupServices(group.id)"
                    :key="svc.id"
                    class="service-edit-card"
                  >
                    <div class="service-edit-header">
                      <input
                        v-model="svc.label"
                        class="field-input field-label"
                        placeholder="显示名称"
                      />
                      <button class="remove-btn" @click="removeService(svc.id)" title="删除">
                        <svg viewBox="0 0 12 12" width="12" height="12">
                          <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.5"/>
                          <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.5"/>
                        </svg>
                      </button>
                    </div>

                    <div class="field-grid">
                      <div class="field-group field-full">
                        <label>
                          ID
                          <span class="field-hint">（用于快速搜索）</span>
                        </label>
                        <input v-model="svc.id" class="field-input" placeholder="唯一标识 (英文)" />
                      </div>
                      <div class="field-group field-full">
                        <label>工作路径</label>
                        <input v-model="svc.cwd" class="field-input" placeholder="C:\path\to\project" />
                      </div>
                      <div class="field-group">
                        <label>命令</label>
                        <input v-model="svc.command" class="field-input" placeholder="pnpm" />
                      </div>
                      <div class="field-group">
                        <label>参数</label>
                        <input v-model="svc.argsStr" class="field-input" placeholder="run dev" />
                      </div>
                      <div class="field-group">
                        <label>端口</label>
                        <input v-model.number="svc.port" type="number" class="field-input" placeholder="3000" />
                      </div>
                    </div>
                  </div>

                  <!-- 分组底部的添加服务按钮 -->
                  <button class="add-service-in-group-btn" @click="addServiceToGroup(group.id)">
                    + 添加服务
                  </button>
                </div>
              </Transition>
            </div>

            <!-- 未分组（可折叠，默认合拢） -->
            <div v-if="ungroupedServices.length > 0" class="group-container">
              <div
                class="settings-group-header"
                :class="{ expanded: groupExpanded['__ungrouped__'] }"
                @click="toggleGroupExpand('__ungrouped__')"
              >
                <svg
                  class="group-arrow"
                  viewBox="0 0 12 12"
                  width="12" height="12"
                  fill="none" stroke="currentColor" stroke-width="1.5"
                >
                  <path d="M4 2l4 4-4 4"/>
                </svg>
                <span class="settings-group-name">未分组</span>
                <span class="group-count">{{ ungroupedServices.length }} 个服务</span>
              </div>
              <Transition name="collapse">
                <div v-show="groupExpanded['__ungrouped__']" class="group-content">
                  <div
                    v-for="svc in ungroupedServices"
                    :key="svc.id"
                    class="service-edit-card"
                  >
                    <div class="service-edit-header">
                      <input
                        v-model="svc.label"
                        class="field-input field-label"
                        placeholder="显示名称"
                      />
                      <button class="remove-btn" @click="removeService(svc.id)" title="删除">
                        <svg viewBox="0 0 12 12" width="12" height="12">
                          <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.5"/>
                          <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.5"/>
                        </svg>
                      </button>
                    </div>

                    <div class="field-grid">
                      <div class="field-group field-full">
                        <label>
                          ID
                          <span class="field-hint">（用于快速搜索）</span>
                        </label>
                        <input v-model="svc.id" class="field-input" placeholder="唯一标识 (英文)" />
                      </div>
                      <div class="field-group field-full">
                        <label>工作路径</label>
                        <input v-model="svc.cwd" class="field-input" placeholder="C:\path\to\project" />
                      </div>
                      <div class="field-group">
                        <label>命令</label>
                        <input v-model="svc.command" class="field-input" placeholder="pnpm" />
                      </div>
                      <div class="field-group">
                        <label>参数</label>
                        <input v-model="svc.argsStr" class="field-input" placeholder="run dev" />
                      </div>
                      <div class="field-group">
                        <label>端口</label>
                        <input v-model.number="svc.port" type="number" class="field-input" placeholder="3000" />
                      </div>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>

            <!-- 无分组时的空状态提示 -->
            <div v-if="localGroups.length === 0 && editConfig.services.length === 0" class="empty-groups-hint">
              暂无分组和服务，请点击上方「新建分组」开始
            </div>
          </div>
        </section>

        <!-- ======================== -->
        <!-- 端口清理设置 -->
        <!-- ======================== -->
        <section class="settings-section">
          <div class="section-header">
            <h3>端口清理</h3>
            <button class="add-btn" @click="addPort">+ 添加端口</button>
          </div>
          <div class="port-list">
            <div v-for="(port, index) in editConfig.portKiller.ports" :key="index" class="port-edit-item">
              <input
                :value="port"
                @input="updatePort(index, $event.target.value)"
                type="number"
                class="field-input port-input"
                placeholder="端口号"
              />
              <button class="remove-btn" @click="removePort(index)" title="删除">
                <svg viewBox="0 0 12 12" width="12" height="12">
                  <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.5"/>
                  <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
            </div>
          </div>
        </section>

        <!-- ======================== -->
        <!-- 基础设置 -->
        <!-- ======================== -->
        <section class="settings-section">
          <div class="section-header">
            <h3>基础设置</h3>
          </div>
          <div class="startup-settings">
            <!-- 主题选择 -->
            <div class="setting-toggle-item">
              <div class="setting-toggle-info">
                <span class="setting-toggle-label">主题</span>
                <span class="setting-toggle-desc">选择界面外观风格,保存后生效</span>
              </div>
              <select
                class="field-select theme-select"
                :value="startupSettings.theme"
                @change="onThemeChange"
              >
                <option value="system">跟随系统</option>
                <option value="light">亮色</option>
                <option value="dark">暗色</option>
              </select>
            </div>
            <div class="setting-toggle-item">
              <div class="setting-toggle-info">
                <span class="setting-toggle-label">开机自启动</span>
                <span class="setting-toggle-desc">系统登录后自动启动 Carvis</span>
              </div>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="startupSettings.autoStart"
                  @change="toggleAutoStart"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="setting-toggle-item">
              <div class="setting-toggle-info">
                <span class="setting-toggle-label">关闭时最小化到托盘</span>
                <span class="setting-toggle-desc">窗口关闭时隐藏到系统托盘而非退出</span>
              </div>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="startupSettings.minimizeToTray"
                  @change="toggleMinimizeToTray"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </section>

        <!-- ======================== -->
        <!-- 关于 Carvis              -->
        <!-- ======================== -->
        <section class="settings-section">
          <div class="section-header">
            <h3>关于 Carvis</h3>
          </div>
          <div class="about-content">
            <div class="about-version">
              <span class="about-label">版本号</span>
              <span class="about-value">v{{ appVersion }}</span>
            </div>
            <p class="about-quote">
              不追求功能的强大，只是实实在在地帮你去掉那些重复、枯燥、低价值的操作。
              一点点积累起来，就是每天多出来的专注时间。
            </p>
          </div>
        </section>
      </div>

      <!-- 弹窗底部操作按钮 -->
      <div class="settings-footer">
        <button class="btn-cancel" @click="handleCancel">取消</button>
        <button type="button" class="btn-save" @click="handleSave">保存设置</button>
      </div>
    </div>
  </div>

  <!-- 删除分组确认弹窗（替代 window.confirm，macOS WebView 不支持 window.confirm） -->
  <div v-if="confirmState.show" class="confirm-overlay" @click.self="cancelDeleteGroup">
    <div class="confirm-modal">
      <div class="confirm-title">删除分组</div>
      <div class="confirm-text">确定要删除分组「{{ confirmState.groupName }}」吗？分组内的服务会变为未分组状态。</div>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-btn-cancel" @click="cancelDeleteGroup">取消</button>
        <button class="confirm-btn confirm-btn-danger" @click="confirmDeleteGroup">删除</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted, nextTick } from 'vue'
import { tauriApi } from '../services/tauriApi'

const props = defineProps({
  config: { type: Object, required: true },
  settings: { type: Object, default: () => ({}) },
  groups: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'save'])

/** 应用内错误提示（替代 window.alert：Tauri 2 的 macOS WebView 未实现 window.alert，会静默失效） */
const errorMsg = ref('')

/** 删除分组确认弹窗状态（替代 window.confirm：macOS WebView 同样未实现，返回 undefined 会导致删除被提前取消） */
const confirmState = reactive({ show: false, groupId: '', groupName: '' })

/**
 * 应用版本号，通过 electron API 获取
 */
const appVersion = ref('')

/**
 * 启动设置编辑状态（响应式）
 * 从 props.settings 初始化，修改后不会立即持久化
 */
const startupSettings = reactive({
  autoStart: false,
  minimizeToTray: false,
  theme: 'system',
})

/** 启动设置的初始快照，取消时可恢复 */
let startupSettingsSnapshot = {
  autoStart: false,
  minimizeToTray: false,
  theme: 'system',
}

/**
 * 初始化启动设置和应用版本
 */
onMounted(async () => {
  // 获取版本号
  try {
    const version = await tauriApi.getAppVersion()
    appVersion.value = version || '0.10.0'
  } catch {
    appVersion.value = '0.10.0'
  }

  // 从 props.settings 初始化启动设置
  if (props.settings) {
    startupSettings.autoStart = !!props.settings.autoStart
    startupSettings.minimizeToTray = !!props.settings.minimizeToTray
    startupSettings.theme = props.settings.theme || 'system'
  }
  startupSettingsSnapshot = {
    autoStart: startupSettings.autoStart,
    minimizeToTray: startupSettings.minimizeToTray,
    theme: startupSettings.theme,
  }
})

/**
 * 切换开机自启动（仅修改内存状态，不立即持久化）
 */
function toggleAutoStart() {
  startupSettings.autoStart = !startupSettings.autoStart
}

/**
 * 切换最小化到托盘（仅修改内存状态，不立即持久化）
 */
function toggleMinimizeToTray() {
  startupSettings.minimizeToTray = !startupSettings.minimizeToTray
}

/**
 * 主题切换
 */
function onThemeChange(e) {
  startupSettings.theme = e.target.value
}

/** 取消时恢复初始状态 */
function revertStartupSettings() {
  startupSettings.autoStart = startupSettingsSnapshot.autoStart
  startupSettings.minimizeToTray = startupSettingsSnapshot.minimizeToTray
}

// ========================
// 编辑数据初始化
// ========================

/**
 * 编辑用配置（深拷贝各项数据）
 * - services：扁平数组，每项带 _groupId 标记所属分组
 * - portKiller：端口清理配置
 */
const editConfig = reactive({
  services: props.config.services.map(s => {
    // 查找服务所属分组
    let groupId = null
    for (const g of (props.groups || [])) {
      if (g.serviceIds && g.serviceIds.includes(s.id)) {
        groupId = g.id
        break
      }
    }
    return {
      ...s,
      argsStr: s.args.join(' '),
      _groupId: groupId,
    }
  }),
  portKiller: {
    ports: [...(props.config.portKiller?.ports || [8833])],
  },
})

/**
 * 本地分组列表（编辑用，从 props.groups 深拷贝）
 */
const localGroups = reactive(
  (props.groups || []).map(g => ({
    id: g.id,
    name: g.name,
    color: g.color || '',
  }))
)

// ========================
// 分组展开/折叠状态
// ========================

/**
 * 每个分组的展开状态
 * 默认收缩
 */
const groupExpanded = reactive({})

// 初始化分组展开状态，默认收缩
localGroups.forEach(g => {
  groupExpanded[g.id] = false
})
groupExpanded['__ungrouped__'] = false

/**
 * 切换分组的展开/折叠
 */
function toggleGroupExpand(groupId) {
  groupExpanded[groupId] = !groupExpanded[groupId]
}

// ========================
// 分组管理：新建
// ========================

const creatingGroup = ref(false)
const newGroupName = ref('')
const newGroupInputRef = ref(null)

/**
 * 进入新建分组模式：显示内联输入框
 */
function addGroup() {
  creatingGroup.value = true
  newGroupName.value = ''
  nextTick(() => {
    if (newGroupInputRef.value) {
      newGroupInputRef.value.focus()
    }
  })
}

/**
 * 确认创建分组
 */
function confirmCreateGroup() {
  const name = newGroupName.value.trim()
  if (!name) {
    cancelCreateGroup()
    return
  }
  const id = 'group-' + Date.now()
  localGroups.push({ id, name })
  // 新创建的分组默认收缩
  groupExpanded[id] = false
  creatingGroup.value = false
  newGroupName.value = ''
}

/**
 * 取消创建分组
 */
function cancelCreateGroup() {
  creatingGroup.value = false
  newGroupName.value = ''
}

// ========================
// 分组管理：重命名
// ========================

const renamingGroupId = ref(null)
const renamingValue = ref('')
const renameInputRef = ref(null)

/**
 * 进入重命名模式
 */
function startRename(group) {
  renamingGroupId.value = group.id
  renamingValue.value = group.name
  nextTick(() => {
    if (renameInputRef.value) {
      renameInputRef.value.focus()
      renameInputRef.value.select()
    }
  })
}

/**
 * 确认重命名
 */
function confirmRename(groupId) {
  const name = renamingValue.value.trim()
  if (!name) {
    cancelRename()
    return
  }
  const group = localGroups.find(g => g.id === groupId)
  if (group) {
    group.name = name
  }
  renamingGroupId.value = null
  renamingValue.value = ''
}

/**
 * 取消重命名
 */
function cancelRename() {
  renamingGroupId.value = null
  renamingValue.value = ''
}

// ========================
// 分组管理：删除
// ========================

/**
 * 请求删除分组：弹出应用内确认框
 * 注意：不能用 window.confirm —— Tauri 2 的 macOS WebView 并未实现 window.confirm，
 * 调用返回 undefined，导致 `if (!undefined) return` 直接取消删除（且 Windows 正常），
 * 这正是 macOS 上「无法删除分组」的根因。
 */
function deleteGroup(groupId) {
  const group = localGroups.find(g => g.id === groupId)
  confirmState.groupId = groupId
  confirmState.groupName = group ? group.name : ''
  confirmState.show = true
}

/**
 * 确认删除分组（由确认弹窗的「删除」按钮触发）
 * - 原分组内的服务变为未分组（_groupId = null）
 */
function confirmDeleteGroup() {
  const groupId = confirmState.groupId
  // 将分组内所有服务的 _groupId 置空
  for (const svc of editConfig.services) {
    if (svc._groupId === groupId) {
      svc._groupId = null
    }
  }
  // 移除分组
  const idx = localGroups.findIndex(g => g.id === groupId)
  if (idx !== -1) {
    localGroups.splice(idx, 1)
  }
  delete groupExpanded[groupId]
  cancelDeleteGroup()
}

/** 取消删除分组 */
function cancelDeleteGroup() {
  confirmState.show = false
  confirmState.groupId = ''
  confirmState.groupName = ''
}

// ========================
// 分组管理：排序
// ========================

/**
 * 分组上移
 * 使用数组交换方式确保响应式系统正确跟踪顺序变化
 * @param {number} index - 当前索引
 */
function moveGroupUp(index) {
  if (index <= 0) return
  // 使用直接交换方式，确保响应式更新
  const temp = localGroups[index]
  localGroups[index] = localGroups[index - 1]
  localGroups[index - 1] = temp
}

/**
 * 分组下移
 * 使用数组交换方式确保响应式系统正确跟踪顺序变化
 * @param {number} index - 当前索引
 */
function moveGroupDown(index) {
  if (index >= localGroups.length - 1) return
  // 使用直接交换方式，确保响应式更新
  const temp = localGroups[index]
  localGroups[index] = localGroups[index + 1]
  localGroups[index + 1] = temp
}

// ========================
// 服务查询辅助
// ========================

/**
 * 获取指定分组下的所有服务
 */
function getGroupServices(groupId) {
  return editConfig.services.filter(s => s._groupId === groupId)
}

/**
 * 获取未分组服务列表
 */
const ungroupedServices = computed(() => {
  return editConfig.services.filter(s => !s._groupId)
})

/**
 * 获取指定分组下的服务数量
 * 使用 computed 确保响应式更新
 */
const groupServiceCounts = computed(() => {
  const map = {}
  for (const svc of editConfig.services) {
    const gid = svc._groupId
    if (gid) {
      map[gid] = (map[gid] || 0) + 1
    }
  }
  return map
})

// ========================
// 服务管理：增删改
// ========================

/**
 * 向指定分组添加新服务
 */
function addServiceToGroup(groupId) {
  editConfig.services.push({
    id: '',
    name: '',
    label: 'New Service',
    cwd: '',
    command: 'pnpm',
    args: ['run', 'dev'],
    argsStr: 'run dev',
    port: 3000,
    _groupId: groupId,
  })
}

/**
 * 删除指定服务
 */
function removeService(serviceId) {
  const idx = editConfig.services.findIndex(s => s.id === serviceId)
  if (idx !== -1) {
    editConfig.services.splice(idx, 1)
  }
}

// ========================
// 端口管理
// ========================

function addPort() {
  editConfig.portKiller.ports.push(8080)
}

function removePort(index) {
  editConfig.portKiller.ports.splice(index, 1)
}

function updatePort(index, value) {
  editConfig.portKiller.ports[index] = parseInt(value) || 0
}

// ========================
// 保存逻辑
// ========================

/**
 * 端口最小值
 */
const MIN_PORT = 1

/**
 * 端口最大值
 */
const MAX_PORT = 65535

/**
 * 颜色映射表
 */
const colorMap = {
  red: '#F53F3F',
  orange: '#FF7D00',
  gold: '#F7BA1E',
  green: '#00B42A',
  cyan: '#14C9C9',
  blue: '#165DFF',
  purple: '#722ED1',
  pink: '#F5319D',
}

/**
 * 校验端口号是否在有效范围内
 * @param {number} port - 端口号
 * @returns {boolean} 是否有效
 */
function isValidPort(port) {
  const portNum = parseInt(port)
  return !isNaN(portNum) && portNum >= MIN_PORT && portNum <= MAX_PORT
}

/**
/**
 * 保存设置
 * 根据可视化的分组层次结构重建 groups 和 services 数据
 * 仅在用户实际修改了设置时才执行保存操作
 */
async function handleSave() {
  errorMsg.value = ''
  console.log('[SettingsModal] handleSave triggered')
  console.log('[SettingsModal] editConfig.services count:', editConfig.services.length)
  console.log('[SettingsModal] localGroups count:', localGroups.length)
  console.log('[SettingsModal] startupSettings:', { ...startupSettings })
  console.log('[SettingsModal] props.config keys:', Object.keys(props.config))

  try {
    // 校验所有服务的ID唯一性
    const idErrors = []
    const usedIds = new Set()

    for (const svc of editConfig.services) {
      const trimmedId = String(svc.id || '').trim()
      if (!trimmedId) {
        idErrors.push(`服务 "${svc.label || '未命名'}" 的 ID 不能为空`)
        continue
      }
      if (usedIds.has(trimmedId)) {
        idErrors.push(`重复的服务 ID: "${trimmedId}"`)
      }
      usedIds.add(trimmedId)
    }

    // 校验端口范围
    const portErrors = []
    for (const svc of editConfig.services) {
      if (svc.port && !isValidPort(svc.port)) {
        portErrors.push(`服务 "${svc.label || '未命名'}" 的端口 ${svc.port} 不在有效范围内 (${MIN_PORT}-${MAX_PORT})`)
      }
    }

    const allErrors = [...idErrors, ...portErrors]
    if (allErrors.length > 0) {
      console.warn('[SettingsModal] Validation errors:', allErrors)
      errorMsg.value = '配置校验失败：\n' + allErrors.join('\n')
      return
    }

    // 构建清理后的配置数据
    const cleanServices = editConfig.services.map(s => ({
      id: String(s.id || '').trim(),
      name: String(s.name || s.id || '').trim(),
      label: String(s.label || s.id || '').trim() || 'Unnamed Service',
      cwd: String(s.cwd || '').trim(),
      command: String(s.command || '').trim(),
      args: String(s.argsStr || '').split(/\s+/).filter(Boolean),
      port: parseInt(s.port) || 0,
    }))
    console.log('[SettingsModal] cleanServices built:', cleanServices.length)

    // 根据服务所属分组重新构建 groups 列表
    const cleanGroups = localGroups.map(g => ({
      id: g.id,
      name: g.name,
      serviceIds: editConfig.services
        .filter(s => s._groupId === g.id)
        .map(s => String(s.id || '').trim())
        .filter(Boolean),
      _expanded: false,
      color: g.color || '',
    }))
    console.log('[SettingsModal] cleanGroups built:', cleanGroups.length)

    // 构建完整配置，包含最新 settings
    // 注意：props.config 是 Vue 响应式代理对象，直接展开会让非覆盖字段仍携带代理，
    // 传给 Electron IPC 时会触发 "An object could not be cloned"。先深拷贝成纯对象。
    const cleanConfig = {
      ...JSON.parse(JSON.stringify(props.config)),
      services: cleanServices,
      groups: cleanGroups,
      portKiller: {
        ports: editConfig.portKiller.ports.map(p => parseInt(p)).filter(p => p > 0),
      },
      settings: {
        autoStart: startupSettings.autoStart,
        minimizeToTray: startupSettings.minimizeToTray,
        theme: startupSettings.theme,
      },
    }
    console.log('[SettingsModal] cleanConfig built, keys:', Object.keys(cleanConfig))

    console.log('[SettingsModal] about to emit save')
    emit('save', {
      config: cleanConfig,
      settings: {
        autoStart: startupSettings.autoStart,
        minimizeToTray: startupSettings.minimizeToTray,
        theme: startupSettings.theme,
      },
    })
    console.log('[SettingsModal] emit save completed')
  } catch (e) {
    console.error('[SettingsModal] 保存设置失败:', e)
    errorMsg.value = '保存设置出错: ' + (e?.message || e)
  }
}

/** 取消：恢复启动设置到初始值，然后关闭弹窗 */
function handleCancel() {
  revertStartupSettings()
  emit('close')
}
</script>

<style scoped>
/* ========================
   分组层次结构样式
   ======================== */

/* 分组容器 */
.group-container {
  margin-bottom: var(--spacing-md);
}

/* 分组头部 */
.settings-group-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 10px var(--spacing-md);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  user-select: none;
  transition: all var(--transition-fast);
}

.settings-group-header:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-color-hover);
}

.settings-group-header.expanded {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  border-bottom-color: transparent;
}

/* 展开/折叠箭头 */
.group-arrow {
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.settings-group-header.expanded .group-arrow {
  transform: rotate(90deg);
}

/* 分组名称 */
.settings-group-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 分组服务计数 */
.group-count {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* 设置中分组颜色标记圆点 */
.settings-group-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 分组操作按钮（hover 显示） */
.settings-group-header .group-actions {
  display: none;
  gap: 2px;
  margin-left: auto;
  flex-shrink: 0;
}

.settings-group-header:hover .group-actions {
  display: flex;
}

.group-action-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.group-action-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary);
}

.group-action-delete:hover {
  color: var(--accent-danger) !important;
  background: rgba(245, 63, 63, 0.06) !important;
}

/* 分组重命名内联输入框 */
.group-rename-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  font-size: 14px;
  font-weight: 600;
}

/* 分组内容区域 */
.group-content {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-top: none;
  border-bottom-left-radius: var(--radius-md);
  border-bottom-right-radius: var(--radius-md);
  padding: var(--spacing-md);
}

/* 分组内的添加服务按钮 */
.add-service-in-group-btn {
  display: block;
  width: 100%;
  padding: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-success);
  background: transparent;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-bottom: var(--spacing-md);
  font-family: var(--font-sans);
}

.add-service-in-group-btn:hover {
  background: rgba(0, 180, 42, 0.04);
  border-color: rgba(0, 180, 42, 0.3);
}

/* 新建分组的内联输入框 */
.group-add-inline {
  margin-bottom: var(--spacing-md);
}

.group-add-inline .field-input {
  width: 100%;
}

/* 设置分区标题 */
.settings-section {
  margin-bottom: var(--spacing-lg, 24px);
}

/* 无分组空状态 */
.empty-groups-hint {
  text-align: center;
  padding: var(--spacing-2xl) var(--spacing-lg);
  color: var(--text-muted);
  font-size: 13px;
}

/* 关于 Carvis */
.about-content {
  padding: var(--spacing-md) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.about-version {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 13px;
}

.about-label {
  color: var(--text-muted);
  font-weight: 500;
}

.about-value {
  color: var(--text-primary);
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
}

.about-quote {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-tertiary, var(--text-muted));
  font-style: italic;
  max-width: 480px;
}

/* ========================
   折叠动画
   ======================== */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
  border-top-width: 0;
  border-bottom-width: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  max-height: 2000px;
}

/* 覆盖 .group-content 在折叠时的内边距 */
.collapse-leave-active .group-content,
.collapse-enter-active .group-content {
  transition: all 0.25s ease;
}

.collapse-enter-from .group-content,
.collapse-leave-to .group-content {
  padding-top: 0;
  padding-bottom: 0;
}

/* ========================
   服务编辑卡片（缩进适配）
   ======================== */
.group-content .service-edit-card:last-child {
  margin-bottom: 0;
}

/* ========================
   应用内提示与确认弹窗（替代 window.alert / window.confirm）
   ======================== */

/* 保存校验/错误提示横幅 */
.settings-error-banner {
  margin: 0 var(--spacing-lg) var(--spacing-md);
  padding: 10px 14px;
  background: rgba(245, 63, 63, 0.08);
  border: 1px solid rgba(245, 63, 63, 0.3);
  border-radius: var(--radius-md);
  color: var(--accent-danger, #f53f3f);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  cursor: pointer;
}

/* 删除分组确认弹窗遮罩 */
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.confirm-modal {
  width: 320px;
  max-width: 90%;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e3e6ec);
  border-radius: var(--radius-lg, 14px);
  padding: 20px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
}

.confirm-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #1c2027);
  margin-bottom: 10px;
}

.confirm-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary, #5b6270);
  margin-bottom: 18px;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.confirm-btn {
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--border-color, #e3e6ec);
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--text-primary, #1c2027);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.confirm-btn:hover {
  background: var(--bg-tertiary, #f0f2f5);
}

.confirm-btn-danger {
  border-color: rgba(245, 63, 63, 0.4);
  color: var(--accent-danger, #f53f3f);
}

.confirm-btn-danger:hover {
  background: rgba(245, 63, 63, 0.08);
}
</style>
