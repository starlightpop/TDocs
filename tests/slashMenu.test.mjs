import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterCommands,
  groupFilteredCommands,
  indexToCommand,
  isValidTriggerContext,
  SLASH_CATEGORIES,
} from '../src/lib/slashCommands.js'

test('空查询返回所有命令', () => {
  const all = filterCommands('')
  assert.ok(all.length > 10, '应该有不少于 10 个基础命令')
  assert.ok(all.find((c) => c.id === 'h1'))
  assert.ok(all.find((c) => c.id === 'code'))
})

test('关键词匹配大小写不敏感', () => {
  const lower = filterCommands('heading')
  const upper = filterCommands('HEADING')
  assert.equal(lower.length, upper.length)
  assert.ok(lower.length > 0)
})

test('中文与英文同义词互相命中', () => {
  assert.ok(filterCommands('代码').find((c) => c.id === 'code'))
  assert.ok(filterCommands('code').find((c) => c.id === 'code'))
  assert.ok(filterCommands('codeblock').find((c) => c.id === 'code'))
  assert.ok(filterCommands('表格').find((c) => c.id === 'table'))
  assert.ok(filterCommands('table').find((c) => c.id === 'table'))
})

test('AI 命令聚类与品牌词命中', () => {
  const aiCmds = filterCommands('ai')
  assert.ok(aiCmds.length >= 5)
  assert.ok(aiCmds.every((c) => c.category === 'ai'))
})

test('多关键词以空格分隔时 AND 匹配', () => {
  const only = filterCommands('ai 润色')
  assert.ok(only.length >= 1, 'ai 润色 至少命中一条')
  assert.ok(only.find((c) => c.id === 'ai-polish'))
  assert.ok(!only.find((c) => c.id === 'ai-concise'), '精简不会和 润色 同时出现')
})

test('groupFilteredCommands 按分类聚合', () => {
  const grouped = groupFilteredCommands('ai')
  const ids = grouped.flatMap((g) => g.items.map((i) => i.id))
  assert.ok(ids.every((id) => id.startsWith('ai-')))
  // AI 是独立分类，结果只有 1 个 bucket
  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].id, 'ai')
})

test('indexToCommand 在跨分类的扁平索引里能反查', () => {
  const grouped = groupFilteredCommands('')
  const flatCount = grouped.reduce((n, b) => n + b.items.length, 0)
  assert.equal(flatCount, filterCommands('').length)
  const first = indexToCommand(grouped, 0)
  assert.ok(first)
  assert.equal(first.command.id, grouped[0].items[0].id)
})

test('isValidTriggerContext 屏蔽 codeBlock / 已选区', () => {
  assert.equal(isValidTriggerContext({ beforeText: '', inCodeBlock: false, hasSelection: false }), true)
  assert.equal(isValidTriggerContext({ beforeText: 'abc', inCodeBlock: false, hasSelection: false }), false, '行中触发应该被拒')
  assert.equal(isValidTriggerContext({ beforeText: ' ', inCodeBlock: false, hasSelection: false }), true)
  assert.equal(isValidTriggerContext({ beforeText: '', inCodeBlock: true, hasSelection: false }), false)
  assert.equal(isValidTriggerContext({ beforeText: '', inCodeBlock: false, hasSelection: true }), false)
})

test('SLASH_CATEGORIES 结构稳定', () => {
  const ids = SLASH_CATEGORIES.flatMap((c) => c.commands.map((cmd) => cmd.id))
  // 必须包含基础块
  for (const required of ['paragraph', 'h1', 'h2', 'h3', 'ul', 'ol', 'task', 'quote', 'code', 'hr', 'image', 'link', 'table']) {
    assert.ok(ids.includes(required), `分类里缺少 ${required}`)
  }
})
