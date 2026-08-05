import fs from 'node:fs'

const file = 'src/components/Editor.jsx'
let source = fs.readFileSync(file, 'utf8')

if (source.includes("import { createLowlight, common } from 'lowlight'")) {
  source = source.replace(
    "import { createLowlight, common } from 'lowlight'\nimport matlab from 'highlight.js/lib/languages/matlab'",
    `import { createLowlight } from 'lowlight'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import matlab from 'highlight.js/lib/languages/matlab'`,
  )
  source = source.replace(
    "const lowlight = createLowlight(common)\nlowlight.register('matlab', matlab)",
    `const lowlight = createLowlight()
lowlight.register('c', c)
lowlight.register('cpp', cpp)
lowlight.register('java', java)
lowlight.register('javascript', javascript)
lowlight.register('python', python)
lowlight.register('rust', rust)
lowlight.register('matlab', matlab)`,
  )
  fs.writeFileSync(file, source)
}

console.log('TDocs syntax-highlighting bundle optimized.')
