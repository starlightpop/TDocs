const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const MAX_CODE_BYTES = 256 * 1024
const MAX_OUTPUT_BYTES = 512 * 1024
const DEFAULT_TIMEOUT = 8000

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
    if (!result.missing) {
      return { ...result, runtime: candidate.label || candidate.command }
    }
    last = result
  }
  return last || {
    ok: false,
    missing: true,
    stdout: '',
    stderr: '未找到运行环境。',
    exitCode: null,
  }
}

async function compileAndRun(compilers, executable, cwd, timeoutMs) {
  const compiled = await firstAvailable(compilers, { cwd, timeoutMs })
  if (!compiled.ok) return compiled
  const result = await runProcess(executable, [], { cwd, timeoutMs })
  return { ...result, runtime: compiled.runtime }
}

async function runCode(payload = {}) {
  const code = String(payload.code || '')
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
      result = await firstAvailable(
        [
          { command: process.env.TDOCS_PYTHON || 'python3', args: [source], label: 'Python 3' },
          { command: 'python', args: [source], label: 'Python' },
          { command: 'py', args: ['-3', source], label: 'Python Launcher' },
        ],
        { cwd: dir, timeoutMs },
      )
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
      result.stderr = `本机没有安装 ${language} 运行环境，或运行程序不在 PATH 中。`
    }

    return { language, ...result }
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

module.exports = {
  inferLanguage,
  normalizeLanguage,
  runCode,
}
