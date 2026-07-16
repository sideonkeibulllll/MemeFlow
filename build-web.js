// build-web.js
// 生成 web/assets/memes.json 作为非 Android 环境的兜底索引
// 注意: Android 端现在从 Data/meme/ 目录动态读取图片, 不再需要将图片打包进 APK

const fs = require('fs')
const path = require('path')

const assetsPath = path.join(__dirname, 'assets')
const webAssetsPath = path.join(__dirname, 'web', 'assets')

if (!fs.existsSync(webAssetsPath)) {
  fs.mkdirSync(webAssetsPath, { recursive: true })
}

const files = fs.readdirSync(assetsPath).filter(file => {
  const ext = path.extname(file).toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)
})

// 生成带"默认"文件夹前缀的索引
const memes = []
for (var i = 0; i < files.length; i++) {
  memes.push(files[i])
}

fs.writeFileSync(
  path.join(webAssetsPath, 'memes.json'),
  JSON.stringify(memes, null, 2)
)

console.log(`已生成 memes.json (${memes.length} 张表情包, 用于非 Android 环境兜底)`)
console.log('注意: Android 端从 Data/meme/ 目录动态读取图片, 不再打包图片到 APK')
