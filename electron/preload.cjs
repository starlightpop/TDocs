// TDocs preload：向渲染进程安全暴露桌面能力（IPC）
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tdocs', {
  // 文件拖出窗口：写临时文件并交给系统拖拽
  dragExport: (payload) => ipcRenderer.invoke('drag-export', payload),
  // 导出 PDF：主进程渲染后返回 PDF 字节
  exportPdf: (payload) => ipcRenderer.invoke('export-pdf', payload),
  // 打开本地文件（系统对话框），返回 [{name, content}]
  openFiles: () => ipcRenderer.invoke('open-files'),
  // 在独立本地进程中运行当前代码块，返回 stdout / stderr / exitCode。
  runCode: (payload) => ipcRenderer.invoke('run-code', payload),
})
