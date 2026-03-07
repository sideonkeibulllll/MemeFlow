const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const AdmZip = require('adm-zip')

const WEIGHTS_FILE = path.join(app.getPath('userData'), 'meme-weights.json')
const TAGS_FILE = path.join(app.getPath('userData'), 'meme-tags.json')
const ASSETS_DIR = path.join(app.getPath('userData'), 'assets')
const DEV_ASSETS_DIR = path.join(__dirname, 'assets')

let weights = {}
let memeTags = {}

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
    autoHideMenuBar: true
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  loadWeights()
  loadTags()
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
  const assetsPath = getAssetsPath()
  try {
    const files = fs.readdirSync(assetsPath).filter(file => {
      const ext = path.extname(file).toLowerCase()
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)
    })
    return files
  } catch (e) {
    return []
  }
})

ipcMain.handle('get-random-meme', (event, useWeight = true, filter = null) => {
  const assetsPath = getAssetsPath()
  let files
  try {
    files = fs.readdirSync(assetsPath).filter(file => {
      const ext = path.extname(file).toLowerCase()
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)
    })
  } catch (e) {
    return null
  }
  
  if (files.length === 0) return null
  
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
    
    const randomFile = files[Math.floor(Math.random() * files.length)]
    return path.join(assetsPath, randomFile)
  }
  
  if (useWeight && Object.keys(weights).length > 0) {
    const totalWeight = files.reduce((sum, file) => sum + (weights[file] || 1), 0)
    let random = Math.random() * totalWeight
    
    for (const file of files) {
      random -= (weights[file] || 1)
      if (random <= 0) {
        return path.join(assetsPath, file)
      }
    }
  }
  
  const randomFile = files[Math.floor(Math.random() * files.length)]
  return path.join(assetsPath, randomFile)
})

ipcMain.handle('increase-weight', (event, memePath) => {
  if (!memePath) return 1
  const fileName = path.basename(memePath)
  weights[fileName] = (weights[fileName] || 1) + 1
  saveWeights()
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
  let files
  try {
    files = fs.readdirSync(assetsPath).filter(file => {
      const ext = path.extname(file).toLowerCase()
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)
    })
  } catch (e) {
    return []
  }
  
  let results = []
  
  for (const file of files) {
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
    
    const validExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    
    entries.forEach(entry => {
      if (!entry.isDirectory) {
        const entryName = entry.entryName
        const ext = path.extname(entryName).toLowerCase()
        
        if (validExts.includes(ext)) {
          const fileName = path.basename(entryName)
          const destPath = path.join(ASSETS_DIR, fileName)
          
          if (!fs.existsSync(destPath)) {
            fs.writeFileSync(destPath, entry.getData())
            count++
          }
        }
      }
    })
    
    return { success: true, count }
  } catch (e) {
    return { success: false, error: e.message }
  }
})
