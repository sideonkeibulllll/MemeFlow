// absorb_to_emoji.js
// 把 assets/ 里有、但 Emoji/ 里没有的图，补进新的 partF 分区
// 目的：让 Emoji/ 成为唯一图片源，skill 的 AI 只看一个地方就够了
//
// 用法:
//   node absorb_to_emoji.js --dry   只看差集
//   node absorb_to_emoji.js         执行（新建 partF 分区 + 生成 _meta.json / labels.json + 追加台账）

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = __dirname
const EMOJI = path.join(ROOT, 'Emoji')
const ASSETS = path.join(ROOT, 'assets')
const INDEX_CSV = path.join(EMOJI, 'INDEX.csv')
const BATCHES_MD = path.join(EMOJI, 'BATCHES.md')

const DRY = process.argv.includes('--dry')
const PER_PART = 30
const BATCH = '2026-10-18'
const SOURCE = '旧assets'

const EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const isImage = (n) => EXTS.includes(path.extname(n).toLowerCase())

function md5OfName(name) {
  const base = name.replace(/\.[^.]+$/, '')
  const m = base.match(/^([0-9a-f]{32})/i)
  return m ? m[1].toLowerCase() : null
}

// 只读文件头判断尺寸，不加载整图
function imageSize(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue }
      const marker = buf[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
      }
      i += 2 + buf.readUInt16BE(i + 2)
    }
  }
  return { w: 0, h: 0 }
}

function readCsv() {
  const raw = fs.readFileSync(INDEX_CSV, 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/)
  const header = lines[0]
  const rows = lines.slice(1).filter((l) => l.trim())
  return { header, rows }
}

function main() {
  console.log('')
  console.log('=== 补齐 Emoji 图片源 ===')

  const parts = fs
    .readdirSync(EMOJI)
    .filter((n) => /^part[A-Z]\d+$/.test(n) && fs.statSync(path.join(EMOJI, n)).isDirectory())

  // Emoji 已有的 md5
  const emojiMd5 = new Set()
  let emojiCount = 0
  for (const part of parts) {
    const dir = path.join(EMOJI, part)
    for (const f of fs.readdirSync(dir).filter(isImage)) {
      emojiCount++
      const buf = fs.readFileSync(path.join(dir, f), { flag: 'r' })
      // 文件名里的 hash8 不足以判重，这里用 INDEX.csv 反查
      emojiMd5.add(part + '/' + f)
    }
  }

  const { header, rows } = readCsv()
  const nameToMd5 = new Map()
  for (const line of rows) {
    const c = line.split(',')
    const key = (c[0] || '').trim() + '/' + (c[2] || '').trim()
    const md5 = (c[3] || '').trim().toLowerCase()
    if (md5.length === 32) nameToMd5.set(key, md5)
  }

  const indexMd5 = new Set(nameToMd5.values())
  console.log('Emoji 图数       :', emojiCount)
  console.log('INDEX 记录       :', indexMd5.size)
  console.log('分区数           :', parts.length)

  // assets 里缺的
  // 注意: 必须用文件内容的真实 md5，不能从文件名推断 ——
  // 旧 assets 的命名历史上有过错位（文件名 ≠ 内容），按名字猜会把 md5 记错，
  // 连累后续的去重和墓碑拦截。
  const missing = []
  for (const f of fs.readdirSync(ASSETS).filter(isImage)) {
    const full = path.join(ASSETS, f)
    const buf = fs.readFileSync(full)
    const md5 = crypto.createHash('md5').update(buf).digest('hex')
    if (indexMd5.has(md5)) continue
    missing.push({ file: f, md5 })
  }

  console.log('assets 缺的图    :', missing.length)
  if (missing.length === 0) {
    console.log('Emoji 已覆盖全部内容，无需补入。')
    return
  }

  const partCount = Math.ceil(missing.length / PER_PART)
  console.log('将新建分区       :', 'partF001 ~ partF00' + partCount)

  if (DRY) {
    console.log('')
    console.log('[dry] 未写入任何文件')
    return
  }

  // 找 F 的起点编号
  let startIdx = 1
  while (fs.existsSync(path.join(EMOJI, 'partF' + String(startIdx).padStart(3, '0')))) startIdx++

  const newCsvRows = []
  const batchLines = []

  for (let p = 0; p < partCount; p++) {
    const partName = 'partF' + String(startIdx + p).padStart(3, '0')
    const dir = path.join(EMOJI, partName)
    fs.mkdirSync(dir, { recursive: true })

    const chunk = missing.slice(p * PER_PART, (p + 1) * PER_PART)
    const metaItems = []
    const labelItems = []

    for (let i = 0; i < chunk.length; i++) {
      const { file, md5 } = chunk[i]
      const src = path.join(ASSETS, file)
      const ext = path.extname(file).toLowerCase()
      const seq = String(i + 1).padStart(2, '0')
      const newName = seq + '_' + md5.slice(0, 8) + ext
      const dst = path.join(dir, newName)

      const buf = fs.readFileSync(src)
      const { w, h } = imageSize(buf)

      try {
        fs.linkSync(src, dst)
      } catch (e) {
        fs.copyFileSync(src, dst)
      }

      metaItems.push({
        file: newName,
        md5: md5,
        ext: ext.replace('.', ''),
        w: w,
        h: h,
        bytes: buf.length,
        source: SOURCE,
        pack: '',
        month: ''
      })

      labelItems.push({
        file: newName,
        desc: '',
        category: '',
        tags: [],
        symbol: '',
        intensity: 0,
        mood: '',
        personas: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 },
        negatives: [],
        confidence: null,
        verdict: ''
      })

      newCsvRows.push(
        [partName, i + 1, newName, md5, ext.replace('.', ''), w, h, buf.length, SOURCE, '', '', BATCH, src].join(',')
      )
    }

    fs.writeFileSync(
      path.join(dir, '_meta.json'),
      JSON.stringify({ part: partName, batch: BATCH, count: chunk.length, sources: { [SOURCE]: chunk.length }, items: metaItems }, null, 2)
    )

    fs.writeFileSync(
      path.join(dir, 'labels.json'),
      JSON.stringify({ part: partName, batch: BATCH, task: 'label', status: 'pending', finished_at: null, items: labelItems }, null, 2)
    )

    batchLines.push(partName)
    console.log('建好             :', partName, '(' + chunk.length + ' 张)')
  }

  // 追加 INDEX.csv（只追加，不改旧行）
  const csvAppend = newCsvRows.join('\n') + '\n'
  fs.appendFileSync(INDEX_CSV, csvAppend)

  // 追加 BATCHES.md
  const totalBytes = missing.reduce((s, m) => s + fs.statSync(path.join(ASSETS, m.file)).size, 0)
  const mdLine =
    '| ' + BATCH + ' | ' + BATCH + ' | ' + batchLines[0] + ' ~ ' + batchLines[batchLines.length - 1] +
    ' | ' + missing.length + ' | ' + Math.round(totalBytes / 1024 / 1024) + ' MB | ' + SOURCE + ' ' + missing.length + ' |\n'
  fs.appendFileSync(BATCHES_MD, mdLine)

  console.log('')
  console.log('已追加 INDEX.csv :', newCsvRows.length, '行')
  console.log('已追加 BATCHES.md:', batchLines[0] + ' ~ ' + batchLines[batchLines.length - 1])
  console.log('')
}

main()
