/**
 * platform.js - 平台差异集中管理模块 (Carvis)
 *
 * 职责：
 * - 提供统一的平台检测接口
 * - 封装跨平台的进程启动/停止/端口检测命令
 * - 所有平台相关的分支逻辑集中于此，其他模块通过本模块获取平台能力
 *
 * 使用方式：
 *   const plat = require('./platform');
 *   if (plat.isMac) { ... }
 *
 * 支持的平台：
 * - win32：Windows（保留原有 cmd.exe / taskkill / netstat 逻辑）
 * - darwin：macOS（使用 sh -c / kill -9 / lsof）
 * - linux：Linux（与 macOS 类似，使用 POSIX 标准命令）
 */

const os = require('os');
const { spawn } = require('child_process');
const { exec } = require('child_process');

// ========================
// 平台类型常量
// ========================

const PLATFORM = Object.freeze({
  WINDOWS: 'win32',
  MAC: 'darwin',
  LINUX: 'linux',
});

// ========================
// 平台检测
// ========================

/** 当前运行平台 */
const platform = os.platform();

/** 是否为 Windows */
const isWindows = platform === PLATFORM.WINDOWS;
/** 是否为 macOS */
const isMac = platform === PLATFORM.MAC;
/** 是否为 Linux */
const isLinux = platform === PLATFORM.LINUX;
/** 是否为 POSIX 系（macOS / Linux） */
const isPosix = isMac || isLinux;

// ========================
// 进程启动
// ========================

/**
 * 获取启动子进程的 spawn 选项
 * Windows 使用 cmd.exe /c，POSIX 系统直接 spawn 命令本身
 *
 * @param {string} command - 要执行的命令
 * @param {string[]} args - 命令参数
 * @param {Object} [options={}] - 额外的 spawn 选项
 * @returns {{ cmd: string, args: string[], options: Object }}
 */
function getSpawnOptions(command, args, options = {}) {
  if (isWindows) {
    return {
      cmd: 'cmd.exe',
      args: ['/c', command, ...args],
      options: {
        ...options,
        windowsHide: false,
      },
    };
  }

  // POSIX (macOS / Linux)：直接 spawn 命令本身
  return {
    cmd: command,
    args: args,
    options: {
      ...options,
      // windowsHide 在 POSIX 上无效，移除
    },
  };
}

// ========================
// 进程停止
// ========================

/**
 * 强制终止进程及子进程
 *
 * @param {number} pid - 进程 ID
 * @param {Function} callback - 回调函数 (err?)
 */
function killProcessTree(pid, callback) {
  if (isWindows) {
    // Windows：使用 taskkill 递归终止进程树
    exec(`taskkill /T /F /PID ${pid}`, callback);
  } else {
    // POSIX (macOS / Linux)：
    // 1. 先尝试发送 SIGTERM 优雅终止
    // 2. 发送 SIGKILL 强制终止进程组
    try {
      // 先终止进程本身
      process.kill(pid, 'SIGTERM');
      // 延迟后强制终止
      setTimeout(() => {
        try {
          // 尝试终止进程组（负 PID 表示进程组）
          process.kill(-pid, 'SIGKILL');
        } catch (_) {
          // 进程组可能不存在
        }
        try {
          process.kill(pid, 'SIGKILL');
        } catch (_) {
          // 进程可能已退出
        }
        callback(null);
      }, 500);
    } catch (err) {
      // 如果进程已不存在，也算成功
      if (err.code === 'ESRCH') {
        callback(null);
      } else {
        // 尝试用 kill 命令
        exec(`kill -9 ${pid} 2>/dev/null; kill -9 -$(ps -o pgid= -p ${pid} 2>/dev/null) 2>/dev/null`, (killErr) => {
          callback(killErr);
        });
      }
    }
  }
}

/**
 * 发送优雅终止信号（SIGTERM）
 *
 * @param {number} pid - 进程 ID
 */
function killProcessGracefully(pid) {
  try {
    if (isWindows) {
      // Windows 不支持 SIGTERM，用 process.kill 发送退出信号
      process.kill(pid, 'SIGTERM');
    } else {
      // POSIX：发送 SIGTERM 优雅终止
      process.kill(pid, 'SIGTERM');
    }
  } catch (_) {
    // 进程可能已退出
  }
}

// ========================
// 端口检测
// ========================

/**
 * 获取检测端口占用的 shell 命令
 *
 * @param {number} port - 端口号
 * @returns {{ cmd: string, args: string[] }}
 */
function getPortCheckCommand(port) {
  if (isWindows) {
    return {
      cmd: 'cmd.exe',
      args: ['/c', `netstat -ano | findstr :${port}`],
    };
  }

  // macOS / Linux：使用 lsof
  return {
    cmd: 'sh',
    args: ['-c', `lsof -i :${port} -P -n 2>/dev/null || ss -tlnp sport = :${port} 2>/dev/null`],
  };
}

/**
 * 从端口检测命令的输出中解析 PID 列表
 *
 * @param {string} stdout - 命令输出的内容
 * @param {number} port - 端口号
 * @returns {string[]} PID 列表
 */
function parsePidsFromPortCheck(stdout, port) {
  if (!stdout || !stdout.trim()) return [];

  const pids = new Set();

  if (isWindows) {
    // Windows netstat 输出格式：
    //   TCP    0.0.0.0:3000   0.0.0.0:0   LISTENING    1234
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      if (line.includes('LISTENING') || line.includes('ESTABLISHED')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid) && pid !== '0') {
          pids.add(pid);
        }
      }
    }
    // 如果没有找到 LISTENING/ESTABLISHED，尝试取所有行的最后一个字段
    if (pids.size === 0) {
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid) && pid !== '0') pids.add(pid);
      }
    }
  } else {
    // macOS lsof 输出格式：
    //   COMMAND PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
    //   node    1234 user   3u  IPv4 0x...      0t0  TCP *:3000 (LISTEN)
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      // 跳过标题行
      if (line.startsWith('COMMAND')) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const pid = parts[1];
        if (pid && !isNaN(pid) && pid !== '0') {
          pids.add(pid);
        }
      }
    }
  }

  return [...pids];
}

/**
 * 构建终止指定 PID 的 shell 命令
 *
 * @param {string} pid - 进程 ID
 * @returns {{ cmd: string, args: string[] }}
 */
function getKillPortProcessCommand(pid) {
  if (isWindows) {
    return {
      cmd: 'cmd.exe',
      args: ['/c', `taskkill /F /PID ${pid}`],
    };
  }

  // macOS / Linux：使用 kill -9
  return {
    cmd: 'sh',
    args: ['-c', `kill -9 ${pid} 2>/dev/null`],
  };
}

// ========================
// 路径和资源
// ========================

/**
 * 获取应用图标路径（相对于 app 根目录）
 *
 * @param {string} buildDir - build 目录的绝对路径
 * @returns {string} 图标文件的绝对路径
 */
function getAppIconPath(buildDir) {
  const path = require('path');
  if (isMac) {
    // macOS 使用 PNG 格式图标
    return path.join(buildDir, 'icon.png');
  }
  // Windows 使用 ICO 格式图标
  return path.join(buildDir, 'icon.ico');
}

/**
 * 获取托盘图标路径（相对于 app 根目录）
 *
 * @param {string} buildDir - build 目录的绝对路径
 * @returns {string} 托盘图标文件的绝对路径
 */
function getTrayIconPath(buildDir) {
  const path = require('path');
  if (isMac) {
    // macOS 托盘图标建议使用 16x16 或 22x22 的 PNG
    return path.join(buildDir, 'icon-tray.png');
  }
  // Windows 托盘使用 ICO 格式
  return path.join(buildDir, 'icon.ico');
}

// ========================
// 导出
// ========================

module.exports = {
  // 平台类型
  PLATFORM,
  platform,

  // 平台检测
  isWindows,
  isMac,
  isLinux,
  isPosix,

  // 进程启动
  getSpawnOptions,

  // 进程停止
  killProcessTree,
  killProcessGracefully,

  // 端口检测
  getPortCheckCommand,
  parsePidsFromPortCheck,
  getKillPortProcessCommand,

  // 路径和资源
  getAppIconPath,
  getTrayIconPath,
};
