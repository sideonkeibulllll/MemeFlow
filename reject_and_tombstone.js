// reject_and_tombstone.js
// 把 labels.json 里 verdict=drop 的图移出分区，并登记到 REJECTED.csv（墓碑清单）
//
// 为什么这么做:
//   增量导入是按 md5 去重的。如果 drop 的图只是删掉，下次从 QQ 再复制回来时，
//   md5 在 INDEX 里查不到，就会被当成新图重新收进来 —— 前面的判定白做。
//   所以要留"墓碑"：图移出分区（AI 再也看不到它），md5 记进 REJECTED.csv
//   （导入脚本下次能拦住它）。
//
// 为什么是"移出"而不是"删除":
//   AI 会误判。移到 _rejected/ 不占额外空间，随时能捞回来复查；
//   确认稳定后再手动清理目录。而 _rejected/ 不在 part* 里，
//   build_persona.js 的分区扫描天然不会碰到它。
//
// 用法:
//   node reject_and_tombstone.js --dry    只看会移走哪些
//   node reject_and_tombstone.js          执行

const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const EMOJI = path.join(ROOT, 'Emoji')
const INDEX_CSV = path.join(EMOJI, 'INDEX.csv')
const REJECTED_CSV = path.join(EMOJI, 'REJECTED.csv')
const REJECTED_DIR = path.join(EMOJI, '_rejected')

const DRY = process.argv.includes('--dry')

const EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const isImage = (n) => EXTS.includes(path.extname(n).toLowerCase())

const CSV_HEADER = 'md5,file,part,reason,rejected_at,src_path'

function csvEscape(s) {
  const v = String(s == null ? '' : s)
  if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

// part/file -> { md5, srcPath }
function readIndex() {
  const map = new Map()
  if (!fs.existsSync(INDEX_CSV)) return map

  const raw = fs.readFileSync(INDEX_CSV, 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).slice(1)

  for (const line of lines) {
    if (!line.trim()) continue
    const c = line.split(',')
    const part = (c[0] || '').trim()
    const file = (c[2] || '').trim()
    const md5 = (c[3] || '').trim().toLowerCase()
    const srcPath = (c[12] || '').trim()
    if (part && file && md5.length === 32) {
      map.set(part + '/' + file, { md5, srcPath })
    }
  }
  return map
}

// 已有墓碑的 md5 集合（幂等）
function readRejected() {
  const set = new Set()
  if (!fs.existsSync(REJECTED_CSV)) return set

  const raw = fs.readFileSync(REJECTED_CSV, 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).slice(1)
  for (const line of lines) {
    if (!line.trim()) continue
    const md5 = line.split(',')[0].trim().toLowerCase()
    if (md5.length === 32) set.add(md5)
  }
  return set
}

function main() {
  console.log('')
  console.log('=== 墓碑登记 ===')

  const index = readIndex()
  const rejected = readRejected()
  console.log('INDEX 记录       :', index.size)
  console.log('现有墓碑         :', rejected.size)

  const parts = fs
    .readdirSync(EMOJI)
    .filter((n) => /^part[A-Z]\d+$/.test(n) && fs.statSync(path.join(EMOJI, n)).isDirectory())

  const pending = []

  for (const part of parts) {
    const labelFile = path.join(EMOJI, part, 'labels.json')
    if (!fs.existsSync(labelFile)) continue

    let data
    try {
      data = JSON.parse(fs.readFileSync(labelFile, 'utf8'))
    } catch (e) {
      console.warn('跳过损坏的 labels.json:', part)
      continue
    }

    const list = Array.isArray(data.items) ? data.items : []
    for (const item of list) {
      if (!item || !item.file) continue

      const verdict = item.verdict
      const symbol = item.symbol
      const isDrop = verdict === 'drop' || symbol === 'negative'
      if (!isDrop) continue

      const rel = part + '/' + item.file
      const meta = index.get(rel)
      if (!meta) continue

      // 已登记过墓碑的跳过（幂等）
      if (rejected.has(meta.md5)) continue

      const src = path.join(EMOJI, part, item.file)
      if (!fs.existsSync(src)) continue

      const reason = (Array.isArray(item.negatives) && item.negatives.length)
        ? item.negatives.join('|')
        : (symbol === 'negative' ? '负面能指' : '未注明')

      pending.push({
        part,
        file: item.file,
        md5: meta.md5,
        srcPath: meta.srcPath,
        reason,
        src
      })
    }
  }

  console.log('待处理           :', pending.length)
  if (pending.length === 0) {
    console.log('没有新的 drop 图需要处理。')
    return
  }

  if (DRY) {
    const byPart = {}
    for (const p of pending) byPart[p.part] = (byPart[p.part] || 0) + 1
    for (const [k, v] of Object.entries(byPart).sort()) {
      console.log('  ' + k + ':', v, '张')
    }
    console.log('')
    console.log('[dry] 未移动任何文件')
    return
  }

  // 按分区移图
  const rows = []
  let moved = 0
  let failed = 0

  for (const p of pending) {
    const dstDir = path.join(REJECTED_DIR, p.part)

    try {
      fs.mkdirSync(dstDir, { recursive: true })
      const dst = path.join(dstDir, p.file)
      if (fs.existsSync(dst)) fs.unlinkSync(dst)
      fs.renameSync(p.src, dst)
      moved++
    } catch (e) {
      // 跨盘或占用中，退回复制 + 删除
      try {
        fs.copyFileSync(p.src, path.join(dstDir, p.file))
        fs.unlinkSync(p.src)
        moved++
      } catch (e2) {
        failed++
        console.warn('移动失败:', p.part + '/' + p.file, '-', e2.message)
        continue
      }
    }

    rejected.add(p.md5)
    rows.push(
      [
        p.md5,
        csvEscape(p.file),
        p.part,
        csvEscape(p.reason),
        new Date().toISOString(),
        csvEscape(p.srcPath)
      ].join(',')
    )
  }

  // 写 REJECTED.csv（不存在就建表头）
  const exists = fs.existsSync(REJECTED_CSV)
  const chunk = (exists ? '' : CSV_HEADER + '\n') + rows.join('\n') + (rows.length ? '\n' : '')
  fs.appendFileSync(REJECTED_CSV, chunk)

  console.log('已移出           :', moved, '张 -> Emoji/_rejected/')
  console.log('失败             :', failed)
  console.log('墓碑总数         :', rejected.size)
  console.log('已更新           :', path.relative(ROOT, REJECTED_CSV))
  console.log('')
  console.log('注意: labels.json 保留原记录（审计用），图已不在分区里。')
  console.log('      下次导入时，导入脚本按 REJECTED.csv 的 md5 自动跳过。')
  console.log('')
}

main()
