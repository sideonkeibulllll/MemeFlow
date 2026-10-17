// select_curated.js
// cap sync 之后，把 android assets 里的图裁成「已标注且判定为可用」的集合
//
// 精选定义（主人定的）:
//   只装 labels.json 里 verdict = keep 或 unsure 的图。
//   drop 的和还没标注的一律不装 —— 装了也没有分类，只会给网格添噪声。
//
// 为什么需要这一步:
//   web/assets 是全量 6869 张 / 855MB。而 238 个分区目前只标完 88 个，
//   真正「能用」的只有 1352 张 / 约 117MB。剩下的等标注跑完再随下次发版补。
//
// 关键点:
//   - 只删 android/app/src/main/assets/public/assets 下的文件
//   - 那是 cap sync 复制出来的**独立副本**，删它不影响 web/assets、assets、Emoji
//   - 按 md5 而不是文件名匹配：merge_emoji 做过内容去重，有小部分文件名在 assets 里已改名
//   - memes.json 必须同步重写，否则 MainActivity 会去找不存在的图
//
// 用法:
//   node select_curated.js --dry     # 只算不删
//   node select_curated.js           # 执行

const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const EMOJI = path.join(ROOT, 'Emoji')
const INDEX = path.join(EMOJI, 'INDEX.csv')
const TARGET = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'public', 'assets')

// 只保留这两种判定
const KEEP_VERDICTS = new Set(['keep', 'unsure'])

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])
const DRY = process.argv.includes('--dry')

function main() {
  if (!fs.existsSync(TARGET)) {
    console.error('目标目录不存在:', TARGET)
    console.error('先跑 npm run sync:android')
    process.exit(1)
  }
  if (!fs.existsSync(INDEX)) {
    console.error('INDEX.csv 不存在:', INDEX)
    process.exit(1)
  }

  // ---------- 1. 扫标注，收集 keep / unsure ----------
  const curatedFiles = new Set()
  const tally = { keep: 0, unsure: 0, drop: 0, pending: 0 }
  let doneParts = 0
  let skippedParts = 0

  const parts = fs.readdirSync(EMOJI).filter((n) => /^part[A-Z]\d+$/.test(n)).sort()
  for (const p of parts) {
    const lf = path.join(EMOJI, p, 'labels.json')
    if (!fs.existsSync(lf)) continue
    let d
    try {
      d = JSON.parse(fs.readFileSync(lf, 'utf8'))
    } catch (e) {
      skipping(p, '解析失败')
      continue
    }
    if (d.status !== 'done') {
      skippedParts++
      continue
    }
    doneParts++
    for (const it of d.items || []) {
      if (!it || !it.file) continue
      const v = it.verdict || ''
      if (v === 'keep') {
        tally.keep++
        curatedFiles.add(it.file)
      } else if (v === 'unsure') {
        tally.unsure++
        curatedFiles.add(it.file)
      } else if (v === 'drop') {
        tally.drop++
      } else {
        tally.pending++
      }
    }
  }

  function skipping(name, why) {
    console.log('  跳过', name, '-', why)
  }

  // ---------- 2. file -> md5 ----------
  const rows = fs.readFileSync(INDEX, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).slice(1).filter(Boolean)
  const md5OfFile = new Map()
  for (const line of rows) {
    const c = line.split(',')
    if (c[2] && c[3]) md5OfFile.set(c[2], c[3])
  }

  // 精选 md5 集合
  const curatedMd5 = new Set()
  let noMd5 = 0
  for (const f of curatedFiles) {
    const m = md5OfFile.get(f)
    if (m) curatedMd5.add(m)
    else noMd5++
  }

  // ---------- 3. 扫目标目录 ----------
  const all = fs.readdirSync(TARGET)
  const images = all.filter((f) => IMG_EXT.has(path.extname(f).toLowerCase()))
  const keep = []
  const drop = []
  let keepBytes = 0
  let dropBytes = 0

  for (const f of images) {
    const st = fs.statSync(path.join(TARGET, f))
    const md5 = md5OfFile.get(f)
    if (md5 && curatedMd5.has(md5)) {
      keep.push(f)
      keepBytes += st.size
    } else {
      drop.push(f)
      dropBytes += st.size
    }
  }

  // ---------- 4. 报告 ----------
  console.log('')
  console.log('=== 按标注结果筛选 ===')
  console.log('分区          : ' + doneParts + ' 个已完成' + (skippedParts ? ' / ' + skippedParts + ' 个未完成' : ''))
  console.log('判定分布      : keep ' + tally.keep + ' · unsure ' + tally.unsure +
    ' · drop ' + tally.drop + ' · 未判 ' + tally.pending)
  console.log('应收          : ' + curatedFiles.size + ' 张' + (noMd5 ? '（' + noMd5 + ' 张查不到 md5）' : ''))
  console.log('')
  console.log('目标目录      :', TARGET)
  console.log('当前图片      : ' + images.length + ' 张 / ' + Math.round((keepBytes + dropBytes) / 1048576) + ' MB')
  console.log('保留          : ' + keep.length + ' 张 / ' + Math.round(keepBytes / 1048576) + ' MB')
  console.log('移除          : ' + drop.length + ' 张 / ' + Math.round(dropBytes / 1048576) + ' MB')

  if (DRY) {
    console.log('')
    console.log('[dry] 不做任何改动')
    return
  }

  // ---------- 5. 删非精选 ----------
  let removed = 0
  for (const f of drop) {
    fs.unlinkSync(path.join(TARGET, f))
    removed++
  }
  console.log('')
  console.log('已删除        : ' + removed + ' 张')

  // ---------- 6. 重写 memes.json ----------
  const memesJson = path.join(TARGET, 'memes.json')
  fs.writeFileSync(memesJson, JSON.stringify(keep.slice().sort(), null, 2))
  console.log('已重写        : memes.json (' + keep.length + ' 条)')

  const finalBytes = keep.reduce((n, f) => n + fs.statSync(path.join(TARGET, f)).size, 0)
  console.log('最终体积      : ' + Math.round(finalBytes / 1048576) + ' MB')
  console.log('')
  console.log('下一步: node build-lite.js')
}

main()
