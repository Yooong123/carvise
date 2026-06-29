/**
 * check-build-env.js - 构建环境预检脚本 (Carvis)
 *
 * 职责：
 * - 在 macOS 上构建 Windows 安装包前，检查 Wine 是否可用
 * - 检测当前平台和目标平台是否匹配
 * - 给出明确的错误提示和安装指引
 *
 * 用法：
 *   node scripts/check-build-env.js --win   # 构建 Windows 安装包前检查
 *   node scripts/check-build-env.js --mac   # 构建 macOS 安装包前检查
 *   node scripts/check-build-env.js --all   # 构建所有平台前检查
 */

const { execSync } = require('child_process');
const os = require('os');

/**
 * 获取当前操作系统平台名称（中文）
 * @returns {string} 平台名称
 */
function getCurrentPlatformName() {
  const platform = os.platform();
  const map = {
    darwin: 'macOS',
    win32: 'Windows',
    linux: 'Linux',
  };
  return map[platform] || platform;
}

/**
 * 获取当前操作系统架构
 * @returns {string} 架构名称
 */
function getCurrentArch() {
  const arch = os.arch();
  const map = {
    x64: 'x86_64 (Intel)',
    arm64: 'ARM64 (Apple Silicon)',
  };
  return map[arch] || arch;
}

/**
 * 检测 Wine 是否已安装
 * @returns {{ installed: boolean, version: string|null, path: string|null }}
 */
function checkWine() {
  try {
    const version = execSync('wine --version', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();
    // 获取 Wine 的安装路径
    let winePath = null;
    try {
      winePath = execSync('which wine', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      }).trim();
    } catch (_) {
      // which 命令可能失败，但不影响结果
    }
    return { installed: true, version, path: winePath };
  } catch (_) {
    return { installed: false, version: null, path: null };
  }
}

/**
 * 检测 electron-builder 的 Wine 内建版本
 * electron-builder 会下载自带的 Wine 到缓存目录
 * @returns {{ exists: boolean, path: string|null }}
 */
function checkElectronBuilderWine() {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');

  // electron-builder 的 Wine 缓存路径
  const homeDir = os.homedir();
  const possiblePaths = [
    // electron-builder v24+ 缓存路径
    path.join(homeDir, 'Library', 'Caches', 'electron-builder', 'wine'),
    // 旧版本缓存路径
    path.join(homeDir, '.cache', 'electron-builder', 'wine'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const items = fs.readdirSync(p);
        // 查找 Wine 安装目录
        const wineDirs = items.filter(item => {
          const itemPath = path.join(p, item);
          return fs.statSync(itemPath).isDirectory();
        });
        if (wineDirs.length > 0) {
          // 找到最新的 Wine 版本
          wineDirs.sort().reverse();
          const wineBin = path.join(p, wineDirs[0], 'bin', 'wine');
          if (fs.existsSync(wineBin)) {
            return { exists: true, path: wineBin };
          }
          return { exists: true, path: path.join(p, wineDirs[0]) };
        }
      } catch (_) {
        // 忽略读取错误
      }
      return { exists: true, path: p };
    }
  }

  return { exists: false, path: null };
}

/**
 * 检查 Apple Silicon Mac 上的 Wine 兼容性
 * @returns {{ compatible: boolean, warning: string|null }}
 */
function checkAppleSiliconCompatibility() {
  const arch = os.arch();
  const platform = os.platform();

  if (platform === 'darwin' && arch === 'arm64') {
    // Apple Silicon Mac：Wine 需要通过 Rosetta 2 运行
    try {
      // 检查 Rosetta 2 是否已安装（通过检测 oahd 进程或尝试运行 Intel 二进制）
      execSync('arch -x86_64 /usr/bin/true 2>/dev/null', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      });
      return {
        compatible: true,
        warning: '当前为 Apple Silicon Mac，构建 Windows 安装包需要 Wine 且需通过 Rosetta 2 运行。'
          + ' 如遇到问题，请确保 Rosetta 2 已安装: softwareupdate --install-rosetta',
      };
    } catch (_) {
      return {
        compatible: false,
        warning: '⚠ Rosetta 2 未正确安装或不可用。Apple Silicon Mac 上构建 Windows 安装包'
          + ' 需要 Rosetta 2 来运行 x86_64 版本的 Wine。'
          + ' 请运行: softwareupdate --install-rosetta',
      };
    }
  }

  return { compatible: true, warning: null };
}

/**
 * 主检测流程
 * @param {string} target - 目标平台: 'win' | 'mac' | 'all'
 */
function main(target) {
  const platform = os.platform();
  const platformName = getCurrentPlatformName();
  const arch = getCurrentArch();

  console.log('='.repeat(60));
  console.log('  Carvis 构建环境预检');
  console.log('='.repeat(60));
  console.log(`  当前平台: ${platformName}`);
  console.log(`  系统架构: ${arch}`);
  console.log(`  构建目标: ${target === 'win' ? 'Windows (exe)'
    : target === 'mac' ? 'macOS (dmg/zip)'
    : 'Windows + macOS'}`);
  console.log('-'.repeat(60));

  let hasError = false;

  // ========================
  // 检查1：macOS 上构建 Windows 包时需要 Wine
  // ========================
  if (platform === 'darwin' && (target === 'win' || target === 'all')) {
    console.log('\n  📦 检测 Wine (macOS 构建 Windows 安装包所需)...');

    // 检查系统 Wine
    const wineResult = checkWine();
    if (wineResult.installed) {
      console.log(`  ✅ 系统 Wine 已安装`);
      console.log(`     版本: ${wineResult.version}`);
      console.log(`     路径: ${wineResult.path}`);
    } else {
      // 检查 electron-builder 内建 Wine
      const ebWineResult = checkElectronBuilderWine();
      if (ebWineResult.exists) {
        console.log(`  ✅ electron-builder 内建 Wine 已缓存`);
        console.log(`     路径: ${ebWineResult.path}`);
      } else {
        console.log('  ⚠  Wine 未安装');
        console.log('');
        console.log('  在 macOS 上构建 Windows 安装包需要 Wine。');
        console.log('  electron-builder 会自动下载 Wine，但在 Apple Silicon Mac 上可能需要手动安装。');
        console.log('');
        console.log('  推荐安装方式:');
        console.log('    1. 使用 Homebrew 安装:');
        console.log('       brew install --cask wine-stable');
        console.log('');
        console.log('    2. 或者安装 Game Porting Toolkit (Apple Silicon 推荐):');
        console.log('       brew install --cask wine-crossover');
        console.log('');
        console.log('    3. 也可以直接构建，electron-builder 会自动下载 Wine:');
        console.log('       npm run electron:build:win');
        console.log('');
        console.log('  💡 如果自动下载的 Wine 不可用，建议在 Windows 虚拟机或 CI 上构建。');
        // 不阻塞构建，但给出警告
      }
    }

    // 检查 Apple Silicon 兼容性
    const compatResult = checkAppleSiliconCompatibility();
    if (compatResult.warning) {
      console.log(`\n  ⚠  Apple Silicon 兼容性提示:`);
      console.log(`      ${compatResult.warning}`);
    }
  }

  // ========================
  // 检查2：macOS 上构建 macOS 包时，提示 Gatekeeper / 签名问题
  // ========================
  if (platform === 'darwin' && (target === 'mac' || target === 'all')) {
    // 检查是否有有效的 Apple 签名证书
    let hasSignCert = false;
    try {
      const result = execSync('security find-identity -v -p basic 2>/dev/null | grep "Developer ID Application"', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10000,
      });
      hasSignCert = result.trim().length > 0;
    } catch (_) {
      hasSignCert = false;
    }

    if (!hasSignCert) {
      console.log('\n  ⚠  未检测到 Apple Developer ID 签名证书。');
      console.log('  构建的 .app 在分发时可能被 macOS Gatekeeper 拦截。');
      console.log('');
      console.log('  如果打开应用时提示"已损坏，无法打开"，原因是：');
      console.log('    electron-builder 默认启用了 hardenedRuntime，');
      console.log('    但应用没有有效的 Apple 签名证书，导致 Gatekeeper 误判。');
      console.log('');
      console.log('  解决方案（按推荐顺序）:');
      console.log('    方案 A: 构建时已配置 hardenedRuntime=false 和 identity=null');
      console.log('           可从根本上避免此问题（已配置在当前项目中）');
      console.log('');
      console.log('    方案 B: 如果仍遇到提示，在终端运行以下命令移除隔离属性:');
      console.log('      xattr -cr /Applications/Carvis.app');
      console.log('');
      console.log('    方案 C: 申请 Apple Developer ID 证书并配置签名:');
      console.log('      https://developer.apple.com/developer-id');
    }
  }

  // ========================
  // 检查3：Windows 上构建 macOS 包时的特殊检查
  // ========================
  if (platform === 'win32' && target === 'mac') {
    console.log('\n  ⚠  在 Windows 上构建 macOS 安装包需要额外配置。');
    console.log('  建议直接在 macOS 上构建，或使用 CI/CD (如 GitHub Actions)。');
    hasError = true;
  }

  console.log('-'.repeat(60));

  if (hasError) {
    console.log('\n  ❌ 环境预检未通过，请解决上述问题后重试。\n');
    process.exit(1);
  } else {
    console.log('\n  ✅ 环境预检通过，可以开始构建。\n');
    process.exit(0);
  }
}

// 解析命令行参数
const args = process.argv.slice(2);
const targetArg = args.find(a => a.startsWith('--'));
const target = targetArg ? targetArg.replace('--', '') : 'all';

if (!['win', 'mac', 'all'].includes(target)) {
  console.error(`错误: 未知的目标平台 "${target}"，请使用 --win、--mac 或 --all`);
  process.exit(1);
}

main(target);
