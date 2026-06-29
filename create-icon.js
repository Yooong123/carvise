/**
 * create-icon.js - 图标生成脚本 (Carvis)
 *
 * 用法: node create-icon.js <源图片路径>
 * 示例: node create-icon.js ./logo.png
 *
 * 生成文件：
 *   build/icon.png       - 256x256 应用图标（跨平台通用）
 *   build/icon.ico       - Windows ICO 图标
 *   build/icon-tray.png  - 16x16 托盘图标（macOS 托盘专用）
 *   build/icon.icns      - macOS ICNS 图标（需要 macOS + iconutil）
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * 生成圆角图标
 * @param {Buffer} sourceBuffer - 源图 Buffer
 * @param {number} canvasSize - 画布尺寸
 * @param {number} padding - 内边距
 * @param {number} cornerRadius - 圆角半径
 * @returns {Promise<Buffer>} 处理后的 PNG Buffer
 */
async function createRoundedIcon(sourceBuffer, canvasSize, padding, cornerRadius) {
  const innerSize = canvasSize - padding * 2;

  // 1. 缩放源图至内部区域
  const resized = await sharp(sourceBuffer)
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // 2. 创建圆角遮罩
  const maskSvg = `<svg width="${innerSize}" height="${innerSize}">
    <rect x="0" y="0" width="${innerSize}" height="${innerSize}" rx="${cornerRadius}" ry="${cornerRadius}" fill="white"/>
  </svg>`;

  const roundedInner = await sharp(resized)
    .composite([{ input: Buffer.from(maskSvg), blend: 'dest-in' }])
    .png()
    .toBuffer();

  // 3. 放置到透明画布
  const canvas = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    }
  })
    .composite([{ input: roundedInner, left: padding, top: padding }])
    .png()
    .toBuffer();

  return canvas;
}

async function createIcon() {
  const srcPath = process.argv[2];
  if (!srcPath) {
    console.error('用法: node create-icon.js <源图片路径>');
    console.error('示例: node create-icon.js ./logo.png');
    process.exit(1);
  }

  if (!fs.existsSync(srcPath)) {
    console.error(`错误: 源图片文件不存在: ${srcPath}`);
    process.exit(1);
  }

  const buildDir = path.join(__dirname, 'build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  // 读取源图
  const sourceBuffer = fs.readFileSync(srcPath);
  const meta = await sharp(sourceBuffer).metadata();
  console.log('Source image:', meta.width, 'x', meta.height);

  // ========================
  // 1. 生成 256x256 应用图标 (icon.png)
  // ========================
  const appIconBuffer = await createRoundedIcon(sourceBuffer, 256, 12, 60);
  fs.writeFileSync(path.join(buildDir, 'icon.png'), appIconBuffer);
  console.log('Created icon.png: 256x256 with rounded corners');

  // ========================
  // 2. 生成 Windows ICO (icon.ico)
  // ========================
  try {
    const pngToIco = require('png-to-ico').default;
    const icoBuf = await pngToIco(path.join(buildDir, 'icon.png'));
    fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuf);
    console.log('Created icon.ico, size:', icoBuf.length, 'bytes');
  } catch (e) {
    console.warn('Warning: Failed to create icon.ico:', e.message);
  }

  // ========================
  // 3. 生成 macOS 托盘图标 (icon-tray.png) — 16x16
  // ========================
  const trayIconBuffer = await sharp(sourceBuffer)
    .resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(buildDir, 'icon-tray.png'), trayIconBuffer);
  console.log('Created icon-tray.png: 16x16 (macOS tray icon)');

  // ========================
  // 4. 尝试生成 macOS ICNS (icon.icns)
  //    需要 macOS 系统 + iconutil 命令行工具
  // ========================
  const isMac = process.platform === 'darwin';
  if (isMac) {
    try {
      const { execSync } = require('child_process');
      const iconSetDir = path.join(buildDir, 'Carvis.iconset');
      if (!fs.existsSync(iconSetDir)) {
        fs.mkdirSync(iconSetDir, { recursive: true });
      }

      // 生成不同尺寸的 PNG 素材
      const sizes = [16, 32, 64, 128, 256, 512, 1024];
      for (const size of sizes) {
        const iconBuf = await createRoundedIcon(sourceBuffer, size, Math.max(2, Math.round(size * 0.05)), Math.max(8, Math.round(size * 0.23)));
        // 标准分辨率
        fs.writeFileSync(path.join(iconSetDir, `icon_${size}x${size}.png`), iconBuf);
        // 视网膜（2x）分辨率
        if (size * 2 <= 1024) {
          const iconBuf2x = await createRoundedIcon(sourceBuffer, size * 2, Math.max(4, Math.round(size * 0.05 * 2)), Math.max(16, Math.round(size * 0.23 * 2)));
          fs.writeFileSync(path.join(iconSetDir, `icon_${size}x${size}@2x.png`), iconBuf2x);
        }
        console.log(`  Generated ${size}x${size} icon`);
      }

      // 使用 iconutil 生成 .icns
      execSync(`iconutil -c icns "${iconSetDir}" -o "${path.join(buildDir, 'icon.icns')}"`, { stdio: 'pipe' });
      console.log('Created icon.icns via iconutil');

      // 清理临时目录
      fs.rmSync(iconSetDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Warning: Failed to create .icns (not on macOS or iconutil not available):', e.message);
      console.log('  electron-builder will auto-generate .icns from icon.png on macOS build');
    }
  } else {
    console.log('Skipped .icns generation (not on macOS). electron-builder will auto-generate .icns from icon.png on macOS build');
  }

  console.log('\nAll icons generated successfully!');
}

createIcon().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
