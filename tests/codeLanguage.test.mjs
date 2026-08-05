import test from 'node:test'
import assert from 'node:assert/strict'
import { getCodeLanguageLabel, resolveCodeCompletion } from '../src/lib/codeLanguage.js'

test('代码语言标签与代码块选择器一致', () => {
  assert.equal(getCodeLanguageLabel('python'), 'Python')
  assert.equal(getCodeLanguageLabel('javascript'), 'JavaScript')
})

test('Python 常用函数可通过 Tab 补全', () => {
  assert.deepEqual(resolveCodeCompletion('python', 'pri'), {
    insert: 'print()', cursorBack: 1, replaceLength: 3,
  })
})

test('未知前缀不进行破坏性补全', () => {
  assert.equal(resolveCodeCompletion('python', 'unknown_name'), null)
})
