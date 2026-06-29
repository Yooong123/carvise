/**
 * processManager.js - 进程管理核心逻辑（动态配置版）
 * 负责服务的启动、停止、端口检测和端口关闭
 * 所有服务信息从配置文件动态读取，不再硬编码
 * 
 * 配置数据结构规范：
 * - services: 服务列表，每项包含 id, name, label, cwd, command, args, port
 * - groups: 分组列表，每项包含 id, name, serviceIds, _expanded
 * - portKiller: 端口清理配置，包含 ports 数组
 * - settings: 应用设置，包含 autoStart, minimizeToTray
 */

const { spawn } = require('child_process');
const { exec } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const plat = require('./platform');

// 动态服务映射表（从配置文件加载）
let servicesMap = {};

// 运行中的进程记录
const runningProcesses = {};

// 正在停止中的服务集合（防止端口检测在停止过程中误发 running 状态）
const stoppingServices = new Set();

// 端口到服务ID的映射（用于保护正在运行的服务端口）
const portToServiceMap = new Map();

// ========================
// 配置类型定义与校验
// ========================

/**
 * 默认配置（首次使用时生成）
 */
function getDefaultConfig() {
  return {
    services: [],
    groups: [],
    settings: {
      autoStart: false,
      minimizeToTray: false,
      theme: 'system',
    },
    portKiller: {
      ports: [],
    },
  };
}

/**
 * 服务配置接口类型
 * @typedef {Object} ServiceConfig
 * @property {string} id - 唯一标识符（英文，用于搜索和代码引用）
 * @property {string} name - 内部名称（可与ID相同）
 * @property {string} label - 显示名称（用户可见）
 * @property {string} cwd - 工作目录路径
 * @property {string} command - 启动命令
 * @property {string[]} args - 命令参数数组
 * @property {number} port - 监听端口
 */

/**
 * 分组配置接口类型
 * @typedef {Object} GroupConfig
 * @property {string} id - 唯一标识符
 * @property {string} name - 分组名称
 * @property {string[]} serviceIds - 所属服务ID列表
 * @property {boolean} [_expanded] - 展开状态（可选）
 */

/**
 * 校验服务ID是否唯一
 * @param {ServiceConfig[]} services - 服务列表
 * @param {string} id - 要检查的ID
 * @param {string} [excludeId] - 排除的服务ID（用于编辑场景）
 * @returns {boolean} 是否唯一
 */
function isServiceIdUnique(services, id, excludeId = null) {
  if (!id || typeof id !== 'string') return false;
  const trimmedId = id.trim();
  if (!trimmedId) return false;
  return services.every(s => s.id !== trimmedId || s.id === excludeId);
}

/**
 * 校验配置数据，修复异常格式
 * @param {Object} config - 原始配置对象
 * @returns {Object} 校验后的配置对象
 */
function validateAndFixConfig(config) {
  const validated = getDefaultConfig();
  
  // 校验服务列表
  if (Array.isArray(config.services)) {
    validated.services = config.services.filter(s => s && typeof s === 'object').map(s => ({
      id: String(s.id || '').trim() || null,
      name: String(s.name || s.id || '').trim(),
      label: String(s.label || s.name || s.id || '').trim() || 'Unnamed Service',
      cwd: String(s.cwd || '').trim(),
      command: String(s.command || '').trim(),
      args: Array.isArray(s.args) ? s.args.filter(a => a != null).map(String) : [],
      port: parseInt(s.port) || 0,
    })).filter(s => s.id); // 过滤掉ID为空的服务
  }
  
  // 校验分组列表
  if (Array.isArray(config.groups)) {
    validated.groups = config.groups.filter(g => g && typeof g === 'object' && g.id).map(g => ({
      id: String(g.id).trim(),
      name: String(g.name || 'Unnamed Group').trim(),
      serviceIds: Array.isArray(g.serviceIds) ? g.serviceIds.filter(id => typeof id === 'string') : [],
      // 默认收缩，只有明确为 true 时才展开
      _expanded: g._expanded === true,
      color: typeof g.color === 'string' && ['red','orange','yellow','green','blue','purple'].includes(g.color) ? g.color : '',
    }));
  }
  
  // 校验端口清理配置
  if (config.portKiller && typeof config.portKiller === 'object') {
    validated.portKiller = {
      ports: Array.isArray(config.portKiller.ports) 
        ? config.portKiller.ports.map(p => parseInt(p)).filter(p => p > 0 && p <= 65535)
        : [],
    };
  }
  
  // 校验应用设置
  if (config.settings && typeof config.settings === 'object') {
    const validThemes = ['system', 'light', 'dark'];
    validated.settings = {
      autoStart: !!config.settings.autoStart,
      minimizeToTray: !!config.settings.minimizeToTray,
      theme: validThemes.includes(config.settings.theme) ? config.settings.theme : 'system',
    };
  }
  
  return validated;
}

/**
 * 获取配置文件路径
 */
function getConfigPath() {
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'config.json');
}

/**
 * 加载配置（带自动修复）
 * @returns {Object} 校验后的配置对象
 */
function loadConfig() {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      
      // 使用校验函数修复异常配置
      const validatedConfig = validateAndFixConfig(config);
      
      // 重建 servicesMap
      servicesMap = {};
      for (const svc of validatedConfig.services) {
        servicesMap[svc.id] = svc;
      }
      
      // 重建端口映射
      rebuildPortMap();
      
      // 如果配置被修复，保存修复后的版本
      if (JSON.stringify(validatedConfig) !== JSON.stringify(config)) {
        saveConfig(validatedConfig);
      }
      
      return validatedConfig;
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }

  // 配置不存在或解析失败，使用默认配置并保存
  const defaultConfig = getDefaultConfig();
  saveConfig(defaultConfig);
  servicesMap = {};
  return defaultConfig;
}

/**
 * 重建端口到服务的映射关系
 * 用于端口清理时识别受保护的服务端口
 */
function rebuildPortMap() {
  portToServiceMap.clear();
  for (const [id, svc] of Object.entries(servicesMap)) {
    if (svc.port > 0) {
      portToServiceMap.set(svc.port, id);
    }
  }
}

/**
 * 保存配置
 * @param {Object} config - 配置对象（会自动校验）
 * @returns {boolean} 是否保存成功
 */
function saveConfig(config) {
  const configPath = getConfigPath();
  console.log('[saveConfig] called, configPath:', configPath);
  console.log('[saveConfig] input services:', config?.services?.length, 'groups:', config?.groups?.length);
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      console.log('[saveConfig] creating directory:', dir);
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 保存前校验配置
    console.log('[saveConfig] validating config...');
    const validatedConfig = validateAndFixConfig(config);
    console.log('[saveConfig] validated services:', validatedConfig.services.length);
    console.log('[saveConfig] validated groups:', validatedConfig.groups.length);
    console.log('[saveConfig] validated settings:', JSON.stringify(validatedConfig.settings));
    
    fs.writeFileSync(configPath, JSON.stringify(validatedConfig, null, 2), 'utf-8');
    console.log('[saveConfig] file written successfully');

    // 更新内存中的 servicesMap
    servicesMap = {};
    for (const svc of validatedConfig.services) {
      servicesMap[svc.id] = svc;
    }
    console.log('[saveConfig] servicesMap updated with', Object.keys(servicesMap).length, 'services');
    
    // 重建端口映射
    rebuildPortMap();
    console.log('[saveConfig] portMap rebuilt');
    
    return true;
  } catch (e) {
    console.error('[saveConfig] Failed to save config:', e);
    return false;
  }
}

/**
 * 获取当前完整配置（带校验）
 * @returns {Object} 校验后的配置对象
 */
function getConfig() {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return validateAndFixConfig(JSON.parse(raw));
    }
  } catch (e) { /* ignore */ }
  return getDefaultConfig();
}

// ========================
// 端口检测
// ========================

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '127.0.0.1');
  });
}

// ========================
// 单一服务状态管理
// ========================

/**
 * 服务状态枚举
 * @type {Object}
 */
const ServiceStatus = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  FAILED: 'failed',
};

/**
 * 内存中的服务状态记录（单一状态源）
 * 格式: { serviceId: { status: string, pid: number|null, error: string|null, startedAt: number|null } }
 */
const serviceStatusMap = new Map();

/**
 * 获取服务的内存状态
 * @param {string} serviceId - 服务ID
 * @returns {Object} 服务状态对象
 */
function getServiceMemoryStatus(serviceId) {
  if (!serviceStatusMap.has(serviceId)) {
    serviceStatusMap.set(serviceId, {
      status: ServiceStatus.STOPPED,
      pid: null,
      error: null,
      startedAt: null,
    });
  }
  return serviceStatusMap.get(serviceId);
}

/**
 * 更新服务状态
 * @param {string} serviceId - 服务ID
 * @param {Object} updates - 状态更新对象
 */
function updateServiceStatus(serviceId, updates) {
  const status = getServiceMemoryStatus(serviceId);
  Object.assign(status, updates);
  serviceStatusMap.set(serviceId, status);
}

/**
 * 清理服务状态
 * @param {string} serviceId - 服务ID
 */
function clearServiceStatus(serviceId) {
  serviceStatusMap.set(serviceId, {
    status: ServiceStatus.STOPPED,
    pid: null,
    error: null,
    startedAt: null,
  });
}

/**
 * 清理所有服务状态（应用退出时调用）
 */
function clearAllServiceStatus() {
  for (const serviceId of servicesMap.keys()) {
    clearServiceStatus(serviceId);
  }
}

// ========================
// 服务管理
// ========================

/**
 * 启动服务
 * @param {string} serviceId - 服务ID
 * @param {Function} sendLog - 日志回调函数
 * @param {Function} sendStatus - 状态变更回调函数
 * @returns {Object} 启动结果 { success: boolean, error?: string }
 */
function startService(serviceId, sendLog, sendStatus) {
  const config = servicesMap[serviceId];
  if (!config) {
    const error = `[ERROR] 未知服务: ${serviceId}`;
    sendLog(serviceId, error + '\n');
    return { success: false, error: '未知服务' };
  }

  // 检查是否已在运行
  const currentStatus = getServiceMemoryStatus(serviceId);
  if (currentStatus.status === ServiceStatus.RUNNING || currentStatus.status === ServiceStatus.STARTING) {
    const warning = `[WARN] 服务 ${config.label} 已在运行中 (PID: ${currentStatus.pid})`;
    sendLog(serviceId, warning + '\n');
    return { success: false, error: '服务已在运行' };
  }

  const cmdStr = `${config.command} ${config.args.join(' ')}`;
  sendLog(serviceId, `[INFO] 正在启动 ${config.label} ...\n`);
  sendLog(serviceId, `[INFO] 路径: ${config.cwd}\n`);
  sendLog(serviceId, `[INFO] 命令: ${cmdStr}\n`);
  sendLog(serviceId, `[INFO] 端口: ${config.port || '无'}\n`);
  sendLog(serviceId, '\u2500'.repeat(60) + '\n');

  // 更新状态为启动中
  updateServiceStatus(serviceId, { status: ServiceStatus.STARTING, error: null });
  sendStatus(serviceId, ServiceStatus.STARTING);

  // 根据平台获取合适的 spawn 方式和参数
  const spawnInfo = plat.getSpawnOptions(config.command, config.args, {
    cwd: config.cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const child = spawn(spawnInfo.cmd, spawnInfo.args, spawnInfo.options);

  // 记录进程信息
  runningProcesses[serviceId] = child;
  updateServiceStatus(serviceId, { 
    status: ServiceStatus.STARTING, 
    pid: child.pid,
    startedAt: Date.now(),
  });

  // stdout 数据处理
  child.stdout.on('data', (data) => {
    const text = data.toString();
    sendLog(serviceId, text);
    
    // 检测就绪关键词
    if (text.includes('[OK]') && text.includes('已就绪')) {
      updateServiceStatus(serviceId, { status: ServiceStatus.RUNNING });
      sendStatus(serviceId, ServiceStatus.RUNNING);
    }
  });

  // stderr 数据处理
  child.stderr.on('data', (data) => {
    sendLog(serviceId, `[STDERR] ${data.toString()}`);
  });

  // 端口就绪检测（仅在配置了端口时检测）
  let portCheckInterval = null;
  let fallbackTimer = null;
  
  if (config.port && config.port > 0) {
    portCheckInterval = setInterval(async () => {
      // 检查进程是否仍在运行
      if (!runningProcesses[serviceId] || stoppingServices.has(serviceId)) {
        clearInterval(portCheckInterval);
        return;
      }
      
      const occupied = await checkPort(config.port);
      if (occupied) {
        sendLog(serviceId, `[OK] 端口 ${config.port} 已就绪，服务启动成功!\n`);
        updateServiceStatus(serviceId, { status: ServiceStatus.RUNNING });
        sendStatus(serviceId, ServiceStatus.RUNNING);
        clearInterval(portCheckInterval);
      }
    }, 500);

    // 60 秒超时兜底
    fallbackTimer = setTimeout(() => {
      clearInterval(portCheckInterval);
      if (runningProcesses[serviceId]) {
        sendLog(serviceId, `[WARN] 端口检测超时，标记为运行中（服务可能不监听端口）\n`);
        updateServiceStatus(serviceId, { status: ServiceStatus.RUNNING });
        sendStatus(serviceId, ServiceStatus.RUNNING);
      }
    }, 60000);
  } else {
    // 无端口配置的服务，立即标记为运行中
    setTimeout(() => {
      if (runningProcesses[serviceId]) {
        sendLog(serviceId, `[OK] 服务已启动\n`);
        updateServiceStatus(serviceId, { status: ServiceStatus.RUNNING });
        sendStatus(serviceId, ServiceStatus.RUNNING);
      }
    }, 1000);
  }

  // 进程关闭处理
  child.on('close', (code) => {
    sendLog(serviceId, '\u2500'.repeat(60) + '\n');
    sendLog(serviceId, `[INFO] 服务 ${config.label} 已退出 (code: ${code})\n`);
    
    // 清理定时器
    clearInterval(portCheckInterval);
    clearTimeout(fallbackTimer);
    
    // 清理进程记录
    delete runningProcesses[serviceId];
    
    // 判断退出状态
    const wasFailed = currentStatus.error || code !== 0;
    const finalStatus = wasFailed ? ServiceStatus.FAILED : ServiceStatus.STOPPED;
    
    updateServiceStatus(serviceId, { status: finalStatus, pid: null });
    sendStatus(serviceId, finalStatus);
  });

  // 进程错误处理
  child.on('error', (err) => {
    sendLog(serviceId, `[ERROR] 启动失败: ${err.message}\n`);
    
    // 清理定时器
    clearInterval(portCheckInterval);
    clearTimeout(fallbackTimer);
    
    // 清理进程记录
    delete runningProcesses[serviceId];
    
    updateServiceStatus(serviceId, { 
      status: ServiceStatus.FAILED, 
      pid: null, 
      error: err.message 
    });
    sendStatus(serviceId, ServiceStatus.FAILED);
  });
  
  return { success: true };
}

/**
 * 停止服务
 * @param {string} serviceId - 服务ID
 * @param {Function} sendLog - 日志回调函数
 * @param {Function} sendStatus - 状态变更回调函数
 * @returns {Object} 停止结果 { success: boolean, error?: string }
 */
function stopService(serviceId, sendLog, sendStatus) {
  const config = servicesMap[serviceId];
  const child = runningProcesses[serviceId];

  if (!child) {
    // 服务未在运行，直接标记为停止
    clearServiceStatus(serviceId);
    sendStatus(serviceId, ServiceStatus.STOPPED);
    return { success: true };
  }

  // 防御性校验：若 config 不存在（如配置被外部修改），使用 serviceId 作为显示名
  const displayName = config ? config.label : serviceId;
  sendLog(serviceId, `[INFO] 正在停止 ${displayName} (PID: ${child.pid}) ...\n`);
  
  // 更新状态为停止中
  updateServiceStatus(serviceId, { status: ServiceStatus.STOPPING });
  sendStatus(serviceId, ServiceStatus.STOPPING);
  stoppingServices.add(serviceId);

  // 跨平台终止进程树
  plat.killProcessTree(child.pid, (err) => {
    stoppingServices.delete(serviceId);
    
    if (err) {
      sendLog(serviceId, `[WARN] 终止进程输出: ${err.message}\n`);
    } else {
      sendLog(serviceId, `[OK] 进程已终止\n`);
    }
    
    // 确保子进程引用被清理
    try { child.kill('SIGTERM'); } catch (e) { /* 进程可能已退出 */ }
    
    delete runningProcesses[serviceId];
    clearServiceStatus(serviceId);
    sendStatus(serviceId, ServiceStatus.STOPPED);
  });
  
  return { success: true };
}

/**
 * 获取服务状态（混合检查：内存状态 + 端口检测）
 * @param {string} serviceId - 服务ID
 * @returns {Promise<string>} 服务状态字符串
 */
async function getServiceStatus(serviceId) {
  const config = servicesMap[serviceId];
  if (!config) return ServiceStatus.STOPPED;

  // 优先返回内存中的状态
  const memoryStatus = getServiceMemoryStatus(serviceId);
  
  // 如果进程正在运行，检查端口
  if (memoryStatus.status === ServiceStatus.RUNNING || memoryStatus.status === ServiceStatus.STARTING) {
    if (config.port && config.port > 0) {
      const occupied = await checkPort(config.port);
      if (!occupied) {
        // 进程存在但端口未监听，说明正在启动
        return ServiceStatus.STARTING;
      }
    }
    return memoryStatus.status;
  }

  // 进程不在运行，检查端口是否被占用（可能是外部进程）
  if (config.port && config.port > 0) {
    const occupied = await checkPort(config.port);
    if (occupied) {
      // 端口被占用但不是由我们启动的进程
      return ServiceStatus.RUNNING;
    }
  }

  return ServiceStatus.STOPPED;
}

/**
 * 停止所有运行中的服务
 * @param {Function} sendLog - 日志回调函数
 * @param {Function} sendStatus - 状态变更回调函数
 * @returns {Promise<void>}
 */
async function stopAllServices(sendLog, sendStatus) {
  const serviceIds = Object.keys(runningProcesses);
  
  // 批量停止所有服务
  const stopPromises = serviceIds.map(serviceId => {
    return new Promise((resolve) => {
      stopService(serviceId, sendLog, sendStatus);
      // 等待一小段时间确保停止
      setTimeout(resolve, 300);
    });
  });
  
  await Promise.all(stopPromises);
  
  // 清理所有状态
  clearAllServiceStatus();
}

// ========================
// 端口清理（带服务保护）
// ========================

/**
 * 清理端口占用进程
 * 会跳过正在由Carvis管理的服务端口
 * @param {number} port - 端口号
 * @param {Function} sendLog - 日志回调函数
 * @returns {Promise<Object>} 清理结果
 */
function killPort(port, sendLog) {
  return new Promise((resolve) => {
    // 检查是否是受保护的服务端口
    const protectedServiceId = portToServiceMap.get(port);
    if (protectedServiceId) {
      const serviceStatus = getServiceMemoryStatus(protectedServiceId);
      if (serviceStatus.status === ServiceStatus.RUNNING || serviceStatus.status === ServiceStatus.STARTING) {
        sendLog('port-killer', `[WARN] 端口 ${port} 正被服务 "${protectedServiceId}" 使用中，请先停止该服务\n`);
        resolve({ 
          success: false, 
          message: '端口被受保护的服务占用',
          protected: true,
          serviceId: protectedServiceId 
        });
        return;
      }
    }

    sendLog('port-killer', `[INFO] 正在查找占用端口 ${port} 的进程...\n`);

    // 使用跨平台端口检测命令
    const portCheckCmd = plat.getPortCheckCommand(port);
    const portCheckProc = spawn(portCheckCmd.cmd, portCheckCmd.args);

    let stdout = '';
    let stderr = '';

    portCheckProc.stdout.on('data', (data) => { stdout += data.toString(); });
    portCheckProc.stderr.on('data', (data) => { stderr += data.toString(); });

    portCheckProc.on('close', (code) => {
      if (!stdout.trim()) {
        sendLog('port-killer', `[INFO] 端口 ${port} 当前无进程占用\n`);
        resolve({ success: true, message: '端口未被占用' });
        return;
      }

      // 使用跨平台 PID 解析
      const pids = plat.parsePidsFromPortCheck(stdout, port);

      if (pids.length === 0) {
        sendLog('port-killer', `[INFO] 端口 ${port} 未找到需要终止的进程\n`);
        resolve({ success: true, message: '未找到进程' });
        return;
      }

      sendLog('port-killer', `[INFO] 发现 ${pids.length} 个进程: ${pids.join(', ')}\n`);

      let killCount = 0, failCount = 0;
      const total = pids.length;

      for (const pid of pids) {
        // 检查 PID 是否属于运行中的服务
        const servicePid = Object.values(runningProcesses).find(p => p && p.pid === parseInt(pid));
        if (servicePid) {
          sendLog('port-killer', `[WARN] PID ${pid} 属于 Carvis 管理的服务，跳过终止\n`);
          failCount++;
          if (killCount + failCount >= total) {
            sendLog('port-killer', `[OK] 端口 ${port} 清理完成 (终止: ${killCount}, 跳过: ${failCount})\n`);
            resolve({ success: true, killed: killCount, skipped: failCount });
          }
          continue;
        }

        // 使用跨平台终止命令
        const killCmd = plat.getKillPortProcessCommand(pid);
        exec(killCmd.cmd === 'sh' ? `kill -9 ${pid}` : `${killCmd.cmd} ${killCmd.args.join(' ')}`, (killErr) => {
          if (killErr) {
            sendLog('port-killer', `[WARN] 终止 PID ${pid} 失败: ${killErr.message}\n`);
            failCount++;
          } else {
            sendLog('port-killer', `[OK] 已终止 PID ${pid}\n`);
            killCount++;
          }
          if (killCount + failCount >= total) {
            sendLog('port-killer', `[OK] 端口 ${port} 清理完成 (终止: ${killCount}, 失败: ${failCount})\n`);
            resolve({ success: failCount === 0, killed: killCount, failed: failCount });
          }
        });
      }
    });

    portCheckProc.on('error', (err) => {
      sendLog('port-killer', `[ERROR] 端口检测失败: ${err.message}\n`);
      resolve({ success: false, error: err.message });
    });
  });
}

// ========================
// 服务分组管理
// ========================

/**
 * 获取所有分组列表
 * @returns {Array<GroupConfig>} 分组配置列表
 */
function getGroups() {
  const config = getConfig();
  return config.groups || [];
}

/**
 * 创建新的服务分组
 * @param {string} name - 分组名称
 * @returns {Object} 新创建的分组对象
 */
function addGroup(name) {
  const config = getConfig();
  if (!config.groups) config.groups = [];

  const newGroup = {
    id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name || '未命名分组',
    serviceIds: [],
    // 新创建的分组默认收缩
    _expanded: false,
  };

  config.groups.push(newGroup);
  saveConfig(config);
  return newGroup;
}

/**
 * 删除服务分组（不会删除组内的服务，仅解除分组关系）
 * @param {string} groupId - 分组 ID
 * @returns {boolean} 是否删除成功
 */
function removeGroup(groupId) {
  const config = getConfig();
  if (!config.groups) return false;

  const index = config.groups.findIndex(g => g.id === groupId);
  if (index === -1) return false;

  config.groups.splice(index, 1);
  saveConfig(config);
  return true;
}

/**
 * 重命名分组
 * @param {string} groupId - 分组 ID
 * @param {string} newName - 新的分组名称
 * @returns {boolean} 是否重命名成功
 */
function renameGroup(groupId, newName) {
  const config = getConfig();
  if (!config.groups) return false;

  const group = config.groups.find(g => g.id === groupId);
  if (!group) return false;

  group.name = newName;
  saveConfig(config);
  return true;
}

/**
 * 更新分组内的服务 ID 列表
 * @param {string} groupId - 分组 ID
 * @param {string[]} serviceIds - 新的服务 ID 列表
 * @returns {boolean} 是否更新成功
 */
function updateGroupServices(groupId, serviceIds) {
  const config = getConfig();
  if (!config.groups) return false;

  const group = config.groups.find(g => g.id === groupId);
  if (!group) return false;

  // 校验服务ID是否存在
  const validServiceIds = serviceIds.filter(id => servicesMap[id] !== undefined);
  group.serviceIds = validServiceIds;
  saveConfig(config);
  return true;
}

// ========================
// 应用设置管理
// ========================

/**
 * 获取应用设置
 * @returns {object} 设置对象
 */
function getSettings() {
  const config = getConfig();
  return config.settings || { autoStart: false, minimizeToTray: false };
}

/**
 * 保存应用设置
 * @param {object} settings - 要保存的设置对象
 * @returns {boolean} 是否保存成功
 */
function saveSettings(settings) {
  const config = getConfig();
  config.settings = settings;
  return saveConfig(config);
}

// ========================
// 导出给前端的数据格式
// ========================

function getServicesConfig() {
  return Object.values(servicesMap).map(s => ({
    id: s.id,
    name: s.name || s.id,
    label: s.label,
    port: s.port,
    cwd: s.cwd,
    command: `${s.command} ${s.args.join(' ')}`,
  }));
}

function getServiceIds() {
  return Object.keys(servicesMap);
}

// ========================
// 内存清理（防止长时间运行后泄漏）
// ========================

/**
 * 清理过期的进程引用和其他内存垃圾
 * 每隔 5 分钟自动执行一次
 */
let cleanupInterval = null;

/**
 * 执行周期性内存清理
 * - 清理 runningProcesses 中已退出但未被移除的进程引用
 * - 清理 stoppingServices 中残留的 ID
 */
function performCleanup() {
  const now = Date.now();

  // 清理 runningProcesses 中已退出的子进程引用
  for (const [id, child] of Object.entries(runningProcesses)) {
    if (child && typeof child.exitCode === 'number' && child.exitCode !== null) {
      // 子进程已退出，且未被 close 事件清理
      delete runningProcesses[id];
    }
  }

  // 清理 stoppingServices 中运行时间超过 60 秒的残留项
  for (const id of stoppingServices) {
    const status = getServiceMemoryStatus(id);
    if (status.status !== ServiceStatus.STOPPING && status.status !== ServiceStatus.RUNNING) {
      stoppingServices.delete(id);
    }
  }
}

/**
 * 启动周期性内存清理
 * 在应用启动时调用
 */
function startMemoryCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(performCleanup, 5 * 60 * 1000); // 每 5 分钟
  // 不让定时器阻止进程退出
  if (cleanupInterval && cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

/**
 * 停止周期性内存清理
 * 在应用退出时调用
 */
function stopMemoryCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

module.exports = {
  // 配置管理
  loadConfig,
  saveConfig,
  getConfig,
  getDefaultConfig,
  validateAndFixConfig,
  isServiceIdUnique,
  
  // 服务管理
  startService,
  stopService,
  stopAllServices,
  getServiceStatus,
  getServiceMemoryStatus,
  ServiceStatus,
  
  // 端口管理
  killPort,
  checkPort,
  
  // 配置查询
  getServicesConfig,
  getServiceIds,
  
  // 分组管理
  getGroups,
  addGroup,
  removeGroup,
  renameGroup,
  updateGroupServices,
  
  // 应用设置
  getSettings,
  saveSettings,

  // 内存清理
  startMemoryCleanup,
  stopMemoryCleanup,
};
