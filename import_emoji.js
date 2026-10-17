// import_emoji.js
// 从源目录（QQ 数据库 / _inbox / 任意文件夹）导入新表情，自动分区建档
//
// 三道闸门（顺序执行，命中即跳过）:
//   1. INDEX.csv      —— 已入库的图（按 md5）
//   2. REJECTED.csv   —— 已被 AI 否决的图（按 md5）← 堵住回流
//   3. 文件名冲突     —— 目标分区已有同名但不同内容
//
// 用法:
//   node import_emoji.js --from-inbox              从 Emoji/_inbox 导入
//   node import_emoji.js "D:\some\folder"          从指定目录导入（递归）
//   node import_emoji.js "D:\some\folder" --dry    只看会导入多少
//   node import_emoji.js "D:\some\folder" --prefix G   指定分区字母（默认 G）
//
// 产出:
//   Emoji/partG001/ ...  每个分区 30 张，含 _meta.json / labels.json(pending)
//   INDEX.csv 追加行
//   BATCHES.md 追加一行

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = __dirname
const EMOJI = path.join(ROOT, 'Emoji')
const INBOX = path.join(EMOJI, '_inbox')
const INDEX_CSV = path.join(EMOJI, 'INDEX.csv')
const REJECTED_CSV = path.join(EMOJI, 'REJECTED.csv')
const BATCHES_MD = path.join(EMOJI, 'BATCHES.md')

const ARGS = process.argv.slice(2)
const DRY = ARGS.includes('--dry')
const FROM_INBOX = ARGS.includes('--from-inbox')

let PREFIX = 'G'
const pi = ARGS.indexOf('--prefix')
if (pi >= 0 && ARGS[pi + 1]) PREFIX = ARGS[pi + 1].toUpperCase()

const srcArg = ARGS.find((a) => !a.startsWith('--') && ARGS[ARGS.indexOf(a) - 1] !== '--prefix')
const SRC = FROM_INBOX ? INBOX : (srcArg ? path.resolve(srcArg) : null)

const PER_PART = 30
const BATCH = new Date().toISOString().slice(0, 10)

const EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const isImage = (n) => EXTS.includes(path.extname(n).toLowerCase())

function csvEscape(s) {
  const v = String(s == null ? '' : s)
  if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

function md5File(p) {
  const buf = fs.readFileSync(p)
  return crypto.createHash('md5').update(buf).digest('hex')
}

// 只读文件头判断尺寸
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

function readCsvMd5(file) {
  const set = new Set()
  if (!fs.existsSync(file)) return set
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  for (const line of raw.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue
    const c = line.split(',')
    const md5 = (c[3] || '').trim().toLowerCase()
    if (md5.length === 32) set.add(md5)
  }
  return set
}

function readRejectedMd5() {
  const set = new Set()
  if (!fs.existsSync(REJECTED_CSV)) return set
  const raw = fs.readFileSync(REJECTED_CSV, 'utf8').replace(/^\uFEFF/, '')
  for (const line of raw.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue
    const md5 = line.split(',')[0].trim().toLowerCase()
    if (md5.length === 32) set.add(md5)
  }
  return set
}

// 递归收集图片
function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    let st
    try { st = fs.statSync(p) } catch (e) { continue }
    if (st.isDirectory()) walk(p, out)
    else if (isImage(name)) out.push(p)
  }
  return out
}

function main() {
  console.log('')
  console.log('=== 导入新表情 ===')

  if (!SRC) {
    console.error('缺少源目录。用法:')
    console.error('  node import_emoji.js --from-inbox')
    console.error('  node import_emoji.js "D:\\some\\folder"')
    process.exit(1)
  }
  if (!fs.existsSync(SRC)) {
    console.error('源目录不存在:', SRC)
    process.exit(1)
  }

  console.log('源目录           :', SRC)
  console.log('分区前缀         : part' + PREFIX)

  const indexed = readCsvMd5(INDEX_CSV)
  const rejected = readRejectedMd5()
  console.log('已入库 md5       :', indexed.size)
  console.log('已否决 md5       :', rejected.size)

  const files = walk(SRC, [])
  console.log('源目录图片       :', files.length)

  const seen = new Set()
  const fresh = []
  let dupIndex = 0
  let dupRejected = 0
  let dupBatch = 0

  for (const p of files) {
    let md5
    try {
      md5 = md5File(p)
    } catch (e) {
      continue
    }

    // 墓碑优先于 INDEX：已否决是更强的判定，先报出来信息量更大
    if (rejected.has(md5)) { dupRejected++; continue }
    if (indexed.has(md5)) { dupIndex++; continue }
    if (seen.has(md5)) { dupBatch++; continue }

    seen.add(md5)

    let buf
    try { buf = fs.readFileSync(p) } catch (e) { continue }
    const size = imageSize(buf)

    fresh.push({
      src: p,
      name: path.basename(p),
      md5,
      ext: path.extname(p).toLowerCase(),
      w: size.w,
      h: size.h,
      bytes: buf.length
    })
  }

  console.log('  已入库跳过     :', dupIndex)
  console.log('  已否决跳过     :', dupRejected, '  <- 墓碑生效')
  console.log('  本批重复跳过   :', dupBatch)
  console.log('可导入           :', fresh.length)

  if (fresh.length === 0) {
    console.log('')
    console.log('没有新图需要导入。')
    return
  }

  const partCount = Math.ceil(fresh.length / PER_PART)
  console.log('将新建分区       :', 'part' + PREFIX + '001 ~ part' + PREFIX + String(partCount).padStart(3, '0'))

  if (DRY) {
    console.log('')
    console.log('[dry] 未写入任何文件')
    return
  }

  // 找下一个可用编号
  let start = 1
  while (fs.existsSync(path.join(EMOJI, 'part' + PREFIX + String(start).padStart(3, '0')))) start++

  const csvRows = []
  const partNames = []

  for (let p = 0; p < partCount; p++) {
    const partName = 'part' + PREFIX + String(start + p).padStart(3, '0')
    const dir = path.join(EMOJI, partName)
    fs.mkdirSync(dir, { recursive: true })

    const chunk = fresh.slice(p * PER_PART, (p + 1) * PER_PART)
    const metaItems = []
    const labelItems = []

    for (let i = 0; i < chunk.length; i++) {
      const it = chunk[i]
      const seq = String(i + 1).padStart(2, '0')
      const newName = seq + '_' + it.md5.slice(0, 8) + it.ext
      fs.copyFileSync(it.src, path.join(dir, newName))

      metaItems.push({
        file: newName,
        md5: it.md5,
        ext: it.ext.replace('.', ''),
        w: it.w,
        h: it.h,
        bytes: it.bytes,
        source: '新导入',
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

      csvRows.push(
        [partName, i + 1, newName, it.md5, it.ext.replace('.', ''), it.w, it.h, it.bytes, '新导入', '', '', BATCH, it.src]
          .map(csvEscape)
          .join(',')
      )
    }

    fs.writeFileSync(
      path.join(dir, '_meta.json'),
      JSON.stringify({ part: partName, batch: BATCH, count: chunk.length, sources: { 新导入: chunk.length }, items: metaItems }, null, 2)
    )

    fs.writeFileSync(
      path.join(dir, 'labels.json'),
      JSON.stringify({ part: partName, batch: BATCH, task: 'label', status: 'pending', finished_at: null, items: labelItems }, null, 2)
    )

    partNames.push(partName)
    console.log('建好             :', partName, '(' + chunk.length + ' 张)')
  }

  fs.appendFileSync(INDEX_CSV, csvRows.join('\n') + '\n')

  const totalBytes = fresh.reduce((s, x) => s + x.bytes, 0)
  const mdLine =
    '| ' + BATCH + ' | ' + BATCH + ' | ' + partNames[0] + ' ~ ' + partNames[partNames.length - 1] +
    ' | ' + fresh.length + ' | ' + Math.round(totalBytes / 1024 / 1024) + ' MB | 新导入 ' + fresh.length + ' |\n'
  fs.appendFileSync(BATCHES_MD, mdLine)

  console.log('')
  console.log('已追加 INDEX.csv :', csvRows.length, '行')
  console.log('已追加 BATCHES.md')
  console.log('')
  console.log('下一步: 让 skill 跑这些新分区，然后 node build_persona.js')
  console.log('')
}

main()
