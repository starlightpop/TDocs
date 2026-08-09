// TDocs 应用内自更新模块（electron-updater 需要 macOS 代码签名，本项目未签名，
// 因此自研：检查 GitHub Releases → 下载平台更新包 → 退出后由外部脚本替换 → 重启）
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const REPO = 'starlightpop/TDocs'
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const HEADERS = { 'User-Agent': 'TDocs-Updater', Accept: 'application/vnd.github+json' }

/** 把 GitHub Release 直链转成国内镜像，避开科学上网限制。 */
function mirrorToDomestic(url) {
  if (!url) return url
  // https://github.com/starlightpop/TDocs/releases/download/v0.2.8/xxx.zip
  // →  https://ghfast.top/https://github.com/starlightpop/TDocs/releases/download/v0.2.8/xxx.zip
  const m = url.match(/^https:\/\/github\.com\/.+\/releases\/download\/v[\d.]+\/[^/]+$/)
  if (!m) return url
  return `https://ghfast.top/${url}`
}

/** 纯数字 semver 比较（0.2.2 < 0.2.10）。返回 1 / -1 / 0。 */
function semverCompare(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

/** 按平台找更新资产：Mac 用 arm64-mac.zip（含 TDocs.app），Windows 用 Setup.exe（NSIS 静默安装）。 */
function findAsset(release) {
  const tag = String(release.tag_name || '').replace(/^v/i, '')
  const expected = process.platform === 'darwin' ? `TDocs-${tag}-arm64-mac.zip` : `TDocs-${tag}-Setup.exe`
  return (release.assets || []).find((a) => a.name === expected)
}

async function getLatestRelease() {
  const res = await fetch(API_URL, { headers: HEADERS })
  if (!res.ok) throw new Error(`GitHub API 请求失败（HTTP ${res.status}）`)
  return res.json()
}

/** 检查是否有新版本。无更新时返回 hasUpdate:false。 */
async function checkForUpdates() {
  const release = await getLatestRelease()
  const remote = String(release.tag_name || '').replace(/^v/i, '')
  const current = app.getVersion()
  if (!remote || semverCompare(remote, current) <= 0) {
    return { hasUpdate: false, current, latest: remote || current }
  }
  const asset = findAsset(release)
  return {
    hasUpdate: true,
    current,
    latest: remote,
    notes: String(release.body || '').slice(0, 4000),
    assetName: asset?.name || '',
    assetUrl: mirrorToDomestic(asset?.browser_download_url || ''),
    size: asset?.size || 0,
  }
}

/** 下载更新包到 userData/updates/，实时回调进度（0-100，未知为 -1）。 */
async function downloadUpdate(assetUrl, filename, onProgress) {
  const dir = path.join(app.getPath('userData'), 'updates')
  await fs.promises.mkdir(dir, { recursive: true })
  const target = path.join(dir, filename)
  const tmp = target + '.download'
  const res = await fetch(assetUrl, { headers: HEADERS })
  if (!res.ok) throw new Error(`下载更新失败（HTTP ${res.status}）`)
  const total = Number(res.headers.get('content-length')) || 0
  let received = 0
  const out = fs.createWriteStream(tmp)
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out.write(Buffer.from(value))
    received += value.length
    onProgress?.(total ? Math.round((received / total) * 100) : -1, received, total)
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())))
  await fs.promises.rename(tmp, target)
  return target
}

/** macOS：解压 zip 替换 /Applications/TDocs.app。由独立脚本在应用退出后执行。 */
function applyMacUpdate(zipPath) {
  const appRoot = path.dirname(path.dirname(path.dirname(app.getPath('exe')))) // .../TDocs.app
  const updatesDir = path.join(app.getPath('userData'), 'updates')
  const script = path.join(updatesDir, 'apply-update.sh')
  const content = `#!/bin/bash
# TDocs 自更新脚本（由应用生成，运行在应用退出后）
APP="$1"
ZIP="$2"
sleep 1
pkill -9 -f "TDocs.app/Contents/MacOS" 2>/dev/null || true
sleep 1
TMP="\${APP}.updating"
rm -rf "\${TMP}"
if ! unzip -q "\${ZIP}" -d "\${TMP}"; then
  rm -rf "\${TMP}"
  open "\${APP}" || true
  exit 1
fi
rm -rf "\${APP}"
if [ -d "\${TMP}/TDocs.app" ]; then
  mv "\${TMP}/TDocs.app" "\${APP}"
  rm -rf "\${TMP}"
else
  mv "\${TMP}" "\${APP}"
fi
rm -f "\${ZIP}"
open "\${APP}"
`
  fs.writeFileSync(script, content, { mode: 0o755 })
  spawn('/bin/bash', [script, appRoot, zipPath], { detached: true, stdio: 'ignore' }).unref()
}

/** Windows：NSIS 静默安装（/S）。等待应用退出后由脚本启动安装器。 */
function applyWinUpdate(exePath) {
  const updatesDir = path.join(app.getPath('userData'), 'updates')
  const script = path.join(updatesDir, 'apply-update.bat')
  const content = `@echo off
timeout /t 2 /nobreak >nul
start "" /wait "${exePath}" /S
`
  fs.writeFileSync(script, content)
  spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
}

module.exports = { checkForUpdates, downloadUpdate, applyMacUpdate, applyWinUpdate, semverCompare }
