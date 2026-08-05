export const CODE_LANGUAGES = [
  ['plaintext', '纯文本'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['java', 'Java'],
  ['python', 'Python'],
  ['rust', 'Rust'],
  ['matlab', 'MATLAB / Octave'],
  ['javascript', 'JavaScript'],
]

export function getCodeLanguageLabel(language) {
  return CODE_LANGUAGES.find(([value]) => value === language)?.[1] || language || '纯文本'
}

const SNIPPETS = {
  python: [
    ['print', 'print()', 1, '输出内容'], ['input', 'input()', 1, '读取输入'], ['len', 'len()', 1, '获取长度'],
    ['range', 'range()', 1, '生成整数序列'], ['enumerate', 'enumerate()', 1, '带索引遍历'],
    ['list', 'list()', 1, '创建列表'], ['dict', 'dict()', 1, '创建字典'], ['set', 'set()', 1, '创建集合'],
    ['def', 'def function_name():\n    pass', 0, '定义函数'], ['class', 'class ClassName:\n    pass', 0, '定义类'],
    ['for', 'for item in iterable:\n    pass', 0, '循环'], ['if', 'if condition:\n    pass', 0, '条件判断'],
    ['try', 'try:\n    pass\nexcept Exception as error:\n    print(error)', 0, '异常处理'],
    ['import', 'import module', 0, '导入模块'], ['from', 'from module import name', 0, '从模块导入'],
  ],
  javascript: [
    ['console.log', 'console.log()', 1, '输出日志'], ['console.error', 'console.error()', 1, '输出错误'],
    ['document.querySelector', 'document.querySelector()', 1, '查询元素'], ['document.querySelectorAll', 'document.querySelectorAll()', 1, '查询多个元素'],
    ['parseInt', 'parseInt()', 1, '转换整数'], ['parseFloat', 'parseFloat()', 1, '转换浮点数'],
    ['function', 'function name() {\n  \n}', 2, '定义函数'], ['const', 'const name = ', 0, '定义常量'],
    ['let', 'let name = ', 0, '定义变量'], ['for', 'for (const item of items) {\n  \n}', 2, '循环'],
    ['if', 'if (condition) {\n  \n}', 2, '条件判断'], ['async', 'async function name() {\n  \n}', 2, '异步函数'],
    ['fetch', 'fetch(url)', 1, '网络请求'], ['JSON.stringify', 'JSON.stringify()', 1, '序列化 JSON'],
  ],
  c: [
    ['printf', 'printf("\\n");', 5, '格式化输出'], ['scanf', 'scanf("", &value);', 11, '读取输入'],
    ['main', 'int main(void) {\n    return 0;\n}', 0, '程序入口'], ['include', '#include <stdio.h>', 0, '包含头文件'],
    ['malloc', 'malloc(sizeof())', 2, '分配内存'], ['free', 'free()', 1, '释放内存'],
  ],
  cpp: [
    ['cout', 'std::cout << value << std::endl;', 8, '标准输出'], ['cin', 'std::cin >> value;', 6, '标准输入'],
    ['main', 'int main() {\n    return 0;\n}', 0, '程序入口'], ['include', '#include <iostream>', 0, '包含头文件'],
    ['vector', 'std::vector<int> values;', 0, '动态数组'], ['string', 'std::string value;', 0, '字符串'],
  ],
  java: [
    ['System.out.println', 'System.out.println();', 2, '输出并换行'], ['System.out.print', 'System.out.print();', 2, '输出'],
    ['main', 'public static void main(String[] args) {\n    \n}', 2, '程序入口'],
    ['class', 'public class Main {\n    \n}', 2, '定义类'], ['ArrayList', 'new ArrayList<>()', 1, '动态数组'],
  ],
  rust: [
    ['println', 'println!("");', 3, '输出并换行'], ['print', 'print!("");', 3, '输出'],
    ['main', 'fn main() {\n    \n}', 2, '程序入口'], ['Vec', 'Vec::new()', 1, '动态数组'],
    ['match', 'match value {\n    _ => {}\n}', 0, '模式匹配'], ['Result', 'Result<(), Box<dyn std::error::Error>>', 0, '结果类型'],
  ],
  matlab: [
    ['disp', 'disp()', 1, '显示内容'], ['fprintf', 'fprintf("\\n")', 3, '格式化输出'],
    ['length', 'length()', 1, '向量长度'], ['size', 'size()', 1, '矩阵尺寸'], ['plot', 'plot(x, y)', 0, '绘图'],
    ['function', 'function result = name(input)\n    result = input;\nend', 0, '定义函数'],
  ],
}

function currentToken(textBeforeCursor) {
  return String(textBeforeCursor || '').match(/[A-Za-z_][A-Za-z0-9_.]*$/)?.[0] || ''
}

export function getCodeCompletionCandidates(language, textBeforeCursor, limit = 8) {
  const token = currentToken(textBeforeCursor)
  if (!token) return []
  const lower = token.toLowerCase()
  return (SNIPPETS[language] || [])
    .map(([label, insert, cursorBack, detail], order) => ({ label, insert, cursorBack, detail, replaceLength: token.length, order }))
    .filter((item) => item.label.toLowerCase().startsWith(lower))
    .sort((a, b) => {
      const aExact = a.label.toLowerCase() === lower ? 0 : 1
      const bExact = b.label.toLowerCase() === lower ? 0 : 1
      return aExact - bExact || a.order - b.order
    })
    .slice(0, Math.max(1, limit))
    .map(({ order, ...item }) => item)
}

export function resolveCodeCompletion(language, textBeforeCursor) {
  const candidate = getCodeCompletionCandidates(language, textBeforeCursor, 1)[0]
  if (!candidate) return null
  return {
    insert: candidate.insert,
    cursorBack: candidate.cursorBack,
    replaceLength: candidate.replaceLength,
  }
}
