// append_to_part.js
// 把新图追加进 partX 系列，默认每次开新分区
//
// 两种模式:
//   默认      —— 每次都开新分区，不回填旧分区。建过的分区就定稿，哪怕只有 2 张。
//                好处：分区 = 一次导入的批次，语义干净；已 done 的分区不会被反复打开重标。
//   --fill    —— 先补最后一个未满的，补满才开新分区。适合「想把洞填上」的场景。
//
// 三道闸和 import_emoji 一样：墓碑 → INDEX → 本批重复
//
// 用法:
//   node append_to_part.js "D:\some\folder" --prefix A --dry
//   node append_to_part.js "D:\some\folder" --prefix A
//   node append_to_part.js "D:\some\folder" --prefix A --fill
//   node append_to_part.js --from-inbox --prefix A

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
const FILL = ARGS.includes('--fill')

let PREFIX = 'A'
const pi = ARGS.indexOf('--prefix')
if (pi >= 0 && ARGS[pi + 1]) PREFIX = ARGS[pi + 1].toUpperCase()

let MAX = 30
const mi = ARGS.indexOf('--max')
if (mi >= 0 && ARGS[mi + 1]) MAX = parseInt(ARGS[mi + 1]) || 30

const srcArg = ARGS.find((a, i) => !a.startsWith('--') && ARGS[i - 1] !== '--prefix' && ARGS[i - 1] !== '--max')
const SRC = FROM_INBOX ? INBOX : (srcArg ? path.resolve(srcArg) : null)

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
  return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex')
}

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

// 该字母系列的所有分区，按编号升序
function listParts(prefix) {
  return fs
    .readdirSync(EMOJI)
    .filter((n) => new RegExp('^part' + prefix + '\\d+$').test(n))
    .sort()
    .map((n) => ({
      name: n,
      num: parseInt(n.replace(/^part[A-Z]/, ''), 10),
      dir: path.join(EMOJI, n)
    }))
}

function countImages(dir) {
  return fs.readdirSync(dir).filter(isImage).length
}

function maxSeqIn(dir) {
  let max = 0
  for (const f of fs.readdirSync(dir)) {
    if (!isImage(f)) continue
    const m = f.match(/^(\d+)_/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max
}

function main() {
  console.log('')
  console.log('=== 追加到已有分区 ===')

  if (!SRC) {
    console.error('缺少源目录。用法: node append_to_part.js "D:\\some\\folder" --prefix A')
    process.exit(1)
  }
  if (!fs.existsSync(SRC)) {
    console.error('源目录不存在:', SRC)
    process.exit(1)
  }

  console.log('源目录           :', SRC)
  console.log('目标系列         : part' + PREFIX + '*')
  console.log('单分区上限       :', MAX)

  const indexed = readCsvMd5(INDEX_CSV)
  const rejected = readRejectedMd5()

  const files = walk(SRC, [])
  const seen = new Set()
  const fresh = []
  let dupIndex = 0
  let dupRejected = 0
  let dupBatch = 0

  for (const p of files) {
    let md5
    try { md5 = md5File(p) } catch (e) { continue }
    if (rejected.has(md5)) { dupRejected++; continue }
    if (indexed.has(md5)) { dupIndex++; continue }
    if (seen.has(md5)) { dupBatch++; continue }
    seen.add(md5)

    let buf
    try { buf = fs.readFileSync(p) } catch (e) { continue }
    const size = imageSize(buf)
    fresh.push({
      src: p,
      md5,
      ext: path.extname(p).toLowerCase(),
      w: size.w,
      h: size.h,
      bytes: buf.length
    })
  }

  console.log('待追加           :', fresh.length, '(已入库跳过 ', dupIndex, '/ 已否决跳过 ', dupRejected, '/ 本批重复 ', dupBatch, ')')

  if (fresh.length === 0) {
    console.log('')
    console.log('没有新图需要追加。')
    return
  }

  // 规划
  // 默认：每次都开新分区，不回填旧分区 —— 建过的分区就定稿，哪怕只有 2 张。
  //       这样分区 = 一次导入的批次，语义干净，也不会把已 done 的分区反复打开。
  // --fill：先补最后一个未满的，补满才开新分区。
  const parts = listParts(PREFIX)
  const plan = []
  let cursor = 0

  if (FILL && parts.length > 0) {
    const last = parts[parts.length - 1]
    const cur = countImages(last.dir)
    const room = Math.max(0, MAX - cur)
    if (room > 0) {
      const take = Math.min(room, fresh.length)
      plan.push({ part: last.name, dir: last.dir, isNew: false, items: fresh.slice(0, take) })
      cursor = take
    }
  }

  let nextNum = parts.length > 0 ? parts[parts.length - 1].num + 1 : 1
  while (cursor < fresh.length) {
    const name = 'part' + PREFIX + String(nextNum).padStart(3, '0')
    const take = Math.min(MAX, fresh.length - cursor)
    plan.push({ part: name, dir: path.join(EMOJI, name), isNew: true, items: fresh.slice(cursor, cursor + take) })
    cursor += take
    nextNum++
  }

  console.log('')
  for (const p of plan) {
    console.log('  ' + p.part, p.isNew ? '[新建]' : '[追加]', p.items.length, '张')
  }

  if (DRY) {
    console.log('')
    console.log('[dry] 未写入任何文件')
    return
  }

  const csvRows = []
  const touched = []

  for (const p of plan) {
    fs.mkdirSync(p.dir, { recursive: true })

    const metaPath = path.join(p.dir, '_meta.json')
    const labelPath = path.join(p.dir, 'labels.json')

    let meta = { part: p.part, batch: BATCH, count: 0, sources: {}, items: [] }
    let labels = { part: p.part, batch: BATCH, task: 'label', status: 'pending', finished_at: null, items: [] }

    if (fs.existsSync(metaPath)) {
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch (e) {}
    }
    if (fs.existsSync(labelPath)) {
      try { labels = JSON.parse(fs.readFileSync(labelPath, 'utf8')) } catch (e) {}
    }

    let seq = maxSeqIn(p.dir)

    for (const it of p.items) {
      seq++
      const seqStr = String(seq).padStart(2, '0')
      const newName = seqStr + '_' + it.md5.slice(0, 8) + it.ext
      fs.copyFileSync(it.src, path.join(p.dir, newName))

      meta.items.push({
        file: newName,
        md5: it.md5,
        ext: it.ext.replace('.', ''),
        w: it.w,
        h: it.h,
        bytes: it.bytes,
        source: '追加',
        pack: '',
        month: ''
      })

      labels.items.push({
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
        [p.part, seq, newName, it.md5, it.ext.replace('.', ''), it.w, it.h, it.bytes, '追加', '', '', BATCH, it.src]
          .map(csvEscape)
          .join(',')
      )
    }

    meta.count = meta.items.length
    meta.sources = meta.sources || {}
    meta.sources['追加'] = (meta.sources['追加'] || 0) + p.items.length

    // 只要还有未标注的条目，status 就回到 pending
    const hasEmpty = labels.items.some((x) => !x.verdict)
    labels.status = hasEmpty ? 'pending' : 'done'
    labels.finished_at = hasEmpty ? null : labels.finished_at

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
    fs.writeFileSync(labelPath, JSON.stringify(labels, null, 2))

    touched.push(p.part)
  }

  fs.appendFileSync(INDEX_CSV, csvRows.join('\n') + '\n')

  const totalBytes = fresh.reduce((s, x) => s + x.bytes, 0)
  fs.appendFileSync(
    BATCHES_MD,
    '| ' + BATCH + ' | ' + BATCH + ' | ' + touched.join(', ') + ' | ' + fresh.length + ' | ' +
      Math.round(totalBytes / 1024 / 1024) + ' MB | 追加 ' + fresh.length + ' |\n'
  )

  console.log('')
  console.log('已追加 INDEX.csv :', csvRows.length, '行')
  console.log('已更新分区       :', touched.join(', '))
  console.log('')
  console.log('注意: 这些分区的 status 已回到 pending，skill 会重新处理，')
  console.log('      但只应处理 verdict 为空的条目（提示词里有规定）。')
  console.log('')
}

main()
