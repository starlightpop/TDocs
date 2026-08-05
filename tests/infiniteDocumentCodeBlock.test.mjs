import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const editor = readFileSync(new URL('../src/components/Editor.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8')
const headings = readFileSync(new URL('../src/lib/headings.js', import.meta.url), 'utf8')

test('code line numbers and source share exact line metrics', () => {
  assert.match(css, /--code-line-height: 28px/)
  assert.match(css, /--code-pad-y: 14px/)
  assert.match(css, /\.code-gutter,[\s\S]*\.code-editable[\s\S]*font-size: var\(--code-font-size\) !important/)
  assert.match(css, /flex: 0 0 var\(--code-line-height\) !important/)
})

test('document height is driven by content and viewport resize, never scrolling', () => {
  assert.match(editor, /const updateViewportReserve = \(\) =>/)
  assert.match(editor, /ResizeObserver\(updateViewportReserve\)/)
  assert.doesNotMatch(editor, /addEventListener\('scroll', ensureReserve/)
  assert.doesNotMatch(editor, /setHeight\(current \+ viewport \* 3\)/)
  assert.match(css, /padding-bottom: calc\(var\(--editor-viewport-height, 720px\) \+ 120px\)/)
})

test('heading navigation uses existing content tail without mutating page height', () => {
  assert.match(headings, /canvas\.scrollTo\(\{ top: targetTop, behavior: 'smooth' \}\)/)
  assert.doesNotMatch(headings, /--infinite-document-min-height/)
  assert.doesNotMatch(headings, /requiredHeight/)
})
