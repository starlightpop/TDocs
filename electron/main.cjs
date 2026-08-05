// TDocs 桌面端主进程（Electron）
const { app, BrowserWindow, Menu, shell, ipcMain, dialog, clipboard } = require('electron')
const fs = require('fs')
const path = require('path')
const { runCode } = require('./code-runner.cjs')

const isMac = process.platform === 'darwin'

/** 导出用完整 HTML 文档（带基础排版样式） */
function buildHtmlDoc(title, html) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${String(title).replace(/[<>&"]/g, '')}</title>
<style>
  body{max-width:820px;margin:40px auto;padding:0 24px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.75;color:#1c1e21}
  h1,h2,h3{line-height:1.3}
  img{max-width:100%}
  pre{background:#f1f3f6;padding:14px;border-radius:8px;overflow-x:auto}
  blockquote{border-left:3px solid #4f6ef7;margin-left:0;padding-left:16px;color:#555}
  table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px}
</style>
</head>
<body>
<h1>${String(title).replace(/[<>&"]/g, '')}</h1>
${html}
</body>
</html>`
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    // 仅 macOS 隐藏原生标题栏（保留左上角红绿灯），Windows/Linux 用系统默认标题栏
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          // 红绿灯垂直居中于顶栏（topbar 高 56，中心 28；默认位置偏上）
          trafficLightPosition: { x: 16, y: 20 },
        }
      : {}),
    backgroundColor: '#f5f6f8',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  win.once('ready-to-show', () => win.show())
  // 标记平台，供 CSS 针对 macOS 隐藏标题栏布局做适配（红绿灯避让 / 拖动区域）
  win.webContents.on('did-finish-load', () => {
    if (isMac) {
      win.webContents.executeJavaScript(`document.documentElement.classList.add('platform-mac')`)
    }
  })
  win.loadFile(path.join(__dirname, '../dist/index.html'))

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 使用系统原生编辑菜单，确保粘贴、匹配样式粘贴、拼写建议等行为与 macOS/Windows 一致。
  win.webContents.on('context-menu', (_event, params) => {
    const template = []
    if (params.misspelledWord) {
      for (const suggestion of (params.dictionarySuggestions || []).slice(0, 5)) {
        template.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) })
      }
      if ((params.dictionarySuggestions || []).length) template.push({ type: 'separator' })
      template.push({ label: '添加到词典', click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) })
      template.push({ type: 'separator' })
    }
    if (params.isEditable) {
      template.push(
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' },
        { role: 'delete' }, { type: 'separator' }, { role: 'selectAll' },
      )
    } else if (params.selectionText) {
      template.push({ role: 'copy' }, { type: 'separator' }, { role: 'selectAll' })
    }
    if (template.length) Menu.buildFromTemplate(template).popup({ window: win })
  })
}

// ---------- IPC：拖出导出 + PDF ----------
function registerIpc() {
  ipcMain.handle('run-code', async (_event, payload) => runCode(payload))
  ipcMain.handle('clipboard-read-text', () => clipboard.readText())
  ipcMain.handle('open-external', (_event, url) => {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) return shell.openExternal(url)
    return false
  })

  // 文件拖出窗口：写入临时 HTML 文件并交给系统拖拽
  ipcMain.handle('drag-export', async (event, { title, html }) => {
    const safeName = String(title || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
    const file = path.join(app.getPath('temp'), `${safeName}-tdocs.html`)
    await fs.promises.writeFile(file, buildHtmlDoc(title, html), 'utf8')
    const icon = path.join(__dirname, '../build/icon.png')
    event.sender.startDrag({ file, icon: fs.existsSync(icon) ? icon : undefined })
  })

  // 导出 PDF：隐藏窗口渲染 → printToPDF → 返回 Buffer
  ipcMain.handle('export-pdf', async (event, { title, html }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const pdfWin = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: { sandbox: true, contextIsolation: true },
    })
    try {
      await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildHtmlDoc(title, html)))
      const buf = await pdfWin.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
      return buf
    } finally {
      pdfWin.destroy()
    }
  })

  // 打开本地文件（系统对话框）：返回 [{name, content}]
  ipcMain.handle('open-files', async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!win) return []
    const res = await dialog.showOpenDialog(win, {
      title: '打开文档',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '文档', extensions: ['md', 'markdown', 'txt', 'html', 'htm'] }],
    })
    if (res.canceled || !res.filePaths?.length) return []
    const out = []
    for (const p of res.filePaths) {
      try {
        out.push({ name: path.basename(p), content: await fs.promises.readFile(p, 'utf8') })
      } catch { /* 跳过不可读文件 */ }
    }
    return out
  })
}

// 简洁应用菜单（保留系统快捷键能力）
function buildMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' }, // 复制/粘贴/撤销等编辑快捷键
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  buildMenu()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
