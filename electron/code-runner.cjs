const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const MAX_CODE_BYTES = 256 * 1024
const MAX_OUTPUT_BYTES = 512 * 1024
const DEFAULT_TIMEOUT = 8000

const INSTALL_HELP = {
  python: {
    name: 'Python 3',
    url: 'https://www.python.org/downloads/',
    macCommand: '打开官方下载页安装 Python 3，完成后重新启动 TDocs。',
    winCommand: '从 Python.org 安装，并勾选 Add Python to PATH。',
    linuxCommand: '使用发行版包管理器安装 python3。',
  },
  c: {
    name: 'C 编译工具链',
    url: 'https://developer.apple.com/documentation/xcode/installing-the-command-line-tools',
    macCommand: 'xcode-select --install',
    winCommand: '安装 Visual Studio Build Tools 的“使用 C++ 的桌面开发”。',
    linuxCommand: '使用发行版包管理器安装 clang 或 gcc。',
  },
  cpp: {
    name: 'C++ 编译工具链',
    url: 'https://developer.apple.com/documentation/xcode/installing-the-command-line-tools',
    macCommand: 'xcode-select --install',
    winCommand: '安装 Visual Studio Build Tools 的“使用 C++ 的桌面开发”。',
    linuxCommand: '使用发行版包管理器安装 clang++ 或 g++。',
  },
  rust: {
    name: 'Rust',
    url: 'https://www.rust-lang.org/tools/install',
    macCommand: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
    winCommand: '从 Rust 官方页面下载并运行 rustup-init.exe。',
    linuxCommand: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
  },
  java: {
    name: 'Java JDK',
    url: 'https://adoptium.net/temurin/releases/',
    macCommand: '安装 JDK 后重新启动 TDocs，确认 javac 和 java 已加入 PATH。',
    winCommand: '安装 JDK 后重新启动 TDocs，确认 javac 和 java 已加入 PATH。',
    linuxCommand: '安装 JDK 17 或更高版本，并确认 javac 和 java 已加入 PATH。',
  },
  matlab: {
    name: 'GNU Octave 或 MATLAB',
    url: 'https://octave.org/download.html',
    macCommand: '安装 GNU Octave 或 MATLAB，并确保 octave 或 matlab 命令可在终端运行。',
    winCommand: '安装 GNU Octave 或 MATLAB，并确保 octave 或 matlab 命令可在终端运行。',
    linuxCommand: '使用发行版包管理器安装 octave，或配置现有 MATLAB。',
  },
}

function installHelp(language) {
  const item = INSTALL_HELP[language]
  if (!item) return null
  const platformKey = process.platform === 'darwin' ? 'macCommand' : process.platform === 'win32' ? 'winCommand' : 'linuxCommand'
  return {
    title: `缺少 ${item.name} 运行环境`,
    reason: `TDocs 为控制安装体积不会内置 ${item.name}。当前系统 PATH 中没有找到可用运行程序。`,
    url: item.url,
    command: item[platformKey],
  }
}

function normalizeLanguage(value) {
  const key = String(value || 'plaintext').toLowerCase()
  const aliases = {
    js: 'javascript',
    node: 'javascript',
    py: 'python',
    cxx: 'cpp',
    'c++': 'cpp',
    rs: 'rust',
    m: 'matlab',
    text: 'plaintext',
  }
  return aliases[key] || key
}

function normalizeSource(value) {
  const text = String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  while (lines.length && lines[0].trim() === '') lines.shift()
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  if (!lines.length) return ''

  const indents = lines
    .filter((line) => line.trim())
    .map((line) => (line.match(/^[ \t]*/) || [''])[0].length)
  const common = indents.length ? Math.min(...indents) : 0
  if (!common) return lines.join('\n')

  return lines.map((line) => {
    if (!line.trim()) return ''
    const leading = (line.match(/^[ \t]*/) || [''])[0].length
    return line.slice(Math.min(common, leading))
  }).join('\n')
}

function inferLanguage(code) {
  const text = String(code || '')
  if (/^\s*#include\s*</m.test(text)) return /std::|cout\s*<</.test(text) ? 'cpp' : 'c'
  if (/\bfn\s+main\s*\(/.test(text)) return 'rust'
  if (/\b(public\s+)?class\s+\w+|System\.out\./.test(text)) return 'java'
  if (/\bconsole\.(log|error)\s*\(|\b(const|let|var)\s+\w+|=>/.test(text)) return 'javascript'
  if (/^\s*(from\s+\w+\s+import|import\s+\w+)|\bprint\s*\(/m.test(text)) return 'python'
  return 'plaintext'
}

function cleanOutput(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\n$/, '')
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let timedOut = false
    let outputLimited = false
    let settled = false
    let timer = null
    let child = null

    const finish = (payload) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({
        ...payload,
        stdout: cleanOutput(stdout.toString('utf8')),
        stderr: cleanOutput(stderr.toString('utf8')),
        timedOut,
        outputLimited,
        durationMs: Date.now() - startedAt,
      })
    }

    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env || process.env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      finish({
        ok: false,
        missing: error?.code === 'ENOENT',
        exitCode: null,
        error: String(error?.message || error),
      })
      return
    }

    const append = (target, chunk) => {
      const next = Buffer.concat([target, Buffer.from(chunk)])
      if (next.length <= MAX_OUTPUT_BYTES) return next
      outputLimited = true
      child.kill('SIGKILL')
      return Buffer.concat([
        next.subarray(0, MAX_OUTPUT_BYTES),
        Buffer.from('\n[输出超过限制，程序已终止]'),
      ])
    }

    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk)
    })
    child.on('error', (error) => {
      finish({
        ok: false,
        missing: error?.code === 'ENOENT',
        exitCode: null,
        error: String(error?.message || error),
      })
    })
    child.on('close', (exitCode, signal) => {
      finish({
        ok: exitCode === 0 && !timedOut && !outputLimited,
        missing: false,
        exitCode,
        signal,
      })
    })

    const timeout = Math.min(30000, Math.max(500, Number(options.timeoutMs) || DEFAULT_TIMEOUT))
    timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeout)
  })
}

async function firstAvailable(candidates, options) {
  let last = null
  for (const candidate of candidates) {
    const result = await runProcess(candidate.command, candidate.args, {
      ...options,
      env: candidate.env || options?.env,
    })
    // 可用的判据：进程真实产出（输出/正确退出），或进程确实不存在（ENOENT）。
    // Windows 的 python Store 别名：能 spawn 但零输出且非零退出（如 9009）。
    // 仅在 Windows 上把这种“幽灵进程”视为不可用并继续尝试下一个候选；
    // Mac/Linux 上用户代码本身就可能零输出退出（如 sys.exit(1)），不能误判。
    const ghost = process.platform === 'win32' && !result.ok && !result.stdout && !result.stderr && !result.missing
    if (!result.missing && !ghost) {
      return { ...result, runtime: candidate.label || candidate.command }
    }
    last = result
  }
  if (last && last.missing) return last
  // 所有候选都失败（含“幽灵进程”）：统一视为环境缺失，触发安装指引。
  return {
    ok: false,
    missing: true,
    stdout: '',
    stderr: last?.error || '未找到可用的运行环境。',
    exitCode: last?.exitCode ?? null,
    error: last?.error,
  }
}

async function compileAndRun(compilers, executable, cwd, timeoutMs) {
  const compiled = await firstAvailable(compilers, { cwd, timeoutMs })
  if (!compiled.ok) return compiled
  const result = await runProcess(executable, [], { cwd, timeoutMs })
  return { ...result, runtime: compiled.runtime }
}

async function runCode(payload = {}) {
  const code = normalizeSource(payload.code || '')
  const requested = normalizeLanguage(payload.language)

  if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
    return {
      ok: false,
      language: requested,
      stdout: '',
      stderr: '代码超过 256 KB，已拒绝运行。',
      exitCode: null,
    }
  }

  const language = requested === 'plaintext' ? inferLanguage(code) : requested
  if (language === 'plaintext') {
    return {
      ok: false,
      language,
      stdout: '',
      stderr: '无法判断代码语言。请先在工具栏选择 Python、JavaScript 或其他语言。',
      exitCode: null,
    }
  }

  const timeoutMs = payload.timeoutMs
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tdocs-run-'))

  try {
    let result

    if (language === 'javascript') {
      const source = path.join(dir, 'main.cjs')
      await fs.promises.writeFile(source, code, 'utf8')
      result = await runProcess(process.execPath, [source], {
        cwd: dir,
        timeoutMs,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      })
      result.runtime = 'Node.js'
    } else if (language === 'python') {
      const source = path.join(dir, 'main.py')
      await fs.promises.writeFile(source, code, 'utf8')
      // Windows 上 py（Python Launcher）最可靠；python 可能是 Store 别名（能启动但跑不了）
      const candidates = process.platform === 'win32'
        ? [
            { command: process.env.TDOCS_PYTHON || 'py', args: ['-3', source], label: 'Python Launcher' },
            { command: 'python', args: [source], label: 'Python' },
          ]
        : [
            { command: process.env.TDOCS_PYTHON || 'python3', args: [source], label: 'Python 3' },
            { command: 'python', args: [source], label: 'Python' },
            { command: 'py', args: ['-3', source], label: 'Python Launcher' },
          ]
      result = await firstAvailable(candidates, { cwd: dir, timeoutMs })
    } else if (language === 'c' || language === 'cpp') {
      const ext = language === 'c' ? 'c' : 'cpp'
      const source = path.join(dir, `main.${ext}`)
      const executable = path.join(
        dir,
        process.platform === 'win32' ? 'tdocs-program.exe' : 'tdocs-program',
      )
      await fs.promises.writeFile(source, code, 'utf8')
      const names = language === 'c' ? ['cc', 'clang', 'gcc'] : ['c++', 'clang++', 'g++']
      result = await compileAndRun(
        names.map((command) => ({
          command,
          args: [source, '-o', executable],
          label: command,
        })),
        executable,
        dir,
        timeoutMs,
      )
    } else if (language === 'rust') {
      const source = path.join(dir, 'main.rs')
      const executable = path.join(
        dir,
        process.platform === 'win32' ? 'tdocs-program.exe' : 'tdocs-program',
      )
      await fs.promises.writeFile(source, code, 'utf8')
      result = await compileAndRun(
        [{ command: 'rustc', args: [source, '-o', executable], label: 'rustc' }],
        executable,
        dir,
        timeoutMs,
      )
    } else if (language === 'java') {
      const match =
        code.match(/\bpublic\s+class\s+([A-Za-z_$][\w$]*)/) ||
        code.match(/\bclass\s+([A-Za-z_$][\w$]*)/)
      const className = match?.[1] || 'Main'
      const sourceCode = match
        ? code
        : `public class Main { public static void main(String[] args) throws Exception {\n${code}\n} }`
      const source = path.join(dir, `${className}.java`)
      await fs.promises.writeFile(source, sourceCode, 'utf8')
      const compiled = await firstAvailable(
        [{ command: 'javac', args: [source], label: 'javac' }],
        { cwd: dir, timeoutMs },
      )
      result = compiled.ok
        ? await firstAvailable(
            [{ command: 'java', args: ['-cp', dir, className], label: 'Java' }],
            { cwd: dir, timeoutMs },
          )
        : compiled
    } else if (language === 'matlab') {
      const source = path.join(dir, 'main.m')
      await fs.promises.writeFile(source, code, 'utf8')
      const escaped = source.replace(/'/g, "''")
      result = await firstAvailable(
        [
          { command: 'octave', args: ['--quiet', '--no-gui', source], label: 'GNU Octave' },
          { command: 'matlab', args: ['-batch', `run('${escaped}')`], label: 'MATLAB' },
        ],
        { cwd: dir, timeoutMs },
      )
    } else {
      result = {
        ok: false,
        stdout: '',
        stderr: `当前版本没有配置 ${language} 的本地运行器。`,
        exitCode: null,
      }
    }

    if (result.missing) {
      const install = installHelp(language)
      result.stderr = install ? `${install.reason}\n${install.command}` : `本机没有安装 ${language} 运行环境，或运行程序不在 PATH 中。`
      result.install = install
    }

    return { language, ...result }
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

module.exports = {
  normalizeSource,
  inferLanguage,
  normalizeLanguage,
  installHelp,
  runCode,
}
