// Shared primitives for reading a C# type graph from source.
//
// Two things here were WRONG in the first version of check-cycles.mjs, and both
// failed GREEN rather than loudly:
//
//   1. The type scan was anchored to the start of a line. A block-scoped
//      namespace indents every type, so the scan found nothing and printed
//      types=0 edges=0 CYCLES=0 - a clean bill of health for a graph it never
//      looked at. The scan is now position-independent.
//   2. The declaration alternatives missed `record struct` / `record class`.
//      Core/Check.cs declares `readonly record struct Trial`, which was simply
//      absent from the type set, so every edge pointing at it was missed.
//
// A checker that goes blind is worse than no checker, because the result looks
// the same as success.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const SKIP = new Set(['bin', 'obj', 'node_modules', '.git'])

export const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

export async function sources(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue
      found.push(...await sources(path))
      continue
    }
    if (entry.name.endsWith('.cs')) found.push(path)
  }
  return found.sort()
}

// C# modifiers and keywords that may sit between the start of a declaration and
// the declared type. A token preceded by one of these is a type, not a name.
//
// Primitive type names (int, string, ...) are deliberately NOT listed: in
// "string Slot", string is the declared type and Slot is the name, so a
// primitive in front of a token is exactly what marks it as a name.
const KEYWORDS = new Set([
  'public', 'private', 'protected', 'internal', 'static', 'readonly', 'sealed',
  'abstract', 'virtual', 'override', 'partial', 'const', 'new', 'using',
  'namespace', 'return', 'in', 'out', 'ref', 'params', 'this', 'base', 'var',
  'where', 'get', 'set', 'init', 'required', 'event', 'delegate', 'unsafe',
  'extern', 'volatile', 'async', 'await', 'if', 'for', 'foreach', 'while',
  'switch', 'case', 'throw', 'is', 'as', 'typeof', 'sizeof', 'nameof', 'default',
  'true', 'false', 'null', 'void',
  // a type follows these, so they do not mark the next token as a name
  'class', 'struct', 'interface', 'record', 'enum'
])

// Is this occurrence of `type` a real reference, or a namesake?
//
// Six real incidents, all of which used to invent edges:
//   private readonly Dictionary<Slot, Item> worn;   Slot   real (generic arg)
//   public string Slot { get; set; }                Slot   a declared name
//   Attributes.Set(key, value)                      Set    a member access
//   public int Set(string k)                        Set    a declaration
//   Value.Plus() / Value.Scale()                    Plus   a member access
//   Dice.Roll() / Sheet.Tag()                       Roll   a member access
export function isReference(text, index, type) {
  const before = text.slice(Math.max(0, index - 32), index)
  const after = text.slice(index + type.length, index + type.length + 32)

  if (/\.\s*$/.test(before)) return false
  if (/^\s*\(/.test(after) && !/\bnew\s+$/.test(before)) return false

  const previous = before.match(/([A-Za-z_]\w*)\s*$/)
  if (previous && !KEYWORDS.has(previous[1]) && /^\s*(\{|;|=|=>|\()/.test(after)) return false

  return true
}

export function references(text, type) {
  const pattern = new RegExp(`\\b${type}\\b`, 'g')
  for (const m of text.matchAll(pattern)) {
    if (isReference(text, m.index, type)) return true
  }
  return false
}

const DECL = /(?:^|[;{}\s])(?:public |internal |sealed |abstract |static |partial |readonly |unsafe )*(?:class|struct|interface|enum|record(?:\s+(?:class|struct))?)\s+([A-Z]\w*)/g

function spanEnd(text, brace) {
  let depth = 0
  for (let i = brace; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return text.length
}

// Every type declared in the file, with the span of its body. A type nested
// inside another keeps its own span, so a reference inside it is attributed to
// the nested type as well as to the outer one - which is correct: a nested type
// cannot see anything its outer type cannot see.
export function typesIn(text) {
  const found = new Map()
  for (const m of text.matchAll(DECL)) {
    const name = m[1]
    if (found.has(name)) continue
    const brace = text.indexOf('{', m.index + m[0].length)
    found.set(name, {
      name,
      start: m.index,
      end: brace < 0 ? text.length : spanEnd(text, brace)
    })
  }
  return [...found.values()]
}
