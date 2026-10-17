// merge_emoji.js
// 把 Emoji/ 工作区的图并入 assets/，按 md5 去重，然后重生成 web/assets/memes.json
//
// 用法:
//   node merge_emoji.js --dry    只看统计，不动文件
//   node merge_emoji.js          硬链接（推荐：不占额外空间，Emoji 保持完整）
//   node merge_emoji.js --copy   强制复制（跨盘或硬链接失败时用）
//
// 为什么用硬链接:
//   assets/ 和 Emoji/ 在同一分区时，fs.linkSync 只是新建一个目录项，
//   不复制数据。Emoji 里的原文件保持不变（溯源、labels.json 全部有效），
//   assets 里同时能读到。删掉任一边都不影响另一边。
//
// 命名策略:
//   保持 Emoji 原名 01_0d3ebf5a.jpg。这样 labels.json 的 file 字段、
//   persona.json 的 key、App 里的文件名三者完全一致，不依赖 hash 兜底匹配。

const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const EMOJI = path.join(ROOT, 'Emoji')
const ASSETS = path.join(ROOT, 'assets')
const INDEX_CSV = path.join(EMOJI, 'INDEX.csv')
const MEMES_JSON = path.join(ROOT, 'web', 'assets', 'memes.json')

const DRY = process.argv.includes('--dry')
const FORCE_COPY = process.argv.includes('--copy')

const EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

function isImage(name) {
  return EXTS.includes(path.extname(name).toLowerCase())
}

// 从文件名提取 32 位 md5（assets 里的命名可能是纯 md5 或 md5_720）
function md5OfName(name) {
  const base = name.replace(/\.[^.]+$/, '')
  const m = base.match(/^([0-9a-f]{32})/i)
  return m ? m[1].toLowerCase() : null
}

// 读 INDEX.csv: part/file -> md5
function readIndexCsv() {
  const raw = fs.readFileSync(INDEX_CSV, 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).slice(1)
  const map = new Map()

  for (const line of lines) {
    if (!line.trim()) continue
    const c = line.split(',')
    const part = (c[0] || '').trim()
    const file = (c[2] || '').trim()
    const md5 = (c[3] || '').trim().toLowerCase()
    if (part && file && md5.length === 32) {
      map.set(part + '/' + file, md5)
    }
  }
  return map
}

function main() {
  console.log('')
  console.log('=== Emoji -> assets 合并 ===')

  if (!fs.existsSync(INDEX_CSV)) {
    console.error('找不到 INDEX.csv')
    process.exit(1)
  }

  const fileToMd5 = readIndexCsv()
  console.log('INDEX.csv 记录   :', fileToMd5.size)

  // 现有 assets 的 md5 集合
  const existingMd5 = new Set()
  let beforeCount = 0
  for (const f of fs.readdirSync(ASSETS)) {
    if (!isImage(f)) continue
    beforeCount++
    const m = md5OfName(f)
    if (m) existingMd5.add(m)
  }
  console.log('assets 现有图    :', beforeCount)

  // 遍历分区
  const parts = fs
    .readdirSync(EMOJI)
    .filter((n) => /^part[A-Z]\d+$/.test(n) && fs.statSync(path.join(EMOJI, n)).isDirectory())
  console.log('Emoji 分区数     :', parts.length)

  let scanned = 0
  let dupByMd5 = 0
  let linked = 0
  let copied = 0
  let skippedNoMd5 = 0
  const failed = []

  for (const part of parts) {
    const dir = path.join(EMOJI, part)
    const files = fs.readdirSync(dir).filter(isImage)

    for (const file of files) {
      scanned++
      const src = path.join(dir, file)
      const md5 = fileToMd5.get(part + '/' + file)

      if (!md5) {
        skippedNoMd5++
        continue
      }

      // 内容已存在（不论叫什么名字）
      if (existingMd5.has(md5)) {
        dupByMd5++
        continue
      }

      const dst = path.join(ASSETS, file)

      if (DRY) {
        existingMd5.add(md5)
        linked++
        continue
      }

      if (fs.existsSync(dst)) {
        // 上次已经链接过（脚本重跑），当作已存在，不算失败
        existingMd5.add(md5)
        dupByMd5++
        continue
      }

      try {
        fs.linkSync(src, dst)
        existingMd5.add(md5)
        linked++
      } catch (e) {
        if (FORCE_COPY || e.code === 'EXDEV' || e.code === 'EPERM') {
          try {
            fs.copyFileSync(src, dst)
            existingMd5.add(md5)
            copied++
          } catch (e2) {
            failed.push(file + ' (复制失败: ' + e2.message + ')')
          }
        } else {
          failed.push(file + ' (' + e.code + ')')
        }
      }
    }
  }

  console.log('扫描图片         :', scanned)
  console.log('md5 重复跳过     :', dupByMd5)
  console.log('无 md5 记录跳过  :', skippedNoMd5)
  console.log((DRY ? '[dry] 待新增    : ' : '硬链接新增      : '), linked)
  if (copied) console.log('复制新增         :', copied)
  console.log('失败             :', failed.length)
  if (failed.length) console.log('  前 5 条:', failed.slice(0, 5).join(' | '))

  // 重新生成 memes.json
  const finalFiles = fs.readdirSync(ASSETS).filter(isImage).sort()
  console.log('assets 最终图数  :', finalFiles.length)

  if (DRY) {
    console.log('')
    console.log('[dry] 未写入任何文件')
    return
  }

  fs.mkdirSync(path.dirname(MEMES_JSON), { recursive: true })
  fs.writeFileSync(MEMES_JSON, JSON.stringify(finalFiles, null, 2))
  console.log('已更新           : web/assets/memes.json')

  // 同步到 web/assets —— 这里是 Capacitor 的打包源，APK 里的图从这里来
  const WEB_ASSETS = path.join(ROOT, 'web', 'assets')
  fs.mkdirSync(WEB_ASSETS, { recursive: true })
  let webLinked = 0
  let webFailed = 0
  for (const f of finalFiles) {
    const dst = path.join(WEB_ASSETS, f)
    if (fs.existsSync(dst)) continue
    try {
      fs.linkSync(path.join(ASSETS, f), dst)
      webLinked++
    } catch (e) {
      try {
        fs.copyFileSync(path.join(ASSETS, f), dst)
        webLinked++
      } catch (e2) {
        webFailed++
      }
    }
  }
  console.log('web/assets 补齐  :', webLinked, webFailed ? '(失败 ' + webFailed + ')' : '')

  const totalBytes = finalFiles.reduce((s, f) => {
    try {
      return s + fs.statSync(path.join(ASSETS, f)).size
    } catch (e) {
      return s
    }
  }, 0)
  console.log('assets 总体积    :', Math.round(totalBytes / 1024 / 1024), 'MB')
  console.log('')
}

main()
