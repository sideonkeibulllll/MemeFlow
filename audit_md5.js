// audit_md5.js
// 审计「文件名里的 hash8」与「文件内容真实 md5」是否一致
//
// 为什么需要:
//   Emoji 的文件名约定是 NN_<md5前8位>.<ext>。但历史上从旧 assets 搬过来的那批图，
//   文件名里的 hash 有错位（文件名 ≠ 内容）。这会让 INDEX.csv 的 md5 记错，
//   连带影响两件事：merge_emoji 的去重、reject_and_tombstone 的墓碑拦截。
//
// 用法:
//   node audit_md5.js            只体检，报告不一致
//   node audit_md5.js --fix      重命名文件 + 修正 INDEX.csv / _meta.json / labels.json
//   node audit_md5.js --fix --dry  演练，不改任何文件

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = __dirname
const EMOJI = path.join(ROOT, 'Emoji')
const INDEX_CSV = path.join(EMOJI, 'INDEX.csv')

const FIX = process.argv.includes('--fix')
const DRY = process.argv.includes('--dry')

const EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const isImage = (n) => EXTS.includes(path.extname(n).toLowerCase())

function md5File(p) {
  return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex')
}

function main() {
  console.log('')
  console.log('=== md5 一致性审计 ===')

  const parts = fs
    .readdirSync(EMOJI)
    .filter((n) => /^part[A-Z]\d+$/.test(n) && fs.statSync(path.join(EMOJI, n)).isDirectory())

  console.log('分区数           :', parts.length)

  const bad = []
  let scanned = 0

  for (const part of parts) {
    const dir = path.join(EMOJI, part)
    for (const f of fs.readdirSync(dir).filter(isImage)) {
      scanned++
      const real = md5File(path.join(dir, f))
      const m = f.match(/_([0-9a-f]{8})\./i)
      if (!m) continue
      if (!real.startsWith(m[1].toLowerCase())) {
        bad.push({ part, file: f, real })
      }
    }
  }

  console.log('扫描图片         :', scanned)
  console.log('命名不一致       :', bad.length)

  if (bad.length === 0) {
    console.log('')
    console.log('全部一致，无需修。')
    return
  }

  const byPart = {}
  for (const b of bad) byPart[b.part] = (byPart[b.part] || 0) + 1
  console.log('')
  console.log('按分区:')
  for (const [k, v] of Object.entries(byPart).sort()) {
    console.log('  ' + k.padEnd(10), v, '张')
  }

  for (const b of bad.slice(0, 5)) {
    const nameHash = (b.file.match(/_([0-9a-f]{8})\./i) || [])[1]
    console.log('  ' + b.part + '/' + b.file, '  名字:', nameHash, ' 实际:', b.real.slice(0, 8))
  }

  if (!FIX) {
    console.log('')
    console.log('加 --fix 可以重命名并修正台账。')
    return
  }

  // ===== 修正 =====
  console.log('')
  console.log(DRY ? '[dry] 演练模式，不会真的改' : '开始修正...')

  const raw = fs.readFileSync(INDEX_CSV, 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/)
  const header = lines[0]
  const rows = lines.slice(1)

  // part/file -> 行号
  const rowIdx = new Map()
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].trim()) continue
    const c = rows[i].split(',')
    rowIdx.set((c[0] || '').trim() + '/' + (c[2] || '').trim(), i)
  }

  let renamed = 0
  let csvFixed = 0
  let metaFixed = 0
  let labelFixed = 0
  const failed = []

  for (const b of bad) {
    const dir = path.join(EMOJI, b.part)
    const ext = path.extname(b.file).toLowerCase()
    const seq = (b.file.match(/^(\d+)_/) || [])[1] || '01'
    const newName = seq + '_' + b.real.slice(0, 8) + ext
    const src = path.join(dir, b.file)
    const dst = path.join(dir, newName)

    if (newName === b.file) continue
    if (fs.existsSync(dst)) {
      failed.push(b.part + '/' + b.file + ' -> ' + newName + ' (目标已存在)')
      continue
    }

    if (!DRY) {
      try {
        fs.renameSync(src, dst)
      } catch (e) {
        failed.push(b.part + '/' + b.file + ' (' + e.message + ')')
        continue
      }
    }
    renamed++

    // INDEX.csv
    const key = b.part + '/' + b.file
    const idx = rowIdx.get(key)
    if (idx != null) {
      const c = rows[idx].split(',')
      c[2] = newName
      c[3] = b.real
      rows[idx] = c.join(',')
      csvFixed++
    }

    // _meta.json
    const metaPath = path.join(dir, '_meta.json')
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        for (const it of meta.items || []) {
          if (it.file === b.file) {
            it.file = newName
            it.md5 = b.real
            metaFixed++
            break
          }
        }
        if (!DRY) fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
      } catch (e) {}
    }

    // labels.json
    const labelPath = path.join(dir, 'labels.json')
    if (fs.existsSync(labelPath)) {
      try {
        const lab = JSON.parse(fs.readFileSync(labelPath, 'utf8'))
        for (const it of lab.items || []) {
          if (it.file === b.file) {
            it.file = newName
            labelFixed++
            break
          }
        }
        if (!DRY) fs.writeFileSync(labelPath, JSON.stringify(lab, null, 2))
      } catch (e) {}
    }
  }

  if (!DRY) {
    fs.writeFileSync(INDEX_CSV, [header].concat(rows).join('\n') + '\n')
  }

  console.log('重命名           :', renamed)
  console.log('修正 INDEX.csv   :', csvFixed, '行')
  console.log('修正 _meta.json  :', metaFixed, '条')
  console.log('修正 labels.json :', labelFixed, '条')
  console.log('失败             :', failed.length)
  for (const f of failed.slice(0, 5)) console.log('  x', f)

  if (!DRY) {
    console.log('')
    console.log('修完了。建议跑一次 node build_persona.js --dry 复核。')
  }
  console.log('')
}

main()
