export const CODE_LANGUAGES = [
  ['plaintext', '纯文本'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['java', 'Java'],
  ['python', 'Python'],
  ['rust', 'Rust'],
  ['matlab', 'MATLAB'],
  ['javascript', 'JavaScript'],
]

export function getCodeLanguageLabel(language) {
  return CODE_LANGUAGES.find(([value]) => value === language)?.[1] || language || '纯文本'
}

const COMPLETIONS = {
  python: {
    pri: { insert: 'print()', cursorBack: 1 },
    len: { insert: 'len()', cursorBack: 1 },
    inp: { insert: 'input()', cursorBack: 1 },
    ran: { insert: 'range()', cursorBack: 1 },
  },
  javascript: {
    con: { insert: 'console.log()', cursorBack: 1 },
    doc: { insert: 'document.querySelector()', cursorBack: 1 },
    par: { insert: 'parseInt()', cursorBack: 1 },
  },
  c: {
    pri: { insert: 'printf("\\n");', cursorBack: 5 },
    sca: { insert: 'scanf("", &value);', cursorBack: 11 },
  },
  cpp: {
    cou: { insert: 'cout << value << endl;', cursorBack: 8 },
    cin: { insert: 'cin >> value;', cursorBack: 6 },
  },
  java: {
    sou: { insert: 'System.out.println();', cursorBack: 2 },
    pri: { insert: 'System.out.print();', cursorBack: 2 },
  },
  rust: {
    pri: { insert: 'println!("");', cursorBack: 3 },
    vec: { insert: 'Vec::new()', cursorBack: 1 },
  },
  matlab: {
    dis: { insert: 'disp()', cursorBack: 1 },
    len: { insert: 'length()', cursorBack: 1 },
  },
}

export function resolveCodeCompletion(language, textBeforeCursor) {
  const token = String(textBeforeCursor || '').match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0]
  if (!token) return null
  const hit = COMPLETIONS[language]?.[token]
  if (!hit) return null
  return { ...hit, replaceLength: token.length }
}
