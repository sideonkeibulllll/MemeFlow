// build_persona.js
// 把 Emoji/part*/labels.json 的标注汇总成前端可直接消费的 persona.json
//
// 用法:
//   node build_persona.js           生成 persona.json
//   node build_persona.js --dry     只看统计，不写文件
//   node build_persona.js --strict  有任何告警就以非 0 退出（给 CI / skill 用）
//
// 产出:
//   assets/persona.json        (源, 供浏览器/构建使用)
//   web/assets/persona.json    (web 端兜底)
//
// 设计要点:
//   1. 标注里的 personas 字段优先; 没有就用 symbol + mood 走规则表推算
//   2. verdict=drop 的图直接排除, 永不进入候选池
//   3. key 用 basename (去掉 part 前缀), 前端再按 hash8 做二级兜底匹配
//   4. 坏分区 / 孤儿标注 / key 冲突 / 分类失衡 全部显式告警, 不再静默跳过
//   5. keep 率偏离 25%~40% 会告警 —— 淘汰门槛失效或误杀都能被发现

const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const EMOJI_DIR = path.join(ROOT, 'Emoji')
const OUT_ASSETS = path.join(ROOT, 'assets', 'persona.json')
const OUT_WEB = path.join(ROOT, 'web', 'assets', 'persona.json')

const DRY = process.argv.includes('--dry')
const STRICT = process.argv.includes('--strict')

const EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const isImage = (n) => EXTS.includes(path.extname(n).toLowerCase())

// symbol -> 五个人格的基础分, 与 LABELING_PROMPT.md 的锚定样例对齐
const RULES = {
  regress:  { P1: 0.35, P2: 0.15, P3: 0.95, P4: 0.30, P5: 0.10 },
  rift:     { P1: 0.25, P2: 0.50, P3: 0.30, P4: 0.85, P5: 0.35 },
  softdef:  { P1: 0.90, P2: 0.30, P3: 0.10, P4: 0.80, P5: 0.20 },
  neutral:  { P1: 0.50, P2: 0.45, P3: 0.15, P4: 0.10, P5: 0.60 },
  negative: { P1: 0.00, P2: 0.00, P3: 0.00, P4: 0.00, P5: 0.00 }
}

// mood 关键词 -> 增量
const MOOD_BOOST = [
  { keys: ['兴奋', '开心', '期待', '雀跃', '高兴'], p: { P2: 0.15, P1: 0.10 } },
  { keys: ['低耗', '疲惫', '瘫', '没电', '困'],      p: { P3: 0.10 } },
  { keys: ['无语', '冷漠', '无语凝噎', '淡定'],      p: { P4: 0.10, P3: 0.05 } },
  { keys: ['炸毛', '生气', '怒', '红温'],            p: { P4: 0.15, P1: 0.10 } },
  { keys: ['撒娇', '粘人', '委屈'],                  p: { P1: 0.15, P3: 0.05 } },
  { keys: ['浪漫', '温柔', '平静'],                  p: { P5: 0.10 } }
]

const INTENSITY_SCALE = { 1: 0.60, 2: 0.85, 3: 1.00 }

function clamp(n) {
  if (typeof n !== 'number' || isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// 从文件名提取 8 位 hash: 01_0d3ebf5a.jpg -> 0d3ebf5a
function hash8(filename) {
  const base = path.basename(filename)
  const m = base.match(/_([0-9a-f]{8})\./i) || base.match(/^([0-9a-f]{8})[0-9a-f]{24}\./i)
  return m ? m[1].toLowerCase() : null
}

// 用 symbol + mood + intensity 推算五维分
function inferPersonas(item) {
  const base = RULES[item.symbol] || RULES.neutral
  const out = { P1: base.P1, P2: base.P2, P3: base.P3, P4: base.P4, P5: base.P5 }

  const mood = String(item.mood || '')
  for (const rule of MOOD_BOOST) {
    for (const k of rule.keys) {
      if (mood.indexOf(k) >= 0) {
        for (const pid in rule.p) {
          out[pid] = (out[pid] || 0) + rule.p[pid]
        }
        break
      }
    }
  }

  const scale = INTENSITY_SCALE[item.intensity] || 0.85
  for (const pid in out) {
    out[pid] = round2(clamp(out[pid] * scale))
  }
  return out
}

// 没有 category 时用 personas 最高分兜底
function inferCategory(personas) {
  let best = 'P1'
  let max = -1
  for (const pid of ['P1', 'P2', 'P3', 'P4', 'P5']) {
    if (personas[pid] > max) {
      max = personas[pid]
      best = pid
    }
  }
  return best
}

// 判断这条标注是否真的填过
// 注意: 预置的 labels.json 里 personas 是 {P1:0,...,P5:0}，不能因为"字段存在"就算已标注
function isLabeled(item) {
  if (!item) return false
  if (item.verdict) return true
  if (item.symbol) return true
  if (item.category) return true
  if (item.desc) return true
  if (item.mood) return true
  if (Array.isArray(item.tags) && item.tags.length > 0) return true

  if (item.personas && typeof item.personas === 'object') {
    let sum = 0
    for (const pid of ['P1', 'P2', 'P3', 'P4', 'P5']) {
      sum += Number(item.personas[pid]) || 0
    }
    if (sum > 0) return true
  }
  return false
}

function normalizePersonas(raw) {
  const out = {}
  for (const pid of ['P1', 'P2', 'P3', 'P4', 'P5']) {
    out[pid] = round2(clamp(Number(raw[pid])))
  }
  return out
}

// 原子写：先写临时文件再 rename
// 为什么需要：skill 可能并发跑多个分区，多个进程同时 writeFileSync 同一个文件
// 会写出撕裂的 JSON（前端读到就崩）。rename 是原子的，最终文件一定是某一次的完整版本。
function atomicWrite(file, content) {
  const tmp = file + '.tmp-' + process.pid
  fs.writeFileSync(tmp, content)

  for (let i = 0; i < 6; i++) {
    try {
      fs.renameSync(tmp, file)
      return
    } catch (e) {
      // Windows 上目标正被读取/占用时会短暂失败，稍等重试
      if (i === 5) {
        try { fs.unlinkSync(tmp) } catch (e2) {}
        throw e
      }
      const until = Date.now() + 40
      while (Date.now() < until) { /* 同步短暂等待 */ }
    }
  }
}

function main() {
  if (!fs.existsSync(EMOJI_DIR)) {
    console.error('找不到 Emoji 目录:', EMOJI_DIR)
    process.exit(1)
  }

  const parts = fs.readdirSync(EMOJI_DIR).filter(function (name) {
    const full = path.join(EMOJI_DIR, name)
    if (!fs.statSync(full).isDirectory()) return false
    if (!/^part[A-Z]\d+$/.test(name)) return false
    return fs.existsSync(path.join(full, 'labels.json'))
  })

  // 磁盘上真实存在的图片（用于孤儿检测）
  const existing = new Set()
  for (const part of parts) {
    for (const f of fs.readdirSync(path.join(EMOJI_DIR, part))) {
      if (isImage(f)) existing.add(part + '/' + f)
    }
  }

  const items = {}
  const byHash = {}
  const problems = { badParts: [], orphans: [], keyConflicts: [], doneButEmpty: [] }
  const stat = {
    parts: parts.length,
    partsDone: 0,
    total: 0,
    labeled: 0,
    kept: 0,
    keepOnly: 0,
    unsure: 0,
    dropped: 0,
    bySymbol: {},
    byCategory: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 },
    perPersona: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 },
    noDesc: 0,
    noTags: 0,
    noCategory: 0
  }

  for (const part of parts) {
    const file = path.join(EMOJI_DIR, part, 'labels.json')
    let data
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (e) {
      problems.badParts.push({ part, msg: e.message })
      continue
    }

    if (data.status === 'done') stat.partsDone++

    const list = Array.isArray(data.items) ? data.items : []
    let partLabeled = 0

    for (const item of list) {
      stat.total++
      if (!isLabeled(item)) continue
      stat.labeled++
      partLabeled++

      const verdict = item.verdict || 'unsure'
      const symbol = item.symbol || 'neutral'
      stat.bySymbol[symbol] = (stat.bySymbol[symbol] || 0) + 1

      if (verdict === 'drop' || symbol === 'negative') {
        stat.dropped++
        continue
      }
      if (verdict === 'unsure') stat.unsure++
      if (verdict === 'keep') stat.keepOnly++

      // 孤儿：标注里有，磁盘上没有
      const rel = part + '/' + (item.file || '')
      if (item.file && !existing.has(rel)) {
        problems.orphans.push(rel)
        continue
      }

      const personas = item.personas && typeof item.personas === 'object'
        ? normalizePersonas(item.personas)
        : inferPersonas(item)

      // 全零的图没有任何使用价值, 直接丢
      const sum = personas.P1 + personas.P2 + personas.P3 + personas.P4 + personas.P5
      if (sum <= 0.05) {
        stat.dropped++
        continue
      }

      const base = path.basename(item.file || '')
      if (!base) continue

      const entry = { p: personas }

      if (item.desc) entry.d = String(item.desc)
      else stat.noDesc++

      if (Array.isArray(item.tags) && item.tags.length > 0) {
        entry.t = item.tags.slice(0, 6).map(String)
      } else {
        stat.noTags++
      }

      const cat = item.category ? String(item.category) : inferCategory(personas)
      if (cat && /^P[1-5]$/.test(cat)) {
        entry.c = cat
        stat.byCategory[cat] = (stat.byCategory[cat] || 0) + 1
        if (!item.category) stat.noCategory++
      } else {
        stat.noCategory++
      }

      if (symbol !== 'neutral') entry.s = symbol

      // key 冲突检测：同名但来自不同分区
      if (items[base]) {
        if (JSON.stringify(items[base]) !== JSON.stringify(entry)) {
          problems.keyConflicts.push(base)
        }
      }

      items[base] = entry
      const h = hash8(base)
      if (h) byHash[h] = base

      stat.kept++
      for (const pid of ['P1', 'P2', 'P3', 'P4', 'P5']) {
        if (personas[pid] >= 0.7) stat.perPersona[pid]++
      }
    }

    if (data.status === 'done' && partLabeled === 0) {
      problems.doneButEmpty.push(part)
    }
  }

  // 分类失衡告警
  const lowDist = []
  if (stat.kept >= 100) {
    for (const pid of ['P1', 'P2', 'P3', 'P4', 'P5']) {
      const pct = stat.byCategory[pid] / stat.kept
      if (pct < 0.05) {
        lowDist.push(pid + ' 仅占 ' + (pct * 100).toFixed(1) + '%')
      }
    }
  }

  const ready = stat.kept > 0
  // keepRate 的分母是「已标注数」，不是「图总数」—— 没标注的图不该算进淘汰率
  const keepRate = stat.labeled > 0 ? stat.keepOnly / stat.labeled : 0
  const poolRate = stat.labeled > 0 ? stat.kept / stat.labeled : 0

  const payload = {
    version: 2,
    fallback: !ready,
    generatedAt: new Date().toISOString(),
    source: {
      parts: stat.parts,
      partsDone: stat.partsDone,
      total: stat.total,
      labeled: stat.labeled,
      kept: stat.kept,
      unsure: stat.unsure,
      dropped: stat.dropped,
      noDesc: stat.noDesc,
      noTags: stat.noTags,
      noCategory: stat.noCategory
    },
    stats: stat.perPersona,
    byCategory: stat.byCategory,
    bySymbol: stat.bySymbol,
    items: items,
    hash: byHash
  }

  console.log('')
  console.log('=== persona.json 汇总 ===')
  console.log('分区总数        :', stat.parts)
  console.log('已完成分区      :', stat.partsDone)
  console.log('图总数          :', stat.total)
  console.log('已标注          :', stat.labeled)
  console.log('进入候选池      :', stat.kept, '(' + (poolRate * 100).toFixed(1) + '% / 已标注)')
  console.log('其中 keep       :', stat.keepOnly, '(' + (keepRate * 100).toFixed(1) + '% / 已标注)')
  console.log('unsure          :', stat.unsure)
  console.log('排除(drop/负能指):', stat.dropped)
  console.log('缺描述          :', stat.noDesc)
  console.log('缺标签          :', stat.noTags)
  console.log('缺分类          :', stat.noCategory)
  console.log('符号分布        :', JSON.stringify(stat.bySymbol))
  console.log('分类分布        :', JSON.stringify(stat.byCategory))
  console.log('各人格 >=0.7 数量:', JSON.stringify(stat.perPersona))

  // ===== 健康检查 =====
  const warnings = []

  if (problems.badParts.length) {
    warnings.push('损坏的 labels.json: ' + problems.badParts.length + ' 个')
    for (const p of problems.badParts.slice(0, 5)) {
      console.log('  x', p.part, '-', p.msg)
    }
  }

  if (problems.orphans.length) {
    warnings.push('孤儿标注(图不存在): ' + problems.orphans.length + ' 条')
    for (const o of problems.orphans.slice(0, 5)) {
      console.log('  x', o)
    }
  }

  if (problems.keyConflicts.length) {
    warnings.push('key 冲突(basename 重名): ' + problems.keyConflicts.length + ' 个')
    for (const k of problems.keyConflicts.slice(0, 5)) {
      console.log('  x', k)
    }
  }

  if (problems.doneButEmpty.length) {
    warnings.push('status=done 但一条都没填: ' + problems.doneButEmpty.length + ' 个分区')
  }

  if (lowDist.length) {
    warnings.push('分类失衡: ' + lowDist.join(', '))
  }

  if (ready && stat.labeled >= 50 && keepRate > 0.6) {
    warnings.push('keep 率 ' + (keepRate * 100).toFixed(0) + '% 偏高，淘汰门槛可能失效（预期 25%~40%）')
  }
  if (ready && stat.labeled >= 50 && keepRate < 0.15) {
    warnings.push('keep 率 ' + (keepRate * 100).toFixed(0) + '% 偏低，可能误杀好图（预期 25%~40%）')
  }

  console.log('')
  if (warnings.length) {
    console.log('=== 需要处理 ===')
    warnings.forEach((w, i) => console.log('  ' + (i + 1) + '. ' + w))
  } else {
    console.log('健康检查: 通过')
  }

  if (!ready) {
    console.log('')
    console.log('注意: 没有任何可用标注, 前端会走降级模式。')
    console.log('      把打标 AI 的 labels.json 覆盖回 Emoji/part*/ 后再跑一次即可。')
  }

  console.log('')

  if (DRY) {
    console.log('[dry] 未写入文件')
    if (STRICT && warnings.length) process.exitCode = 1
    return
  }

  const json = JSON.stringify(payload)
  fs.mkdirSync(path.dirname(OUT_WEB), { recursive: true })
  atomicWrite(OUT_ASSETS, json)
  atomicWrite(OUT_WEB, json)

  const kb = Math.round(json.length / 1024)
  console.log('已写入:', path.relative(ROOT, OUT_ASSETS), '(' + kb + ' KB)')
  console.log('已写入:', path.relative(ROOT, OUT_WEB), '(' + kb + ' KB)')

  if (STRICT && warnings.length) process.exitCode = 1
}

main()
