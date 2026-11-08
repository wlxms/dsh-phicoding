#!/usr/bin/env node
// 0450 - UE 类型的前缀必须与它所属的 UE 家族一致。
//
// UE 的对象模型靠首字母编码：
//
//   A    Actor（AActor 及其子类）
//   U    UObject（UObject 及其子类：组件、资产、库）
//   F    结构体（UStruct / 普通数据体）
//   S    Slate 控件
//   T    模板类
//
// 接口（I）与枚举（E）由 0400 统一管，这里不重复报。
//
// 判据不用手写家族表：**沿基类链走到终端**，终端不在本工程里声明时，它的首字母
// 就是家族。`AMyActor : ACharacter` → 终端 ACharacter → A 族；`UMyThing : UObject`
// → U 族；`FMyData : FTableRowBase` → F 族。中间隔几层本工程自己的基类也无所谓，
// 一路走到底。
//
// **只对 UE 工程生效。** 工程里一个 UE 根类型都没有时，这条按不适用跳过——
// 否则一个普通 C# 工程里 `class Monster : AIBase` 会被当成 Actor 族误报。
// UE 根类型是一张固定的短清单：它判的是"这个工程用不用 UE"，不是"每个类型是什么"。
import { readFileSync } from 'node:fs'

// 这张表是**闸门**，不是映射表：只用来回答"这是不是一个 UE 工程"。
// 家族前缀永远从基类链终端的首字母推，不由这张表决定。
const UE_ROOTS = new Set([
  'AActor', 'ACharacter', 'APawn', 'AController', 'APlayerController', 'APlayerState',
  'AGameModeBase', 'AGameStateBase', 'AInfo', 'AHUD', 'AVolume', 'ATriggerBase',
  'UObject', 'UActorComponent', 'USceneComponent', 'UUserWidget', 'UWidget',
  'UBlueprintFunctionLibrary', 'UInterface', 'UWorld', 'UGameInstance',
  'UDataAsset', 'USaveGame', 'UPrimaryDataAsset',
  'FTableRowBase',
  'SWidget', 'SCompoundWidget', 'SLeafWidget', 'SPanel'
])

const args = process.argv.slice(2)
const facts = JSON.parse(readFileSync(args[args.indexOf('--facts') + 1], 'utf8'))

const byName = new Map()
for (const type of facts.types) if (!byName.has(type.name)) byName.set(type.name, type)

// 按名字查类型。同名类型会让基类链走岔，认错家族就报错人——判不了就不判。
const seen = new Map()
for (const type of facts.types) seen.set(type.name, (seen.get(type.name) ?? 0) + 1)
const duplicated = [...seen].filter(([, count]) => count > 1).map(([name]) => name)
if (duplicated.length > 0) {
  console.log(`有同名类型（${duplicated.join(', ')}）—— 按名字查会串，先消除同名，跳过，不算通过。`)
  process.exit(3)
}

function bare(name) {
  if (!name) return null
  let text = String(name).trim()
  const generic = text.indexOf('<')
  if (generic >= 0) text = text.slice(0, generic)
  const dot = text.lastIndexOf('.')
  if (dot >= 0) text = text.slice(dot + 1)
  return text.replace(/\?$/, '').trim() || null
}

// 沿基类链走到本工程之外的那个名字。它才是"这个类型属于哪个家族"的依据。
function terminalBase(type) {
  let current = type
  const guard = new Set()
  for (;;) {
    const base = bare(current.base)
    if (!base) return null
    if (guard.has(current.name)) return base
    guard.add(current.name)
    const up = byName.get(base)
    if (!up) return base
    current = up
  }
}

const familyOf = (terminal) => (/^[AUFST][A-Z]/.test(terminal ?? '') ? terminal[0] : null)

// 闸门：工程里必须真的出现过 UE 根类型，这条才有意义。
const terminals = new Map()
let ueProject = false
for (const type of facts.types) {
  const terminal = terminalBase(type)
  terminals.set(type.name, terminal)
  if (terminal && UE_ROOTS.has(terminal)) ueProject = true
}
if (!ueProject) {
  console.log('工程里没有 UE 根类型（AActor / UObject / FTableRowBase …）—— 这条只对 UE 工程适用，跳过，不算通过。')
  process.exit(3)
}

const hits = []
for (const type of facts.types) {
  if (type.kind === 'interface' || type.kind === 'enum') continue
  const terminal = terminals.get(type.name)
  const family = familyOf(terminal)
  if (!family) continue
  if (type.name.startsWith(family)) continue
  hits.push(`${type.file}:${type.line}  ${type.name} 的基类链终点是 ${terminal}（${family} 族），名字要以 ${family} 开头`)
}

for (const hit of hits) console.log(hit)
process.exit(hits.length === 0 ? 0 : 1)
