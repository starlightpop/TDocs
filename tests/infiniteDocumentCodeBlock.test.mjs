import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const editor = readFileSync(new URL('../src/components/Editor.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8')

test('code block keeps native newline behavior and valid DOM structure', () => {
  assert.match(editor, /\.\.\.this\.parent\?\.\(\)/)
  assert.doesNotMatch(editor, /pre\.append\(gutter, code\)/)
  assert.match(editor, /body\.append\(gutter, scroller\)/)
  assert.match(editor, /ignoreMutation: \(mutation\) => !code\.contains\(mutation\.target\)/)
})

test('continuous document remains bounded but extends below every viewport', () => {
  assert.match(css, /min-height: max\(1800px, calc\(100vh \+ 900px\)\) !important/)
  assert.match(css, /\.main\[data-workspace="document"\] \.page-wrap/)
  assert.match(css, /white-space: pre !important/)
})
