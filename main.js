const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const AdmZip = require('adm-zip')

const WEIGHTS_FILE = path.join(app.getPath('userData'), 'meme-weights.json')
const TAGS_FILE = path.join(app.getPath('userData'), 'meme-tags.json')
const CONFIG_FILE = path.join(app.getPath('userData'), 'meme-config.json')
const INDEX_FILE = path.join(app.getPath('userData'), 'meme-index.json')
const ASSETS_DIR = path.join(app.getPath('userData'), 'assets')
const DEV_ASSETS_DIR = path.join(__dirname, 'assets')

let weights = {}
let memeTags = {}
let appConfig = { gridConfig: { rows: 1, cols: 1 } }
let memeIndex = []
let prefixSumCache = null
let cachedFiles = null
const validExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

function loadWeights() {
  try {
    if (fs.existsSync(WEIGHTS_FILE)) {
      weights = JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf-8'))
    }
  } catch (e) {
    weights = {}
  }
}

function saveWeights() {
  try {
    fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(weights, null, 2))
  } catch (e) {}
}

function loadTags() {
  try {
    if (fs.existsSync(TAGS_FILE)) {
      memeTags = JSON.parse(fs.readFileSync(TAGS_FILE, 'utf-8'))
    }
  } catch (e) {
    memeTags = {}
  }
}

function saveTags() {
  try {
    fs.writeFileSync(TAGS_FILE, JSON.stringify(memeTags, null, 2))
  } catch (e) {}
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      appConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      if (!appConfig.gridConfig) {
        appConfig.gridConfig = { rows: 1, cols: 1 }
      }
    }
  } catch (e) {
    appConfig = { gridConfig: { rows: 1, cols: 1 } }
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2))
  } catch (e) {}
}

function loadIndex() {
  try {
    if (fs.existsSync(INDEX_FILE)) {
      memeIndex = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'))
    }
  } catch (e) {
    memeIndex = []
  }
}

function saveIndex() {
  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(memeIndex, null, 2))
  } catch (e) {}
}

function scanAssetsDir() {
  const assetsPath = getAssetsPath()
  try {
    return fs.readdirSync(assetsPath).filter(file => {
      const ext = path.extname(file).toLowerCase()
      return validExts.includes(ext)
    })
  } catch (e) {
    return []
  }
}

function updateIndex() {
  const assetsPath = getAssetsPath()
  const currentFiles = scanAssetsDir()
  const indexSet = new Set(memeIndex)
  
  let changed = false
  
  for (const file of currentFiles) {
    if (!indexSet.has(file)) {
      memeIndex.push(file)
      changed = true
    }
  }
  
  const currentSet = new Set(currentFiles)
  const beforeLen = memeIndex.length
  memeIndex = memeIndex.filter(f => currentSet.has(f))
  if (memeIndex.length !== beforeLen) {
    changed = true
  }
  
  if (changed) {
    saveIndex()
  }
  
  return memeIndex
}

function buildPrefixSum(files) {
  const prefixSum = []
  let sum = 0
  for (let i = 0; i < files.length; i++) {
    sum += weights[files[i]] || 1
    prefixSum[i] = sum
  }
  return prefixSum
}

function binarySearchPrefix(prefixSum, target) {
  let left = 0
  let right = prefixSum.length - 1
  
  while (left < right) {
    const mid = Math.floor((left + right) / 2)
    if (prefixSum[mid] < target) {
      left = mid + 1
    } else {
      right = mid
    }
  }
  
  return left
}

function getWeightedRandomFile(files) {
  if (files.length === 0) return null
  
  const needRebuild = !prefixSumCache || 
                      cachedFiles !== files ||
                      prefixSumCache.length !== files.length
  
  if (needRebuild) {
    prefixSumCache = buildPrefixSum(files)
    cachedFiles = files
  }
  
  const totalWeight = prefixSumCache[prefixSumCache.length - 1]
  const random = Math.random() * totalWeight
  
  const index = binarySearchPrefix(prefixSumCache, random)
  return files[index]
}

function invalidateWeightCache() {
  prefixSumCache = null
  cachedFiles = null
}

function ensureAssetsDir() {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true })
  }
}

function getAssetsPath() {
  if (!app.isPackaged && fs.existsSync(DEV_ASSETS_DIR)) {
    return DEV_ASSETS_DIR
  }
  ensureAssetsDir()
  return ASSETS_DIR
}

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    resizable: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico')
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  loadWeights()
  loadTags()
  loadConfig()
  loadIndex()
  updateIndex()
  ensureAssetsDir()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('get-meme-list', () => {
  return memeIndex
})

ipcMain.handle('get-random-meme', (event, useWeight = true, filter = null, exclude = []) => {
  const assetsPath = getAssetsPath()
  
  if (memeIndex.length === 0) return null
  
  let files = memeIndex
  
  if (filter) {
    files = files.filter(file => {
      const tag = memeTags[file]
      if (!tag) return false
      
      if (filter.type === 'tag') {
        return tag.text && tag.text.toLowerCase().includes(filter.value.toLowerCase())
      } else if (filter.type === 'category') {
        return tag.category === filter.value
      }
      return false
    })
    
    if (files.length === 0) return null
    
    const excludeSet = new Set(exclude.map(p => path.basename(p)))
    files = files.filter(f => !excludeSet.has(f))
    
    if (files.length === 0) return null
    
    const randomFile = files[Math.floor(Math.random() * files.length)]
    return path.join(assetsPath, randomFile)
  }
  
  const excludeSet = new Set(exclude.map(p => path.basename(p)))
  files = files.filter(f => !excludeSet.has(f))
  
  if (files.length === 0) return null
  
  let randomFile
  if (useWeight && Object.keys(weights).length > 0) {
    randomFile = getWeightedRandomFile(files)
  } else {
    randomFile = files[Math.floor(Math.random() * files.length)]
  }
  
  return randomFile ? path.join(assetsPath, randomFile) : null
})

ipcMain.handle('increase-weight', (event, memePath) => {
  if (!memePath) return 1
  const fileName = path.basename(memePath)
  const currentWeight = weights[fileName] || 1
  weights[fileName] = Math.min(currentWeight + 1, 10)
  saveWeights()
  invalidateWeightCache()
  return weights[fileName]
})

ipcMain.handle('get-weight', (event, memePath) => {
  if (!memePath) return 1
  const fileName = path.basename(memePath)
  return weights[fileName] || 1
})

ipcMain.handle('get-tag', (event, memePath) => {
  if (!memePath) return null
  const fileName = path.basename(memePath)
  return memeTags[fileName] || null
})

ipcMain.handle('set-tag', (event, memePath, tag) => {
  if (!memePath) return
  const fileName = path.basename(memePath)
  if (tag && (tag.text || tag.category)) {
    memeTags[fileName] = tag
  } else {
    delete memeTags[fileName]
  }
  saveTags()
})

ipcMain.handle('search-memes', (event, searchType, query) => {
  const assetsPath = getAssetsPath()
  
  let results = []
  
  for (const file of memeIndex) {
    const tag = memeTags[file] || null
    
    let matches = false
    if (searchType === 'tag') {
      if (tag && tag.text && tag.text.toLowerCase().includes(query.toLowerCase())) {
        matches = true
      }
    } else if (searchType === 'category') {
      if (tag && tag.category) {
        const categoryNames = {
          'happy': ['快乐', '滑稽', 'happy'],
          'sad': ['悲伤', '委屈', 'sad'],
          'shock': ['震惊', '愤怒', 'shock'],
          'social': ['阴阳', '社交', 'social']
        }
        const names = categoryNames[tag.category] || []
        if (tag.category === query || names.some(n => n.includes(query))) {
          matches = true
        }
      }
    }
    
    if (matches) {
      results.push({
        name: file,
        path: path.join(assetsPath, file),
        tag: tag
      })
    }
  }
  
  return results
})

ipcMain.handle('import-zip', (event, zipPath) => {
  try {
    ensureAssetsDir()
    const zip = new AdmZip(zipPath)
    const entries = zip.getEntries()
    let count = 0
    
    entries.forEach(entry => {
      if (!entry.isDirectory) {
        const entryName = entry.entryName
        const ext = path.extname(entryName).toLowerCase()
        
        if (validExts.includes(ext)) {
          const fileName = path.basename(entryName)
          const destPath = path.join(ASSETS_DIR, fileName)
          
          if (!fs.existsSync(destPath)) {
            fs.writeFileSync(destPath, entry.getData())
            if (!memeIndex.includes(fileName)) {
              memeIndex.push(fileName)
            }
            count++
          }
        }
      }
    })
    
    if (count > 0) {
      saveIndex()
    }
    
    return { success: true, count }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('get-grid-config', () => {
  return appConfig.gridConfig || { rows: 1, cols: 1 }
})

ipcMain.handle('set-grid-config', (event, config) => {
  appConfig.gridConfig = {
    rows: Math.min(Math.max(1, config.rows), 6),
    cols: Math.min(Math.max(1, config.cols), 4)
  }
  saveConfig()
  return appConfig.gridConfig
})
