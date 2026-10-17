// gallery_server.js
// 标注成果的实时画廊 —— 只读，不改任何文件
//
//   node gallery_server.js          # http://127.0.0.1:8901
//   node gallery_server.js 9000     # 换端口
//
// 设计要点：
//   1. 每次请求都用 labels.json 的 mtime 指纹判断要不要重扫，改动即生效
//   2. 只收 status=done 的分区，pending 的不进画廊
//   3. 图片走 /img/<分区>/<文件名>，带路径穿越防护

const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const EMOJI = path.join(ROOT, 'Emoji')
const PAGE = path.join(ROOT, 'gallery.html')
const PORT = parseInt(process.argv[2], 10) || 8901

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.html': 'text/html; charset=utf-8'
}

// ---------- 扫描 ----------

let cache = { key: '', data: null }

function partDirs() {
  try {
    return fs.readdirSync(EMOJI).filter((n) => /^part[A-Z]\d+$/.test(n)).sort()
  } catch (e) {
    return []
  }
}

// 指纹 = 「labels.json 个数 : 最大 mtime」，任何一份被改都会变
function fingerprint(dirs) {
  let maxM = 0
  let n = 0
  for (const p of dirs) {
    try {
      const st = fs.statSync(path.join(EMOJI, p, 'labels.json'))
      n++
      if (st.mtimeMs > maxM) maxM = st.mtimeMs
    } catch (e) { /* 没有就不算 */ }
  }
  return n + ':' + Math.round(maxM)
}

function scan() {
  const dirs = partDirs()
  const fp = fingerprint(dirs)
  if (cache.data && cache.key === fp) return cache.data

  const parts = []
  const items = []

  for (const p of dirs) {
    let d
    try {
      d = JSON.parse(fs.readFileSync(path.join(EMOJI, p, 'labels.json'), 'utf8'))
    } catch (e) {
      continue
    }
    if (!d || d.status !== 'done') continue

    const fin = d.finished_at || ''
    const list = Array.isArray(d.items) ? d.items : []
    let keep = 0
    let drop = 0
    let unsure = 0

    for (const it of list) {
      if (!it || !it.file) continue
      const v = it.verdict || ''
      if (v === 'keep') keep++
      else if (v === 'drop') drop++
      else if (v === 'unsure') unsure++

      items.push({
        id: p + '/' + it.file,
        p,
        f: it.file,
        d: it.desc || '',
        c: it.category || '',
        t: Array.isArray(it.tags) ? it.tags : [],
        s: it.symbol || '',
        i: it.intensity || 0,
        m: it.mood || '',
        pp: it.personas || null,
        v,
        cf: typeof it.confidence === 'number' ? it.confidence : null,
        ng: Array.isArray(it.negatives) ? it.negatives : [],
        fin
      })
    }

    parts.push({ p, fin, n: list.length, keep, drop, unsure })
  }

  cache = { key: fp, data: { at: Date.now(), parts, items } }
  return cache.data
}

// ---------- HTTP ----------

function send(res, code, body, headers) {
  res.writeHead(code, headers || {})
  res.end(body)
}

const server = http.createServer((req, res) => {
  let pathname = '/'
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  } catch (e) {
    return send(res, 400, 'bad url')
  }

  // 首页
  if (pathname === '/' || pathname === '/index.html') {
    fs.readFile(PAGE, (err, buf) => {
      if (err) return send(res, 500, 'gallery.html 读不到: ' + err.message)
      send(res, 200, buf, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' })
    })
    return
  }

  // 数据
  if (pathname === '/api/items') {
    let data
    try {
      data = scan()
    } catch (e) {
      return send(res, 500, JSON.stringify({ error: e.message }), { 'Content-Type': 'application/json' })
    }
    send(res, 200, JSON.stringify(data), {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    })
    return
  }

  // 图片
  if (pathname.startsWith('/img/')) {
    const rel = pathname.slice(5)
    const full = path.resolve(EMOJI, rel)
    const root = path.resolve(EMOJI) + path.sep
    if (!full.startsWith(root)) return send(res, 403, 'forbidden')

    const ext = path.extname(full).toLowerCase()
    if (!MIME[ext]) return send(res, 403, 'not an image')

    fs.stat(full, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, 'not found')
      res.writeHead(200, {
        'Content-Type': MIME[ext],
        'Content-Length': st.size,
        'Cache-Control': 'public, max-age=3600'
      })
      fs.createReadStream(full).pipe(res)
    })
    return
  }

  send(res, 404, 'not found')
})

server.listen(PORT, '127.0.0.1', () => {
  const d = scan()
  console.log('')
  console.log('  标注画廊  →  http://127.0.0.1:' + PORT + '/')
  console.log('  已扫到 ' + d.parts.length + ' 个完成分区 / ' + d.items.length + ' 张图')
  console.log('  改动 labels.json 后刷新页面即可看到，无需重启')
  console.log('')
})

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用，换一个: node gallery_server.js 9000')
  } else {
    console.error('启动失败:', e.message)
  }
  process.exit(1)
})
