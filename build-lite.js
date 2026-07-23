// build-lite.js
// 构建无内置图片的 Lite APK，并将其嵌入 Full APK 的 assets/lite/ 目录
// 用法: node build-lite.js

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = __dirname
const ANDROID_ASSETS = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'public', 'assets')
const BUILD_GRADLE = path.join(ROOT, 'android', 'app', 'build.gradle')
const LITE_APK_SRC = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
const LITE_APK_DST_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'lite')
const LITE_APK_DST = path.join(LITE_APK_DST_DIR, 'app-lite.apk')
const TEMP_DIR = path.join(ROOT, 'build', 'lite-temp')
const TEMP_IMAGES = path.join(TEMP_DIR, 'images')

function log(msg) {
  console.log('[build-lite] ' + msg)
}

function restore() {
  // 恢复图片
  if (fs.existsSync(TEMP_IMAGES)) {
    const imageFiles = fs.readdirSync(TEMP_IMAGES)
    for (const f of imageFiles) {
      const src = path.join(TEMP_IMAGES, f)
      const dst = path.join(ANDROID_ASSETS, f)
      if (!fs.existsSync(dst)) {
        fs.renameSync(src, dst)
      }
    }
    log('已恢复 ' + imageFiles.length + ' 张图片')
  }

  // 恢复 app-lite.apk (在步骤 1.5 移走的)
  const liteApkBak = path.join(TEMP_DIR, 'app-lite.apk.bak')
  if (fs.existsSync(liteApkBak)) {
    // 如果新 Lite APK 已复制到目标位置, 则删除备份 (避免覆盖新版本)
    // 否则恢复旧版本
    if (!fs.existsSync(LITE_APK_DST)) {
      fs.renameSync(liteApkBak, LITE_APK_DST)
      log('已恢复旧 app-lite.apk')
    } else {
      fs.unlinkSync(liteApkBak)
      log('已使用新 app-lite.apk, 删除旧备份')
    }
  }

  // 恢复 build.gradle
  const bakFile = path.join(TEMP_DIR, 'build.gradle.bak')
  if (fs.existsSync(bakFile)) {
    fs.writeFileSync(BUILD_GRADLE, fs.readFileSync(bakFile, 'utf-8'))
    log('build.gradle 已恢复')
  }
}

// 确保在异常时也能恢复
process.on('exit', () => {
  try { restore() } catch (e) {}
})
process.on('uncaughtException', (err) => {
  log('发生异常: ' + err.message)
  restore()
  process.exit(1)
})

log('=== 开始构建 Lite APK ===')

// 确保临时目录存在
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}
if (!fs.existsSync(TEMP_IMAGES)) {
  fs.mkdirSync(TEMP_IMAGES, { recursive: true })
}

// 步骤 1: 备份图片（从 android assets 移到临时目录）
log('步骤 1: 备份图片...')
const imageFiles = fs.readdirSync(ANDROID_ASSETS).filter(f => {
  const ext = path.extname(f).toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)
})
let movedCount = 0
for (const f of imageFiles) {
  const src = path.join(ANDROID_ASSETS, f)
  const dst = path.join(TEMP_IMAGES, f)
  fs.renameSync(src, dst)
  movedCount++
}
log('已备份 ' + movedCount + ' 张图片')

// 步骤 1.5: 临时移走旧的 app-lite.apk, 避免 Lite APK 套娃自己
// (构建 Full APK 时才需要嵌入 Lite APK; 构建 Lite APK 时不应包含它)
let movedLiteApk = false
if (fs.existsSync(LITE_APK_DST)) {
  const liteApkBak = path.join(TEMP_DIR, 'app-lite.apk.bak')
  fs.renameSync(LITE_APK_DST, liteApkBak)
  movedLiteApk = true
  log('已临时移走旧的 app-lite.apk (防止套娃)')
}

// 步骤 2: 备份并修改 build.gradle (versionCode)
log('步骤 2: 设置 versionCode...')
const gradleContent = fs.readFileSync(BUILD_GRADLE, 'utf-8')
fs.writeFileSync(path.join(TEMP_DIR, 'build.gradle.bak'), gradleContent)
const newGradle = gradleContent.replace(/versionCode \d+/, 'versionCode 20000')
fs.writeFileSync(BUILD_GRADLE, newGradle)
log('versionCode 已设置为 20000')

// 步骤 3: 构建 Lite APK
log('步骤 3: 构建 Lite APK (gradlew assembleDebug)...')
execSync('.\\gradlew.bat assembleDebug', {
  cwd: path.join(ROOT, 'android'),
  stdio: 'inherit',
  shell: true
})
log('Lite APK 构建成功')

// 步骤 4: 复制 Lite APK 到 android assets
log('步骤 4: 复制 Lite APK 到 assets/lite/...')
if (!fs.existsSync(LITE_APK_DST_DIR)) {
  fs.mkdirSync(LITE_APK_DST_DIR, { recursive: true })
}
fs.copyFileSync(LITE_APK_SRC, LITE_APK_DST)
log('Lite APK 已复制到: ' + LITE_APK_DST)

// 步骤 5: 恢复图片
log('步骤 5: 恢复图片...')
restore()

// 步骤 6: 清理临时文件
log('步骤 6: 清理临时目录...')
try {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true })
} catch (e) {}

log('=== Lite APK 构建完成 ===')
log('Lite APK 位置: ' + LITE_APK_DST)
log('现在可以运行 npm run build:android 构建包含 Lite APK 的 Full APK')