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

fs.writeFileSync(
  path.join(webAssetsPath, 'memes.json'),
  JSON.stringify(files, null, 2)
)

files.forEach(file => {
  fs.copyFileSync(
    path.join(assetsPath, file),
    path.join(webAssetsPath, file)
  )
})

console.log(`已处理 ${files.length} 张表情包`)
