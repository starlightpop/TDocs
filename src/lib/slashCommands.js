// / 命令面板的数据源 + 过滤逻辑（纯函数，便于测试）。
//
// 命令执行需要访问 editor 实例，因此这里只描述"做什么"，
// 由 SlashMenu 组件在执行时把 run() 包装成具体的 editor.chain().focus() 调用。

// 触发位置必须满足"前一个字符是空格 / 行首 / 标点"，
// 但飞书/Notion 的实际规则会直接禁止在 code / image / 已选中文字时触发。
// 这里给的是"提示位置是否合法"的判定，供浮层做开关。
export function isValidTriggerContext({ beforeText, inCodeBlock = false, hasSelection = false }) {
  if (inCodeBlock) return false
  if (hasSelection) return false
  if (!beforeText) return true
  // 紧邻 / 的左侧必须是空白或行首
  return /(^|\s)$/.test(beforeText)
}

export const SLASH_CATEGORIES = [
  {
    id: 'base',
    label: '基础',
    commands: [
      { id: 'paragraph', title: '正文', keywords: ['paragraph', 'text', '正文', '段落', 'p'], run: 'setParagraph' },
      { id: 'h1', title: '标题 1', keywords: ['h1', 'heading 1', '标题1', '一级标题', 'heading'], run: 'setHeading', runArgs: { level: 1 } },
      { id: 'h2', title: '标题 2', keywords: ['h2', 'heading 2', '标题2', '二级标题'], run: 'setHeading', runArgs: { level: 2 } },
      { id: 'h3', title: '标题 3', keywords: ['h3', 'heading 3', '标题3', '三级标题'], run: 'setHeading', runArgs: { level: 3 } },
      { id: 'h4', title: '标题 4', keywords: ['h4', 'heading 4', '标题4', '四级标题'], run: 'setHeading', runArgs: { level: 4 } },
      { id: 'h5', title: '标题 5', keywords: ['h5', 'heading 5', '标题5', '五级标题'], run: 'setHeading', runArgs: { level: 5 } },
      { id: 'h6', title: '标题 6', keywords: ['h6', 'heading 6', '标题6', '六级标题'], run: 'setHeading', runArgs: { level: 6 } },
    ],
  },
  {
    id: 'list',
    label: '列表',
    commands: [
      { id: 'ul', title: '无序列表', keywords: ['ul', 'bullet', '无序', '列表', 'unordered list'], run: 'toggleBulletList' },
      { id: 'ol', title: '有序列表', keywords: ['ol', 'ordered', '有序', '数字列表', 'numbered list'], run: 'toggleOrderedList' },
      { id: 'task', title: '任务清单', keywords: ['task', 'todo', '任务', '清单', 'checkbox'], run: 'toggleTaskList' },
    ],
  },
  {
    id: 'block',
    label: '块',
    commands: [
      { id: 'quote', title: '引用', keywords: ['quote', '引用', 'blockquote'], run: 'toggleBlockquote' },
      { id: 'code', title: '代码块', keywords: ['code', 'codeblock', '代码', '代码块', 'pre'], run: 'setCodeBlock' },
      { id: 'hr', title: '分割线', keywords: ['hr', 'divider', '分割线', '分隔线', 'horizontal'], run: 'setHorizontalRule' },
    ],
  },
  {
    id: 'media',
    label: '媒体',
    commands: [
      { id: 'image', title: '图片', keywords: ['image', 'img', '图片', 'photo', 'picture'], run: 'promptImage' },
      { id: 'link', title: '链接', keywords: ['link', 'url', '链接', '超链接'], run: 'promptLink' },
      { id: 'table', title: '表格', keywords: ['table', '表格', 'grid'], run: 'insertTable' },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    commands: [
      { id: 'ai-polish', title: 'AI · 润色', keywords: ['ai', '润色', 'polish', 'improve'], run: 'aiQuickAction', runArgs: { preset: '润色' } },
      { id: 'ai-concise', title: 'AI · 精简', keywords: ['ai', '精简', 'concise', 'shorten'], run: 'aiQuickAction', runArgs: { preset: '精简' } },
      { id: 'ai-expand', title: 'AI · 扩写', keywords: ['ai', '扩写', 'expand', 'elaborate'], run: 'aiQuickAction', runArgs: { preset: '扩写' } },
      { id: 'ai-formal', title: 'AI · 正式', keywords: ['ai', '正式', 'formal', 'professional'], run: 'aiQuickAction', runArgs: { preset: '正式' } },
      { id: 'ai-casual', title: 'AI · 口语', keywords: ['ai', '口语', 'casual', 'spoken'], run: 'aiQuickAction', runArgs: { preset: '口语' } },
    ],
  },
  {
    id: 'misc',
    label: '其他',
    commands: [
      { id: 'clear', title: '清除格式', keywords: ['clear', '清除', '格式', 'reset format'], run: 'clearFormat' },
      { id: 'find', title: '查找', keywords: ['find', 'search', '查找', '搜索'], run: 'openFind' },
      { id: 'history', title: '版本历史', keywords: ['history', 'version', '历史', '版本'], run: 'openHistory' },
      { id: 'export', title: '导出', keywords: ['export', '导出', 'download'], run: 'openExport' },
    ],
  },
]

// 拼成扁平列表（带分类信息），方便循环渲染。
export function flattenCommands(categories = SLASH_CATEGORIES) {
  const out = []
  for (const category of categories) {
    for (const command of category.commands) {
      out.push({ ...command, category: category.id, categoryLabel: category.label })
    }
  }
  return out
}

// 关键词归一化：小写 + 去空格。
function normalizeKeyword(keyword) {
  return String(keyword || '').toLowerCase().trim()
}

function commandMatches(command, terms) {
  if (!terms.length) return true
  const haystacks = [normalizeKeyword(command.title), ...(command.keywords || []).map(normalizeKeyword)]
  // AND 关系：每个 term 都必须在至少一个关键词里命中
  return terms.every((term) => haystacks.some((field) => field.includes(term)))
}

// 主过滤：query 不带前缀 "/"
// - 空查询返回全部
// - 多关键词用空格分隔，AND 匹配
// - 大小写不敏感
export function filterCommands(query, commands = flattenCommands(), categories = SLASH_CATEGORIES) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) {
    return commands.map((cmd) => ({ ...cmd }))
  }
  const terms = q.split(/\s+/).filter(Boolean)
  return commands
    .filter((cmd) => commandMatches(cmd, terms))
    .map((cmd) => ({ ...cmd }))
}

// 分组过滤结果，方便浮层按分类渲染。
export function groupFilteredCommands(query, categories = SLASH_CATEGORIES) {
  const all = filterCommands(query, flattenCommands(categories), categories)
  const buckets = categories.map((cat) => ({
    id: cat.id,
    label: cat.label,
    items: all.filter((cmd) => cmd.category === cat.id),
  }))
  return buckets.filter((b) => b.items.length)
}

// 在分组结果里按 index 拿绝对位置（键盘导航用）。
export function indexToCommand(grouped, absoluteIndex) {
  let cursor = 0
  for (const bucket of grouped) {
    if (absoluteIndex < cursor + bucket.items.length) {
      return { bucket, command: bucket.items[absoluteIndex - cursor] }
    }
    cursor += bucket.items.length
  }
  return null
}

// 把绝对 index 反查回 (bucketIndex, itemIndex)，用于分组里的高亮。
export function commandToIndex(grouped, commandId) {
  let cursor = 0
  for (let b = 0; b < grouped.length; b += 1) {
    for (let i = 0; i < grouped[b].items.length; i += 1) {
      if (grouped[b].items[i].id === commandId) return cursor
      cursor += 1
    }
  }
  return 0
}
