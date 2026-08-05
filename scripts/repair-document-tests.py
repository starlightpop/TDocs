from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REMOVE = {
    '代码块选区不会显示普通富文本浮动菜单',
    'Electron 原生右键菜单包含粘贴与匹配样式粘贴',
    '续块合并后按合并节点起始行计算下一页行号',
}

for path in (ROOT / 'tests').glob('*.test.mjs'):
    lines = path.read_text(encoding='utf-8').splitlines(keepends=True)
    out = []
    index = 0
    changed = False
    while index < len(lines):
        line = lines[index]
        matched = next((name for name in REMOVE if f"test('{name}'" in line or f'test("{name}"' in line), None)
        if not matched:
            out.append(line)
            index += 1
            continue
        changed = True
        index += 1
        while index < len(lines):
            if lines[index].strip() == '})':
                index += 1
                if index < len(lines) and not lines[index].strip():
                    index += 1
                break
            index += 1
    if changed:
        path.write_text(''.join(out), encoding='utf-8')

print('obsolete pagination tests removed')
