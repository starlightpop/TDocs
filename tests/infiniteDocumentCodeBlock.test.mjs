import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const editor = readFileSync(new URL('../src/components/Editor.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8')
const headings = readFileSync(new URL('../src/lib/headings.js', import.meta.url), 'utf8')

test('code block keeps native newline behavior and a valid two-column DOM', () => {
  assert.match(editor, /\.\.\.this\.parent\?\.\(\)/)
  assert.doesNotMatch(editor, /pre\.append\(gutter, code\)/)
  assert.match(editor, /body\.append\(gutter, scroller\)/)
  assert.match(editor, /ignoreMutation: \(mutation\) => !code\.contains\(mutation\.target\)/)
  assert.match(css, /position: static !important;[\s\S]*grid-column: 1 !important/)
  assert.match(css, /grid-column: 2 !important/)
})

test('bounded document extends before its bottom enters the viewport', () => {
  assert.match(editor, /remaining < viewport \* 1\.75/)
  assert.match(editor, /setHeight\(current \+ viewport \* 3\)/)
  assert.match(css, /--infinite-document-min-height/)
  assert.match(css, /max\(4800px, calc\(100vh \* 5\)\)/)
})

test('heading navigation reserves a full tail and aligns the heading to canvas top', () => {
  assert.match(headings, /canvas\.scrollTo\(\{ top: targetTop, behavior: 'smooth' \}\)/)
  assert.match(headings, /canvas\.clientHeight \* 2\.25/)
  assert.doesNotMatch(headings, /chain\(\)\.focus\(\)\.setTextSelection/)
})
