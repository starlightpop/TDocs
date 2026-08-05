from pathlib import Path

path = Path('scripts/apply-ux-round3.py')
text = path.read_text(encoding='utf-8')
old = """def regex_once(text, pattern, replacement, label, flags=0):
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
"""
new = """def regex_once(text, pattern, replacement, label, flags=0):
    next_text, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=flags)
"""
if old not in text:
    raise SystemExit('regex_once helper patch point not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('UX round 3 escape handling repaired.')
