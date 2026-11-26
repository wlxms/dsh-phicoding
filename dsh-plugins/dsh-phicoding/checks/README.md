# phicoding checks —— 维护者文档

> **读者是维护和扩展检查器的人。**
> 用检查器的代理看技能（`../skills/`），不看这里。技能只告诉它"跑哪条命令、红了怎么改"，
> 不告诉它底部长什么样——它碰不到那一层。

## 架构

```
源码 ──▶ 底座（每语言一个，只解析）──▶ facts.json ──▶ 规则（一个规则一个脚本）──▶ CLI 汇总
```

| 层 | 在哪 | 职责 | 决定什么 |
| --- | --- | --- | --- |
| **底座** | `.<后缀>/facts/` | 解析，**不判断** | 换语言只换这一层 |
| **模型** | `.<后缀>/model.mjs` | 角色、关系、三张图 | 加规则只读模型，不重新解析/分类 |
| **规则** | `.<后缀>/rules/<family>/...` | 读 facts/模型判断 | 加规则只加一个文件 |
| **CLI** | `phicoding.mjs` | 找语言 → 跑底座 → 递归扫规则 → 按族排序 → 汇总 | 不认识任何具体规则 |
| **项目适配层** | `.phicoding/adapter.json` + `adapters/` | 事实、命名、规则覆盖/新增/装饰、强度 | 项目差异不进入规则本体 |

项目适配层（PAL）是**项目事实和策略**，不是引擎分支：

```
F0 核心 facts
  └─ adapter facts enrichment → F1
       └─ universal rules + adapter decoration/replacement/addition → Findings
            └─ adapter severity + local waiver → Verdict
```

适配层可以：

- `facts`：给类型补语义事实（如 UnrealSharp 的 `UClass(ClassFlags.Abstract)`）；
- `naming`：提供项目命名策略；
- `placement`：按语言配置原子类型目录与嵌套 enum 使用范围；
- `severity`：把规则调成 `error` / `warn` / `info` / `off`；
- `replace`：替换允许覆盖的规则；结构规则在 `tiers.mjs` 里受保护；
- `add`：增加项目规则；
- `decorate`：对指定规则的 findings 做带 trace 的装饰，不能静默变绿。

原子类型目录示例（`META_DIR_CLASS_02`）：

```json
{
  "placement": {
    "cs": {
      "atoms": {
        "enum": ["Enums"],
        "struct": ["Models"],
        "recordstruct": ["Models"]
      },
      "nested": {
        "enum": { "allow": true, "scope": "containing" }
      }
    }
  }
}
```

`Models` 只是默认值，不是硬编码；项目可把 enum 放到 `Enums/`，或按语言用
`placement.<language>` 给不同目录。空目录数组是配置错误，不是“关闭规则”。
嵌套 enum 默认允许，但 `scope=containing` 要求它只能被包含类型及内部类型使用；
`allow=false` 则禁止嵌套。

**原子目录检查不依赖 `Interfaces/` 模块**：有声明模块时相对模块根判断；没有模块时以项目根
为基准，仍然检查 atom 落点。接口落点需要模块，无法判时只记 note，不会把原子检查一起 skip。

示例：

```json
{
  "id": "wy-ue",
  "engine": "unreal",
  "naming": {
    "interface": { "prefix": "I" },
    "family": { "enabled": true }
  },
  "rules": {
    "severity": { "META_NAMING_02": "warn" },
    "replace": { "META_NAMING_02": "./rules/ue-naming.mjs" },
    "add": ["./rules/WY_NAMING_01.mjs"],
    "decorate": ["./rules/decorate.mjs"]
  }
}
```

`engine: "unreal"` 对应内建 `adapters/unreal.mjs`。自定义 facts 模块导出
`enrich(facts, context) → facts`；`builtin:unreal` 也可以显式写在 `facts`。

规则不是按引擎分叉：D-03 读 `semantics.abstractness`，不读 `ClassFlags`；命名规则读
`naming` 策略，不读项目名。`OFF`、`WARN`、`adapter suppressed` 都会出现在报告里，
不会折叠成 `green`。

### 语言级 Profile

"profiles.<language>" 在全局适配层之上再叠一层语言策略。语言键是 `cs`（不是 `.cs`）：

```json
{
  "profiles": {
    "cs": {
      "enable": {
        "naming": true,
        "directoryModel": true,
        "conceptProgramming": true,
        "noElse": true,
        "noSwitch": false,
        "comments": true,
        "blankLines": true,
        "dataPurity": false
      },
      "options": {
        "oneTypePerFile": true
      },
      "naming": { "interface": { "prefix": "I" } },
      "placement": {
        "atoms": { "enum": ["Enums"], "struct": ["Models"], "recordstruct": ["Models"] }
      },
      "rules": {
        "severity": { "META_NAMING_02": "warn" },
        "add": ["./rules/WY_CS_01.mjs"]
      }
    }
  }
}
```

`enable` 是规则激活开关：

- `naming`：`META_NAMING_01/02` 和 `E` 前缀策略；
- `directoryModel`：目录模型（`META_DIR_ACYCLIC_01` / `META_DIR_CLASS_01..04`）；
- `conceptProgramming`：概念编程元模块（`META_SURFACE_02/03`）；
- `noElse` / `noSwitch` / `comments` / `blankLines`：个人/项目风格；
- `dataPurity`：`META_DIR_CLASS_04`，默认关闭（这不是通用要求）。

默认值按现有行为：naming/directory/concept/noElse/comments/blankLines 开启；
noSwitch 与 dataPurity 默认关闭。关闭的规则在完整检查中**不运行、也不产生 skip**；
一个 meta 阶段全部关闭时输出 `SKIP ...（项目 profile 未启用）`，不会把它当成通过。

Profile 可覆盖 `naming` / `placement` / `options`，也可增删/调强度/替换允许替换的语言规则。
`oneTypePerFile` 由 `PROFILE_FILE_01` 执行，默认关闭；开启后一个文件只能有一个 top-level
`class` / `record`，嵌套类型不计数，`partial` 同名声明视为同一个类型。`Foo` 与 `Foo<T>` 是
不同 arity，同一个文件里的同名泛型伴生类默认豁免（`exemptGenericSameName: false` 可关闭）；
`Foo` 与不同名的 `Bar<T>` 仍算两个类型。可用
`{"enabled": true, "kinds": ["class", "record", "interface", "enum", "struct", "recordstruct"]}`
调整计数类型。

规则按**不变量族**分目录，不按加入时间编号：

| 族 | 目录 | 规则 |
| --- | --- | --- |
| **LEVEL** | `rules/meta/` / `rules/profile/` / `rules/soft/` | `META_*` / `PROFILE_*` / `SOFT_*`，按 `LEVEL_MODULE_CODE` 命名 |

`META` 按阶段再分 `REF_ACYCLIC` / `REF_LEVEL` / `DIR_ACYCLIC` / `DIR_CLASS` / `SURFACE` / `NAMING` 六个模块：

| 阶段 | 模块 | 规则 |
| --- | --- | --- |
| META 1/6 | `REF_ACYCLIC` | `META_REF_ACYCLIC_01` 具体图无环、`META_REF_ACYCLIC_02` struct 图无环 |
| META 2/6 | `REF_LEVEL` | `META_REF_LEVEL_01` 引用等级 |
| META 3/6 | `DIR_ACYCLIC` | `META_DIR_ACYCLIC_01` 目录单元无环 |
| META 4/6 | `DIR_CLASS` | `META_DIR_CLASS_01` SCC 同目录、`02` 目录结构、`03` 实现落点、`04` 纯数据 |
| META 5/6 | `SURFACE` | `META_SURFACE_01` 接口纯度、`02` 行为类接口覆盖、`03` 模块数据概念有接口、`04` PureDTO 隔离、`05` 模块单向 |
| META 6/6 | `NAMING` | `META_NAMING_01` 命名、`META_NAMING_02` UE 命名 |
| PROFILE | `STYLE` | `PROFILE_STYLE_01` No Else、`02` 注释、`03` 空行分组、`04` No Switch（默认关）；`PROFILE_FILE_01` 由语言 profile 选择性启用 |
| SOFT | `DESIGN` | `SOFT_DESIGN_01` 不得持有具体实现、`02` 构造边界 |

## 规则层级与递进

`checks/tiers.mjs` 是唯一的分层清单。CLI 默认按它执行，不按文件名字母序：

```text
META 1/6 引用无环       META_REF_ACYCLIC_01, META_REF_ACYCLIC_02
META 2/6 引用等级       META_REF_LEVEL_01
META 3/6 目录无环       META_DIR_ACYCLIC_01
META 4/6 目录归类       META_DIR_CLASS_01, META_DIR_CLASS_02, META_DIR_CLASS_03, META_DIR_CLASS_04（可选 dataPurity）
META 5/6 模块接口       META_SURFACE_01, META_SURFACE_02, META_SURFACE_03, META_SURFACE_04, META_SURFACE_05
META 6/6 命名 profile   META_NAMING_01, META_NAMING_02
PROFILE 项目风格        PROFILE_STYLE_01, PROFILE_STYLE_02, PROFILE_STYLE_03（+ 可选 PROFILE_STYLE_04 / PROFILE_FILE_01）
SOFT 设计审查           SOFT_DESIGN_01, SOFT_DESIGN_02
```

- **META 递进**：前一个 meta 阶段失败，后面的 meta 阶段标记 `BLOCKED`，不运行；profile / soft 也 `BLOCKED`。这是“元规则不能违反”的执行形态，不是把后面的违规藏起来。
- **PROFILE 半硬**：默认 `profile.mode=error`；项目可在 `.phicoding/config.json` 设 `profile.mode=warn`，此时只打印 `WARN`，不挡。
- **SOFT 全软**：只打印 `soft`，永远不挡。
- 项目本地规则未登记在 `tiers.mjs` 时按 profile 规则处理，不会自动变成全局不变量。
- `--only` 是单规则探针，绕过递进门，直接跑指定规则。

`profile` 配置示例：

```json
{
  "profile": { "mode": "warn" }
}
```

`model.mjs` 只做一次分类：

```text
Type role   Data / Interface / Abstract / Concrete / Utility / Extension / Root
Feature     ConceptRoot / RootImplementation / AggregateRoot / Factory
Relation    uses / holds / creates / implements
Reference   kind: use / type-argument / type-token / creation
Graph       contract / implementation / module
```

概念根是接口引用图的入度 0 源点，**允许多个**；根实现是实现了概念根的具体类，**每个根实现独立判**；聚合根在模型里等于根实现；工厂是形状特征，不是标记。

`META_REF_LEVEL_01` 现在全域硬判，但接受**显式 waive**（如 UE 子系统只能按具体类型注册的 plumbing）：先算实现契约（接口 + 基类契约面，递归闭包）的 `required` 引用；只判实现自己新增的 `delta` API 引用，delta 不许比 required 更具体。`new` 是 creates 跳过；契约要求的泛型实参/参数/基类契约类型是基线。**基类契约带上的 `required` 引用会从派生类的 `required` 与 `targets` 中一并移除**；派生类只对重新计算后的剩余引用判等级（避免“基类引用接口 → 派生类必然引用接口 → 再加具体类”被误判）。直接实现的接口仍然是本类型的契约。**字段/属性/事件存储归 `SOFT_DESIGN_01` 的软审。**waive 只豁免写了它的类型，未写的同族类型仍红；全绿时摘要记录豁免数量。

### 没有 `Interfaces/` 时的模块推断

旧工程没有 `Interfaces/` 时，模块规则不再一律 skip。`--diff` 把**本次改动文件**通过 `--changed` 传给规则，`layout.mjs` 按共享目录根建一棵多根树：

```text
Game/.../Modules/Rule/Actors/a.cs
Game/.../Modules/Item/Actors/My/a.cs
Game/.../Modules/Hero/Actors/Any/a.cs
        ↓ 剔除共同父级 Game/.../Modules
Rule / Item / Hero 三个模块根
```

- 目录里有 `Interfaces/`：它上面的目录是模块 / 子模块；
- 接口声明不在 `Interfaces/` 下：`META_DIR_CLASS_02` 直接红；
- 模块根之间的反向引用 / 环：`META_SURFACE_05` 直接判；
- 只有改动范围里连源文件目录都推不出来时才 skip。

这条推断只服务 M 族；`C` / `D` 的角色语义仍按声明的 `Interfaces/` 模块走，避免“没采用模块标准的工程突然开始按模块判具体类”。

### PureDTO 与模块内数据概念

数据现在分三层：

```text
ValueData     struct / record struct / enum        自身即契约，不要求接口
PureDTO       外部 Config/ 或 Configs/ 下的 class 数据   不需要接口；不能引用模块内类型
DataConcept   模块内 class 数据概念                必须有接口；接口只能引它的接口
```

`META_SURFACE_02/03` 是概念编程元模块（可关），`META_SURFACE_04` 管“PureDTO 不能回引模块”。
`META_SURFACE_01` 允许接口引用 ValueData 和外部 PureDTO；模块内 class 数据必须走接口，不能直接引用。

### 目录/文件单元规则

在模块规则之外，M 族还看**目录与文件**本身：

- `META_DIR_CLASS_01`：类型引用图的每个强连通分量必须落在同一个代码目录；**同目录文件 SCC 允许，跨目录 SCC 红；工程根和模块根不豁免**；**目录规则忽略 struct / record struct**，struct 参与的类型环由 `META_REF_ACYCLIC_02` 负责；
- `META_DIR_ACYCLIC_01`：对每条引用取源/目标目录的最近公共父目录，在公共父目录下取第一段分歧作为单元；**直属文件是 file 单元，子目录是 dir 单元**。file↔file 交 `META_DIR_CLASS_01`，M-05 只看至少一边是 dir 的边；所有单元做完整 SCC；**根目录不整体建节点，也没有整体豁免**。

例子：`Module/Player/Character.cs` 与 `Module/Player/Interfaces/ICharacter.cs` 分属两个目录；单向引用合法，两个目录互相依赖才红。`META_DIR_CLASS_01` 允许同目录 SCC；`META_DIR_ACYCLIC_01` 允许同目录文件—文件环，但 `State.cs` ↔ `StateMachine/` 这种文件—目录互相依赖红。

旧 `0700` 已并入 `META_SURFACE_02`；旧 `0750` 改名为 `META_REF_LEVEL_01`；旧 `0800` 只保留**具体实现图**部分为 `META_REF_ACYCLIC_01`，接口图 SCC 归软审（不新增规则）；新增 `META_REF_ACYCLIC_02` 管 struct 参与的引用环；旧 `0910` 改名为 `META_SURFACE_01`。旧编号保留为文档别名，避免迁移时找不到对应关系。

**为什么底座吐 JSON 而不是让规则自己调解析器**：解析只做一次；规则不必懂 Roslyn（或任何语言）；规则可以直接喂一段 facts 来测；换语言时规则一行不动。

**布局规则另有一层纯函数**：`checks/layout.mjs` 从 facts 派生模块树、类型 → 模块、接口 → 声明模块、引用边、实现计数。它不解析源码，规则只 import 它的 check 函数（`META_DIR_CLASS_02`–`META_DIR_CLASS_03` 都是薄壳）。规则仍然是独立进程；这层只是把"同一份目录派生"从四个脚本里拿出来一次，测试也可以直接 import 它、喂 facts，不必起子进程。

## 加东西

| 想加 | 改哪 |
| --- | --- |
| 一条规则 | 扔一个 `<族>-<编号>-名称.mjs` 进 `.<后缀>/rules/<族>/`。**清单和顺序都从文件路径派生**，零改动别处 |
| 一个新角色/关系 | 先在 `model.mjs` 加事实派生，再加规则；规则不直接解析源码 |
| 一条接口模块（目录）规则 | 在 `layout.mjs` 加一个 check 函数，再扔一个 `M-*` 薄壳；用例加进 `layout.test.mjs` |
| 一种语言 | 加一个 `.<后缀>/` 目录和里面的底座。**规则层语言无关** |
| 一种新事实 | 改底座——这是唯一需要改 C#（或该语言）的地方 |

旧数字编号仍可用于兼容规则；新规则优先使用 `F-` / `C-` / `D-` / `M-` 族编号。族内编号留空档，中间插规则不用重排。

## 规则契约

```
入参   --facts <facts.json>  --config <config.json>
       --rules <本语言规则目录>  --root <被检查的项目根>
       [--changed <changed.json>]

适配层  --adapter <adapter.json>（默认 <root>/.phicoding/adapter.json）
        facts 先 enrich；--config 传的是 project config + adapter 的有效配置
出参   stdout 一行一条问题
退出码 0 = 通过，1 = 有问题，3 = 不适用（输入缺失或有歧义，判不了）
```

**规则是独立进程，不是模块。** 换来的是一条简单规则可以是一行 `grep`。

### 退出码 3：不适用，不是通过

规则判不了的时候，它**没有判任何东西**。把它报成 `green` 就等于声称"我看了，没问题"——它其实没看。所以：

- 缺少 `config.json`（拿不到作者）→ `PROFILE_STYLE_02` 打印原因并 `exit 3`
- 有同名类型且 arity 也相同、按名字查会串 → `META_REF_LEVEL_01` 也 `exit 3`，不猜；`Foo` 与 `Foo<T>` 由 facts 的 `` `N `` 后缀区分，不会互相串
- 没有 `Interfaces/` 且改动范围里也推不出模块目录 → `META_DIR_CLASS_02` / `META_SURFACE_05` / `META_DIR_CLASS_03` `exit 3`；**这不是“不适用”，软审仍必须判“未采用标准”**，要求迁移或项目级豁免
- 没有 `creations` 事实 → `SOFT_DESIGN_02` 也 `exit 3`；构造边界没看，不算通过
- CLI 打印 `skip`，计入 `report.skipped`，**不涨 `failed`**
- 汇总行必须带上“跳过 N 条”，而且明说“不算通过”

**没有等级表了。** 原来 `levels.json` 要回答"谁在谁上面"，现在由 `META_REF_LEVEL_01` 一条**本地**判据回答：先扣掉实现契约要求的 `required` 引用，只看 `delta` 两端各是什么档位。它是全域硬规则，不再只作用于根实现。

**原来的 `META_DIR_CLASS_02-trunk-is-self-contained` 已删除。** 它要判的是"主干只引用主干"，而**主干是哪一块无法机械判定**——那是设计决策。用猜出来的主干做判据，猜错就是假报。这一条现在归法官。

>`META_DIR_CLASS_02` 号段现在复用为接口模块布局规则（`META_DIR_CLASS_02`–`META_DIR_CLASS_03`）。原规则文件名不同，不冲突；H5 主干面仍然归法官，因为聚合根 / 组合根只能靠命名或清单识别。



## 六条必须守的（每一条都是踩出来的）

### 1. 底座拿语法树，不拿编译产物

第一版底座建了 `CSharpCompilation`，用语义模型问每个标识符解析到哪个符号。**它把正确性押在了检查器不该要求的东西上：目标工程能编译。**

少一个 `using`、一个写到一半的方法、一个不在这台机器上的外部模块、一个在 Linux 上编的 Windows 目标——任何一样都会让解析停摆，而语义模型**不报错，只是不给引用**。于是所有结构检查在一片坏掉的代码上全绿。

而且它搞错了方向：规则要的不是"这是哪个符号"，是"**这个名字处在什么语法位置**"。语法树精确地回答这件事，对**编译不过的代码**、在**任何环境**下都成立。

```
class Slot { ... }              声明名          不是引用
Dictionary<Slot, Item> worn     类型实参        是引用
public string Slot { get; }     属性声明名      不是引用
Attributes.Set(k, v)            成员访问        不是引用
Value.Plus(1)                   成员访问        不是引用
Slots.Hand                      成员访问的左侧  是引用（那是类型）
```

**顺带的好处**：不需要外部模块、不需要平台匹配、不需要目标工程的 `dotnet restore`，而且能在写了一半的代码上跑。

### 2. 底座要自带自测

底座出过三个洞，**全都不报错，只是少了一整类事实，而所有检查照绿**：

| 洞 | 症状 |
| --- | --- |
| 声明扫描是行首锚定的 | 项目改用块级 `namespace`（类型被缩进）→ `types=0 edges=0 CYCLES=0` 的**假绿** |
| `record struct X` 扫不到 | 类型数少一个，指向它的边全丢 |
| **字段声明没有符号** | 一整类事实消失（字段从此不在 facts 里） |
| 内插字符串的纯文本段没抓 | `$"…"` 里的画面文字全部漏检 |

**底座必须拿一段已知代码自检**，断言扫出来的类型、引用、继承对得上。对不上就报——**别让"少了一类事实"看起来像"没有问题"**。

### 3. 一条比清单更重要的规则

> **规则没被机械化的那一部分，就是没生效的那一部分。**

清单的价值不在列了多少条，而在有多少条被真的跑起来。

同一形状的第二次失手是：**检查了形状，没检查内容**。例如注释可追溯性——验了 `X - 日期 : 内容` 的格式，却没验 `X` 是不是真的用户名，于是格式对、作者错。凡是"格式正确即通过"的检查，都要再问一遍：**内容能错到什么程度而它仍然通过？**

### 6. 检查器必须先被自己的反例验一次

一个从来不会红的检查，等于没有检查。所以每条规则在框架里都有自己的测试文件（`checks/*.test.mjs`），用合成工程注入反例，断言它变红。**这是规则作者的活，不是业务项目的活。**

三条配套的教训：

- **反例要打"名字"，不要打"实现"。** 有个检查名字叫「数据层经工厂解析种类」，断言却是"`Item.Make(` 出现过至少一次"。拿它的**名字**造反例——在主干里写一个按名字的分派——它才露馅。
- **`> 0 次出现` 型断言基本等于没有断言。** "某字符串出现过"几乎不可能失败，所以它什么都测不出来。**要断言的是位置。**
- **注入没生效要报出来。** 一条改了锚点却没匹配上的注入，看起来和"两边都没红、一致"一模一样。

## 靠名单圈定范围的检查，名单本身也要被查

任何"我检查这些文件 / 这些类型"的检查，都隐含一张名单。**名单不完整 = 静默漏检**：新东西不在名单里，检查器当它不存在，不报错、不报警、一切照绿。

所以名单要**双向核**：

- 名单里有、实际没有 → **名单漂了**
- 实际有、名单里没有 → **有人漏填**

**手写的只能是派生不出来的那一维。** 键集要从源码扫出来，手写的只能是代码里读不出的那点意图。反过来，把整份类型清单手抄一遍，就是第二份代码，而第二份代码迟早不同步。

## 会话范围：只判这次动过的

一个既有工程早就违反了一堆规则。全量判就是全红，而"全红"与"什么都没查"对使用者是同一件事——都会被忽略。所以 CLI 有一条窄路：**只把本次会话改动范围内的违规算作红。**

```
phicoding --root <项目> --session-begin    拍基准，一次会话一次
phicoding --root <项目> --diff             只判改动范围
```

### 范围从哪来：不是 git，是"动作账 + 一张照片"

git 回答的是"两个提交之间差了什么"。检查器要的是"**这个行动者**做了什么"。共享目录里这两个问题不等价：未提交的工作树在 git 里不存在，而并发的另一个 agent 的改动会算到你头上。

所以范围由两件事给出，各管一半：

| | 来源 | 回答 | 归属 |
| --- | --- | --- | --- |
| **capture** | `.phicoding/captures/<session>.manifest.json` | 相对基准，哪些文件/行变了 | 不知道是谁 |
| **ledger** | `.phicoding/ledger.jsonl`（追加写，一行一次动作） | 这些改动是不是我的 | 按会话隔离 |

- **没有 ledger**：所有改动都算我的（保守，偏宽只多查）
- **有 ledger**：账外的改动降级为**灰**，不算我的，不挡

capture 存 `size / mtime / sha256`；树足够小的时候**另存一份内容**（gzip），用来算行级范围。存不下内容时降级为整文件入范围——**偏宽允许，漏掉不允许**，而且降级会打在摘要里。

### 三种颜色

| 颜色 | 判据 | 挡 |
| --- | --- | --- |
| 红 | finding 的任一定位落在**本次改动范围**内；或一个没有定位的失败 | 挡 |
| 灰 | 文件改过，但不在本会话的账里 | 不挡 |
| 软 | 改动范围外的既有违规 | 不挡 |

**没有定位的 finding 一律算红。** "读不到 config"这种失败不能因为"看起来不在我改的那行"就被软化——那是把基础设施故障当成别人的旧债。

### 五条不许违反

1. 没有基准时 `--diff` **退出 2**，不静默降级成 strict，也不静默降级成空范围
2. 已拍过基准再拍 **拒绝**（挪基准是静默失效：之前改的东西会当成没改），除非 `--force`
3. 粗范围只许变宽，不许变窄
4. 判决不依赖 `mtime`——`mtime` 只当"要不要重读"的预筛，判据是 `sha256`
5. 摘要必须自报 scope。`PHICODING=OK (scope)` 与 `PHICODING=OK` 是两句话：前者"没变坏"，后者"合规"

### 性能

每文件的 `stat` 是瓶颈，不是字节数。2000 个文件的实测（`checks/scope.mjs` 直接调用）：

| 操作 | 串行 | 有界并发 32 |
| --- | --- | --- |
| capture（读 + 哈希 + 存内容） | 551 ms | **136 ms** |
| compare（全未改动，快路径） | 277 ms | **121 ms** |
| compare（2000 文件全变，最坏） | 635 ms | **206 ms** |

范围层与底座（Roslyn 全项目解析，秒级）不是一个量级，所以它不构成瓶颈。

### 自验

```
node checks/scope.test.mjs --fixture <带 .phicoding/config.json 的工程>
```

12 条反例，**每一条都点名它要证伪的那条承诺**：无基准硬失败 / 未改动不挡 / 改第 10 行不把第 3 行的旧债拽进来 / 范围内新增 else 必拦 / 新文件整文件入范围 / 账外改动归灰 / 两种模式互斥 / 拒绝重拍 / strict 未被改动。

规则语义另有自己的测试，不经过范围层：

```
node checks/rules.test.mjs            C/D 族：角色、接口纯度、纯数据、持有、构造边界、具体环、struct 引用环
node checks/tiers.test.mjs            分层清单：六段 meta 顺序、profile/soft 归属、无遗漏
node checks/progression.test.mjs      元规则递进：前一阶段红则后续阶段 BLOCKED
node checks/profile.test.mjs          半硬 profile：mode=warn 时 WARN 不挡
node checks/soft.test.mjs             软规则：设计审查只提示，不挡
node checks/cycle.test.mjs            META_REF_ACYCLIC_01 的八种形状，各自断言"报 / 不报"
node checks/more-concrete.test.mjs    META_REF_LEVEL_01 的三档边界：每档一个违规例 + 一个合法例
node checks/blank-lines.test.mjs      F-04 的边界：20 / 21 行、空行落在代码 / 字符串 / 注释里、空白行算不算
node checks/layout.test.mjs           M 族判据：模块结构、SCC 同目录、目录图无环
```

`rules.test.mjs` / `layout.test.mjs` 不起子进程、不经过 dotnet 底座：它们 import 模型/布局的 check 函数，直接喂合成 facts。规则脚本是薄壳；CLI / 真实工程的集成仍要另跑（可以用 `dotnet` 直接产出 facts，再逐条跑规则）。

`rules` 证明的是**角色和关系没有混**：装饰器持有接口不红，Parser 持有具体 Lexer 红；状态宿主持有 IState 不红，两个构造点红；嵌套树内部的互指不红，跨出树的环红。

`cycle` 证明的是**具体实现图的豁免范围没有扩大**：自引用、泛型自引用、菱形、纯嵌套树内部互指都不报，而两节点环、三节点环、跨出嵌套树的环都要报。

`more-concrete` 证明的是**档位边界画在哪**：接口档只认接口、抽象档只认抽象、具体档不认可子类。正反例覆盖全局 META_REF_LEVEL_01；`required` 契约基线和 `delta` 新增引用各有独立用例。

`blank-lines` 证明的是**"空行"这个词的边界**：空白行（只有空格）算空行，多行字符串与多行注释里的空行不算——那是内容。它还证明规则不会拿退出码撒谎：底座没给 `blankLines` 事实时 exit 3，而不是 0。

## 已知的边界

- 底座按**语法位置**判引用，不做符号解析。一个**变量名刚好等于某类型名**时会产生一条多余边（罕见，且那种命名本身就该改）。
- `using` 指令记进 facts 的 `usings`，但**不算引用**——它指命名空间，不指类型。
- **文件头注释（`namespace` 之前）与日期日历合法性都不检查**。前者是刻意的：许可证头是真实工程必需的；后者是已知缺口，接受。
- `blankLines` 是**行号事实，不是缩进模型**：多行字符串与多行注释内部的行先被排除，再判空行。`PROFILE_STYLE_03` 只看 `class` 一族与 `method` / `constructor`——`interface` 与 `enum` 的成员列表天然一行一条，按行数判会误伤。
- **空行的语义是"分组"，不是"变短"。** 检查器只能证明"长块里有边界"，证明不了"这几行属于同一组"——后者归软审查。
- **delegate 不在 facts 里**（底座只收 `BaseTypeDeclaration`）。所以 `META_DIR_CLASS_02` 看不到"Interfaces 里放 delegate"，`META_SURFACE_01` 看不到接口引用 delegate；`delegate` 的原子目录（默认 `Models/`）目前归软审。要机械化，得先扩底座。
- **模块树从 `Interfaces/` 目录派生，空目录也算**：目录 D 有 `D/Interfaces/` 就是模块；工程根 `Interfaces/` 也是模块，空 `Interfaces/` 目录同样会被发现。模块根没有直接代码也算模块层级。
- **目录等级不再存在**：只判目录图无环。类型引用折叠到直接代码目录，两个目录互相依赖（A→B→A）红；单向跨级合法；文件↔文件同目录环允许；空目录没有目录边；struct 边不参与目录图。
- **没有 `Interfaces/` 但本次有改动时**：`META_DIR_CLASS_02` / `META_SURFACE_05` / `META_DIR_CLASS_03` 从改动文件的共享目录根推断模块（`--diff` 时 CLI 把 `mine` 文件列表通过 `--changed` 传给规则），接口在不在 `Interfaces/` 下直接判；只有改动范围里连源文件目录都推不出才 skip。`META_SURFACE_02` 的具体类覆盖仍以 `Interfaces/` 采用为前提，不因推断模块而放宽。
- **META_DIR_CLASS_04（可选 dataPurity）/META_SURFACE_02 的“数据/行为”是语法近似**：自动属性算数据，手写访问器算行为；**`struct` / `record struct` 一律视为数据，哪怕带方法**（struct 行为归单独的软审规则，不拿引用纯度判）；外部基类/外部接口不在 facts 里，相关判定交软审。`META_SURFACE_02` 遇到基类不在 facts 内的行为类会 skip 未判，不把“外部基类可能有接口”误报成红。
- **SOFT_DESIGN_02 的 owner 是“唯一非 root 构造点”**：组合根和扩展类不计入构造点；同一具体类型出现第二个构造点就红，工厂/状态机宿主要在构造点收敛。
- **H4 只机械化了 H4a**（同接口多实现拆目录）。多接口类的 GCD 落点、外部概念实现路径、抽象类"对应目录"、目录名最小命名都含命名判断，归软审；H5 根实现面与 H6 覆盖同理（概念根 / 根实现 / 工厂按特征推，主干仍靠设计判断）。
