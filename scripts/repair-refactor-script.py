from pathlib import Path
import re

path = Path(__file__).resolve().parent / 'apply-document-only-release.py'
text = path.read_text(encoding='utf-8')
pattern = re.compile(r"editor = sub_once\(r\"  addAttributes\\\(\\\) \\\{\.\*\?\\n  \\\},\\n  addKeyboardShortcuts\", \"  addKeyboardShortcuts\", editor, 'code pagination attrs'\)\n")
text, count = pattern.subn('', text, count=1)
if count != 1:
    # Accept reruns where the unsafe line has already been removed.
    if "'code pagination attrs'" in text:
        raise RuntimeError('Unable to remove unsafe broad code-attribute regex')
path.write_text(text, encoding='utf-8')
print('refactor script constrained to CodeBlock scope')
