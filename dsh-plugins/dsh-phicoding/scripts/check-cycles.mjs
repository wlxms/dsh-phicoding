// Dependency-cycle check for a C# source tree.
//
// Two filters keep the graph honest, both learned from real false positives:
//
// 1. COMMENTS are stripped before the reference scan. A type name inside a
//    comment is documentation, not a dependency.
// 2. IDENTIFIERS THAT ONLY LOOK LIKE TYPES are dropped. A member named after a
//    type produces an identical token, and a checker that matches tokens alone
//    invents edges that do not exist. Six real incidents:
//
//      private readonly Dictionary<Slot, Item> worn;   Slot     real (generic arg)
//      public string Slot { get; set; }                Slot     NOT a reference
//      Attributes.Set(key, value)                      Set      NOT a reference
//      public int Set(string k)                        Set      NOT a reference
//      Value.Plus() / Value.Scale()                    Plus     NOT a reference
//      Dice.Roll() / Sheet.Tag()                       Roll     NOT a reference
//
//    So a token counts as a reference only when it is none of: a member access
//    (preceded by "."), a call or declaration (followed by "(" unless "new"),
//    or a declared name (preceded by a non-keyword identifier and followed by a
//    declaration tail).
//
// Ambiguity is reported, never silently resolved. Two files can both contain a
// declaration matching a name (a top-level type and a nested one sharing it),
// and a Map keyed by name alone would silently keep just one of them - which is
// how a checker starts missing edges while still printing a green result.
// For a safety check the conservative bias is right: an ambiguous name adds
// edges to every candidate file, so it can only over-report, never hide a cycle.
//
// Usage: node check-cycles.mjs <source dir>   (exit 1 when a cycle exists)
//        node check-cycles.mjs --selftest     (exit 0 when every case holds)
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

// C# modifiers and keywords that may sit between a declaration's start and the
// declared type. A token preceded by one of these is a type, not a name.
const KEYWORDS = new Set([
  'public', 'private', 'protected', 'internal', 'static', 'readonly', 'sealed',
  'abstract', 'virtual', 'override', 'partial', 'const', 'new', 'using',
  'namespace', 'return', 'in', 'out', 'ref', 'params', 'this', 'base', 'var',
  'where', 'get', 'set', 'init', 'required', 'event', 'delegate', 'unsafe',
  'extern', 'volatile', 'async', 'await', 'if', 'for', 'foreach', 'while',
  'switch', 'case', 'throw', 'is', 'as', 'typeof', 'sizeof', 'nameof', 'default',
  'true', 'false', 'null',
  // A type follows these, so they do not mark the next token as a declared name.
  'class', 'struct', 'interface', 'record', 'enum',
  // Primitive type names (int, string, ...) are deliberately NOT listed above.
  // "string Slot" means string is the declared type and Slot is the name being
  // declared, so a primitive in front of a token is exactly what marks it as a
  // name rather than a reference.
  'void'
])

// Is this occurrence of `type` a real type reference, or a namesake?
function isReference(text, index, type) {
  const before = text.slice(Math.max(0, index - 32), index)
  const after = text.slice(index + type.length, index + type.length + 32)

  // a member access: obj.Slot, Attributes.Set, Dice.Roll
  if (/\.\s*$/.test(before)) return false

  // a call or a method declaration: Set(...), Roll(...) - but not new Sword(...)
  if (/^\s*\(/.test(after) && !/\bnew\s+$/.test(before)) return false

  // a declared name: the previous token is the declared type, and this token
  // opens a body, ends a statement, or takes a value
  const previous = before.match(/([A-Za-z_]\w*)\s*$/)
  if (previous && !KEYWORDS.has(previous[1]) && /^\s*(\{|;|=|=>|\()/.test(after)) return false

  return true
}

function references(text, type) {
  const pattern = new RegExp(`\\b${type}\\b`, 'g')
  for (const m of text.matchAll(pattern)) {
    if (isReference(text, m.index, type)) return true
  }
  return false
}

// ── self test: every case below is a real incident from this project ─────────
const CASES = [
  ['private readonly Dictionary<Slot, Item> worn = new();', 'Slot', true, '泛型参数里的类型'],
  ['public string Slot { get; set; } = "";', 'Slot', false, '成员声明名撞类型名'],
  ['Attributes.Set(key, value);', 'Set', false, '方法调用撞类型名'],
  ['public int Set(string k) => 0;', 'Set', false, '方法声明撞类型名'],
  ['Value.Plus(1);', 'Plus', false, '成员访问撞类型名'],
  ['Value.Scale(120);', 'Scale', false, '成员访问撞类型名'],
  ['Dice.Roll();', 'Roll', false, '成员访问撞类型名'],
  ['Sheet.Tag("x");', 'Tag', false, '成员访问撞类型名'],
  ['item.Slot.Apply(sheet);', 'Slot', false, '链式成员访问'],
  ['new Sword("木棍", 1);', 'Sword', true, '构造调用'],
  ['Slot Hand = new Slot("手");', 'Slot', true, '字段类型是第一个标识符'],
  ['var x = typeof(Slot);', 'Slot', true, 'typeof 里'],
  ['public sealed class Slot { }', 'Slot', true, '类型声明本身'],
  ['Suit? suit = null;', 'Suit', true, '可空类型'],
  ['return new Thing(Name);', 'Thing', true, '返回构造']
]

if (process.argv[2] === '--selftest') {
  let bad = 0
  for (const [text, type, want, why] of CASES) {
    const got = references(text, type)
    const ok = got === want
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${type.padEnd(7)} want=${String(want).padEnd(5)} got=${String(got).padEnd(5)} ${why}`)
  }
  console.log(bad === 0 ? `SELFTEST=PASS  ${CASES.length} cases` : `SELFTEST=FAIL  ${bad} of ${CASES.length}`)
  process.exit(bad === 0 ? 0 : 1)
}

const root = process.argv[2]
if (!root) {
  console.error('usage: node check-cycles.mjs <source dir> | --selftest')
  process.exit(2)
}

const skip = new Set(['bin', 'obj', 'node_modules', '.git'])
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

async function sources(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (skip.has(entry.name)) continue
      found.push(...await sources(path))
      continue
    }
    if (entry.name.endsWith('.cs')) found.push(path)
  }
  return found.sort()
}

const files = await sources(root)
const decl = new Map()
const body = new Map()

for (const file of files) {
  const text = strip(await readFile(file, 'utf8'))
  body.set(file, text)
  for (const m of text.matchAll(/^(?:public |internal |sealed |abstract |static |partial )*(?:class|struct|interface|record) ([A-Z]\w*)/gm)) {
    if (!decl.has(m[1])) decl.set(m[1], new Set())
    decl.get(m[1]).add(file)
  }
}

const ambiguous = [...decl].filter(([, owners]) => owners.size > 1)

const edges = new Map(files.map((file) => [file, new Set()]))
for (const file of files) {
  for (const [type, owners] of decl) {
    if (owners.size === 1 && owners.has(file)) continue
    if (!references(body.get(file), type)) continue
    for (const owner of owners) {
      if (owner !== file) edges.get(file).add(owner)
    }
  }
}

const state = new Map()
const stack = []
const cycles = []

function visit(file) {
  const seen = state.get(file) ?? 0
  if (seen === 2) return
  if (seen === 1) {
    cycles.push(stack.slice(stack.indexOf(file)).concat(file).map((f) => relative(root, f)).join('  ->  '))
    return
  }
  state.set(file, 1)
  stack.push(file)
  for (const next of edges.get(file)) visit(next)
  stack.pop()
  state.set(file, 2)
}

for (const file of files) visit(file)

const linked = [...edges].filter(([, to]) => to.size > 0)
const count = linked.reduce((n, [, to]) => n + to.size, 0)
console.log(`files=${files.length}  types=${decl.size}  edges=${count}`)
for (const [from, to] of linked) {
  console.log(`  ${relative(root, from)}  ->  ${[...to].map((f) => relative(root, f)).join(', ')}`)
}

if (ambiguous.length > 0) {
  console.log('')
  for (const [type, owners] of ambiguous) {
    console.log(`AMBIGUOUS  ${type}  ->  ${[...owners].map((f) => relative(root, f)).join(', ')}`)
  }
  console.log(`AMBIGUOUS=${ambiguous.length}  (edges were added to every candidate)`)
}

if (cycles.length === 0) {
  console.log('CYCLES=0')
  process.exit(0)
}

console.log('')
for (const cycle of cycles) console.log('CYCLE  ' + cycle)
console.log(`CYCLES=${cycles.length}`)
process.exit(1)
