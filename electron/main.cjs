// TDocs 桌面端主进程（Electron）
const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('path')

const isMac = process.platform === 'darwin'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    // 仅 macOS 隐藏原生标题栏（保留左上角红绿灯），Windows/Linux 用系统默认标题栏
    ...(isMac ? { titleBarStyle: 'hiddenInset' } : {}),
    backgroundColor: '#f5f6f8',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
