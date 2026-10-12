> **结构检查已迁移。** 本文提到的 `checks.ps1` 已删除；15 条结构检查与其探针自验
> 已由 `phicoding` 承接（13 条规则 + 13 个探针，宿主在 dsh-phicoding 包内）。
> 本文正文保留原样——它是当时那一版的证据，不追改。

# 规划（第三版）：中国风 DND 肉鸽 MUD 框架（C#）

> 第一版被哲学法官打回（5 处结构问题）。第二版被再次打回（3 处检查规格自相矛盾 + 道具无锚点 + **一处真实设计缺陷**）。
> 本版逐条闭合两轮条件。历史记录保留在第 0 节——它是"检查真的会红"的证据。

## 0. 两轮打回记录

### 0.1 第一版错在哪

| # | 第一版写法 | 判据 | 结论 |
| --- | --- | --- | --- |
| E1 | `Thing.Wear(Equip)` 与 `Equip.Affect(Thing)` 互指 | `check-cycles.mjs` | **实测复现** `Equip.cs -> Thing.cs -> Equip.cs`，`CYCLES=1` exit 1。"同层不算环"的辩护对该检查器不成立——它剥注释后按**文件级 token** 建边。 |
| E2 | `Dictionary<Source,int>` + "幂等覆盖" | 静默覆盖红线 | 索引器写入 = 后者顶替前者且不报错。更糟：最终值依赖写入顺序。 |
| E3 | `Thing` 上"只增不减的 observed 套装集合" | 状态只有一份 | 装备表之外的第二份真相，两表之间无同步机制。 |
| E4 | `Thing.Value(name)` 不存在时自动建 | 不产出半成品 | 造 `Origin=0` 的半死属性，让错别字静默通过。 |
| E5 | `Source` 空标记接口当键 | — | 键空间无界；`Drop(thing)` 会把该对象全部修正一次撤光。 |

### 0.2 第二版错在哪

| # | 第二版写法 | 判据 | 结论 |
| --- | --- | --- | --- |
| F1 | `Equip` 不含 `Shift`，效果只能靠直接 `Add` | 需求"修正分加算与乘算两种" | **真实设计缺陷**：`Times` 只能用于套装，**装备的乘算整体失效**，而 A1/A2/A4 全部照绿。本版修：`Equip` 持 `Shift[]`，默认 `Affect` 施加。 |
| F2 | C11 `No-Token-Collision` 按字面实现 | 自相矛盾 | 它会把规划**自己点名的真实依赖**判红（`Sheet.Value(...)`、`Equip.Slot`、`Equip.Suit`），A11 要它 `==0`、A12 要"其余全绿"——死结。本版改为 `No-Upward-Edge`（分层单向），撞名只在**造成环**时才红，环交给 `Cycles`。 |
| F3 | C8 `Core/` 零 `static` vs A6 的 `Against(...)` 记号 | 自相矛盾 | 记号被读成静态方法。本版把 A6 改成真实实例调用形式；C8 保持"Core 零 `static`"（本设计可满足，且比条件 #4 的"零 static 字段"更严）。 |
| F4 | L12"`Duel` 不回调 `Thing`" vs 2.1"直接扣 `Origin`" | 自相矛盾 | 扣血就是写 `Thing`。本版改为"`Duel` 只写气血，不碰槽位/背包/修正层"。 |
| F5 | 道具（需求"必须有"第 3 条）零锚点 | 锚点必须落到断言 | "只改 Origin"是纪律不是结构。本版加 A14/A15，并点名道具的真实行为差异。 |
| F6 | 3.1 的边表不是从代码推导的 | — | 本版把 3.1 降级为"方向保证 + 分层表"，**实际边表交付时由工具输出并写入 DESIGN.md**。 |

### 0.2b 第三版的错（法官第三轮实测，全部已改）

| # | 第三版写法 | 判据 | 结论 |
| --- | --- | --- | --- |
| G1 | `String-Key-Only-In-Sheet` 没写作用域 | 不可满足 | `Data/Forge.cs` 必然也是 `Dictionary<string, Item>` ⇒ 按字面读**永远红**。已写明作用域 `Core/` |
| G2 | 聚合只写"先加后乘"，没定**跨槽位乘算的顺序** | 与 E2 同族 | `Dictionary` 枚举顺序是操作历史的函数。`Origin=10` 挂 55% 与 150%：先 55 得 7，先 150 得 8 —— **同一个穿戴集合两个结果**。已改为乘算**乘积先算完、最后一次除**（`Π` 可交换） |
| G3 | A9a 的名字来源是"`Core/` 之外全部 `.cs`" | 不可满足 | 把 `Spec/` 脚手架类型名也算实现类型。法官实测 `Spec/Values.cs` 撞 Core 的 `dictionary.Values` ⇒ 一次造出 **8 条环**。已收窄到 `Data/`，并加 `Spec-Naming` 检查 |
| G4 | A9b 用**子串出现**判 | 不可满足 | `Data/` 一个 `""` 让 16 个 Core 文件全红；Core 写"出手"撞单字槽位名"手"。已改为**字面量集合求交** |
| G5 | 三条"必须有"的行为无锚点 | 锚点须落到断言 | **职业门槛**（`Brand`）、**轮流检定**（需求原话"轮流"）、A8 弱于其锚点。已补 A17/A18 并强化 A8 |
| G6 | 层表无完整性判据；策略变体归属自相矛盾 | 静默失去覆盖 | Core 新文件不在层表里 ⇒ 跳过。§2.2 说 `Mute`/`Fixed` 在 Core 可替换，§4 又说"定义变体绝不在 Core"。已补层表完整性判据，并写明策略变体落 Core |

### 0.3 解法：一击消掉 E1–E5

**把 `Equip`/`Consumable`/`Suit`/`Require`/`Adjust` 的作用面从 `Thing` 降到 `Sheet`（数值卡），`Thing : Sheet`。**

因为修正层不再需要"来源"这个概念，于是 `Source`、`Dictionary<Source,int>`、observed 集合**全部不存在**：

```
Settle() = Clear() + 遍历当前槽位 Affect + 遍历当前套装 Affect
修正层 = f(当前穿戴)      ← 纯函数，无历史
```

撤销不再靠"按来源配对"，而是靠**重建**。"旧件效果完全消失"从纪律变成结构性保证——不可能残留，因为没有可残留的容器。

### 0.4 该方案的实测证据

| 验证 | 命令 | 结果 |
| --- | --- | --- |
| 第一版结构 | `node check-cycles.mjs <21 桩>` | `CYCLE Equip.cs -> Thing.cs -> Equip.cs` / `CYCLES=1` / exit 1 |
| 第二版结构 | `node check-cycles.mjs <21 桩>` | `files=21 types=30 edges=34` / `CYCLES=0` / exit 0 |
| 独立复现（法官） | 同上，24 桩 | `files=24 types=41 edges=68` / `CYCLES=0` / exit 0 |

**实测抓到 4 处"方法名撞类型名"造伪边**，其中一处直接成环（第二版没有预见）：

| 撞名 | 伪边 | 处理 |
| --- | --- | --- |
| `Value.Plus()/Times()` vs 类型 `Plus`/`Times` | `Value.cs → Shift.cs`，与 `Sheet→Value`、`Shift→Sheet` **成环** | 方法改名 `Value.Add()` / `Value.Scale()` |
| `Dice.Roll()` vs 记录 `Roll` | `Dice.cs → Check.cs`，与 `Check→Dice` 成环 | 记录改名 `Trial` |
| `Sheet.Tag()/Tagged()` vs 需求类 `Tag` | `Sheet.cs → Require.cs`，与 `Require→Sheet` 成环 | 需求类改名 `Brand` |
| `Adjust.Trait` 类型 vs `Shift.Trait` 属性 | `Shift.cs → Adjust.cs` 伪边（不成环，隐患） | `Adjust` 子类改名 `Score`；`Trait` 只作属性名/参数名 |

> 第二版把这张表写成"完整清单"，法官实测证明它是**抽样**（把 `Sheet` 的标记 API 叫 `Brand` 会立刻成环）。
> 本版不再声称它是清单：**撞名本身不是红线，造成环才是**，由 `Cycles` 守；分层违规由 `No-Upward-Edge` 守。两者的判据都写进 §10，不靠这张表。

## 1. 最小实现

### 1.1 需求里真正的难点

需求表面要五个系统（属性/装备/道具/检定/战斗），实际只有一个命题：

> **怪物、NPC、角色共用一套体系；差别用数据定义，不是三套代码。**

所以核心命题是：**三类游戏对象之间不存在类型差异**——它们就是同一个 `Thing`，差别全在 `Template` 数据行里。

### 1.2 拆环节

判定：**骰子 + 修正 对抗 难度**。

| 环节 | 内容 | 载体 |
| --- | --- | --- |
| 骰 | 产生随机数 | `Dice` |
| 比较 | `骰 + 修正 >= 难度` | `Check`（返回 `Trial`） |
| 修正怎么取 | 攻击修正、防御难度分别从哪来 | `Adjust` |

修正**从哪来**、**什么时候消失**：

| 环节 | 内容 | 载体 |
| --- | --- | --- |
| 一个被修正的数 | 基础值 + 加算表 + 乘算表 | `Value` |
| 修正的算法 | 加算 / 乘算 | `Shift` |
| 修正的作用面 | 一组命名数值 + 一组标记 | `Sheet` |
| 修正的施加者 | 装备 / 套装 / 消耗品 | `Equip` / `Suit` / `Consumable` |
| 装得下吗 | 使用需求 | `Require` |
| 装在哪里 | 槽位 | `Slot` |
| 对象 | 身份 + 卡 + 槽 + 背包 | `Thing` |
| 打起来 | 轮流检定、命中扣血、血空倒下 | `Duel` |
| 交手规则 | 骰/攻击/防守/伤害/气血/难度/回合上限 | `Clash` |
| 文案去哪 | 输出出口 | `Report` |

### 1.3 抽象逐个绑定环节

| 抽象 | 绑定环节 | 可变性 | 为什么不多余 |
| --- | --- | --- | --- |
| `Value` | 一个被修正的数 | 固化 | 需求点名加算/乘算两种，必须分表存才能无分支聚合 |
| `Shift` | 修正的算法 | 可替换 | 加算/乘算是两个变体，必须是可 `is` 的类型（红线 B） |
| `Sheet` | 修正的作用面 | 固化 | **打破 E1 环的那一刀**：施加者只需"数值+标记"，不需知道对象是谁、背着什么（设3） |
| `Slot` | 装在哪里 | 固化 | 类型安全的键。**没有行为可继承，不是"抽象"**（第二版标注有误，已改） |
| `Item` | 物品 | 可替换 | `Equip`/`Consumable` 的共同祖先，`Forge` 的返回类型 |
| `Require` | 装得下吗 | 可替换 | 需求点名"等级、职业门槛"两种，且要能加新检定条件 |
| `Equip` | 施加者之一 | 可新增 | 需求点名"新种类的装备"。持 `Shift[]`，默认 `Affect` 施加；可 override 出真行为 |
| `Consumable` | 施加者之二 | 可新增 | 需求点名"新道具"。`Use` 抽象 |
| `Suit` | 施加者之三 | 固化（sealed 数据） | 套装 = "件数达标 → 挂一组 `Shift`"，是既有解释的组合，**不携带行为**，所以是数据 |
| `Dice` | 骰 | 可替换 | 演示要真骰，检查要定骰 |
| `Report` | 文案出口 | 可替换 | 演示要打印，检查要静音/收集 |
| `Check` | 比较 | 固化 | 需求点名的"检定" |
| `Adjust` | 修正怎么取 | 可替换 + 可新增 | 需求要"新的检定条件" |
| `Clash` | 交手规则 | 数据 | 把 7 个可调项收成一个值对象，`Duel` 公开参数才能降到 4 |
| `Thing` | 对象 | 固化 | 三类对象共用的那一个类型 |
| `Duel` | 打起来 | 固化 | 需求点名的"战斗" |

### 1.4 环境

- `net10.0`（SDK 10.0.112 + 运行时 10.0.12 已确认）
- **零 NuGet 依赖**，`dotnet build` 不碰仓库外的 `~/.nuget`
- 只在 `.spine-game/` 内写文件（`obj/`、`bin/` 也在内）

## 2. 固化 / 可替换 / 可新增

### 2.1 固化（主干写死）

| 固化项 | 语义 |
| --- | --- |
| 聚合顺序 | `Now = (Origin + Σ加算) × Π乘算 ÷ 100ⁿ`（n = 乘算条数）。先全部加算；乘算的**乘积先算完**；最后**一次**整数除。 |
| 为什么乘积先算完 | `Dictionary<Slot,Equip>` 的枚举顺序是**操作历史**的函数，不是穿戴集合的函数。逐条截断会让同一个穿戴集合算出不同结果：`Origin=10`，挂 55% 与 150% —— 先 55 得 `10*55/100*150/100 = 7`，先 150 得 `10*150/100*55/100 = 8`。**这与第一版被打回的 E2 是同一族缺陷。** 乘积先算完则 `Π` 可交换，与顺序无关。 |
| 数值语义 | `Times` 参数是**百分数**；纯整数运算，**向零取整**；聚合结果 `int`。乘算条数多时 `sum * scale` 有溢出风险（留白 L31）。 |
| 表的元素类型 | 加算表与乘算表存 `int`，**不存 `Shift`**——存 `Shift` 会让 `Value` 向上依赖 `Shift`，`No-Upward-Edge` 与 `Cycles` 双红（法官实测 X5）。 |
| 效果载体 | `Shift.Apply(Sheet)` **直接施加到穿戴者的对应 `Value` 上**，加算进加算表、乘算进乘算表。**绝不取 `Now` 再施加**——取 `Now` 会把乘算降级成加算，破坏 `(Origin+Σ加)×Π乘` 的结合律。 |
| `Clear()` 清什么 | 只清 `Value` 的加算表与乘算表，**标记不动**。否则职业门槛标记与"解毒去标记"会被下一次 `Settle()` 吃掉。 |
| 对象与物品的实例 | 物品（装备/道具）**无状态，共享原型**（§6.1 Prototype）。`Thing` **每次新建**：`Template.Spawn()` 每次 `new Thing(...)`，绝不交 `static readonly Thing`——否则 A14/A15/A5 互相污染且顺序相关。 |
| 修正层的唯一生成方式 | `Settle()` = `Clear()` + 按**槽位名序**遍历当前槽位 `Affect` + 按同一序遍历当前套装 `Affect`。**修正层是当前穿戴集合的纯函数**。 |
| 为什么按槽位名序 | `Dictionary<Slot,Equip>` 的枚举顺序是**操作历史**的函数，不是穿戴集合的函数。证伪者实测：同一集合 {重剑, 铁甲} 因穿戴顺序不同得 身法 8 / 10。**顺序必须由集合本身决定，不能由历史决定**（A2b 守）。 |
| 条件效果读什么 | 装备 override 的 `Affect` 只能读 `Origin`（基础值），**不得读 `Now`**——`Now` 是**部分**聚合值，读它就把顺序依赖放了回来。`HeavyBlade` 的 `floor` 判定读 `Origin`。 |
| 撤销语义 | 不撤销，重建。因此"完全消失"是结构性保证。 |
| 换装顺序 | **先验需求 → 成功才写槽（顶替旧件，旧件不再持有）→ `Settle()`**。需求不过则不摘旧件、不改任何状态。旧件去向见 L21。 |
| 一槽一件 | `Dictionary<Slot, Equip>`；同槽写入即顶替，随后 `Settle()` 重建。 |
| 道具的层 | 消耗品改 `Origin` 或标记，**不碰修正层**（修正层会被下一次 `Settle()` 清空）。用了即出背包。 |
| 战斗流程 | 每回合攻方检定一次，轮流当攻方；`for (round < Rounds)`；每击后判定倒下；超时返回 `null`。 |
| 伤害 | `Harm.Roll()` 直接扣 `Origin`，不叠任何属性。 |
| `Duel` 的写权限 | `Duel` **只写气血**（`Origin`），不碰槽位、背包、修正层——不换装、不用道具。 |

### 2.2 可替换（继承与多态）

`Dice`（`Die`/`Many`/`Fixed`）、`Shift`（`Plus`/`Times`）、`Adjust`（`Flat`/`Score`/`Total`）、`Require`（`AtLeast`/`Brand`）、`Report`（`Screen`/`Mute`/`Notes`）、`Item`（`Equip`/`Consumable`）。

**策略变体的归属（消除第二版 §2.2 与 §4 的冲突）**：上列变体与**基类同文件，一律落 `Core/`**——它们是引擎的通用机制（怎么掷骰、怎么算修正、往哪写），不是内容。**只有装备/道具的具体种类落 `Data/`**——那是内容。判据：`No-Impl-In-Core` 的名字来源是 `Data/`，所以 Core 自己声明 `Mute`/`Fixed` 不会让它红。

### 2.3 可新增（组合）

| 加什么 | 怎么加 |
| --- | --- |
| 新装备种类 | 继承 `Equip` 一个类型 |
| 新道具种类 | 继承 `Consumable` 一个类型 |
| 新修正算法 | 继承 `Shift` 一个类型 |
| 新检定条件 | 继承 `Adjust` / `Require` 一个类型 |
| 新槽位 | `Data/Slots.cs` 一行 |
| 新套装 | `Data/Suits.cs` 一行 `new Suit(...)` |
| 新属性 | **0 处代码**，模板里加一个键 |
| 新物种（怪物/NPC/角色） | **0 处代码**，`Data/Templates.cs` 一行 |

### 2.4 点名两个真实的行为差异（证明 `Equip`/`Consumable` 不是为不存在的差异建抽象）

- `Equip` 的默认 `Affect` 只施加 `Shift[]`。**`HeavyBlade : Equip` override `Affect`**：`Shift[]` 表达不了**条件效果**——"根骨不足则额外拖慢身法"，判据读 `Origin`（§2.1）。
- `Consumable` 的 `Use` 抽象。**`Antidote : Consumable` 不只是回血，还去标记**——一条数值增量表达不了。

> 第三版曾点名 `Talisman`（穿上给穿戴者挂标记）。**已撤换**：标记不受 `Clear()` 影响，装备挂的标记会在脱下后残留——那是泄漏，不是一条行为差异。
> 第二版点名的 `LeechBlade`（"先 base 再挂一条气血乘算"）也不合格：等价于把 `Times("气血",150)` 放进自己的 `Shift[]`，数据能表达。
> 一并固化：**装备效果只作用于结算期的数值，不做战斗期钩子、不改标记**。

只差数值的装备/道具不写类型，直接在同一类型里换构造参数（1 行数据）。

## 3. 依赖链路

### 3.1 方向保证：分层表

**每个 Core 文件属于一层；Core 内部的每条边只允许指向同层或更低层。**

| 层 | Core 文件 |
| --- | --- |
| 0 | `Value` `Item` `Slot` `Dice` `Report` |
| 1 | `Sheet` `Shift` `Suit` `Adjust` `Require` |
| 2 | `Equip` `Consumable` |
| 3 | `Thing` `Check` |
| 4 | `Clash` |
| 5 | `Duel` |

**关键不变量**：`Core/Thing.cs` 出现 `Equip`，但 `Core/Equip.cs` **不出现 `Thing`**。反向只到 `Sheet` 为止，而 `Sheet` 不认识任何施加者。这就是 E1 的解。

**交付时以工具的实际输出为准**：`checks.ps1` 打印 `check-cycles.mjs` 的真实边表；实际边表写进 `DESIGN.md`。本表是**方向承诺**，不是手抄的边表（第二版把二者混为一谈，被法官指出）。

### 3.2 数据层方向（方向承诺，不穷举；交付时以工具输出为准）

```
Data/Slots.cs      → Core/Slot
Data/Suits.cs      → Core/Suit, Core/Shift
Data/Gear.cs       → Core/Equip, Core/Sheet, Core/Shift, Core/Suit, Core/Require, Core/Slot, Data/Slots, Data/Suits
Data/Drugs.cs      → Core/Consumable, Core/Sheet, Core/Value
Data/Forge.cs      → Core/Item, Core/Equip, Core/Consumable, Data/Gear, Data/Drugs
Data/Clashes.cs    → Core/Clash, Core/Dice, Core/Adjust
Data/Templates.cs  → Core/Thing, Data/Forge
Program.cs         → 全部（装配层）
Spec/              → Core + Data（只读观察）
```

**唯一窄缝** = `Data/Forge.cs`（名字 → 实例，`Dictionary.Add` 重复键显式抛）。`Clash` 的数据归属 = `Data/Clashes.cs`（第二版没说，法官指出有第二个缝）。

### 3.3 无环

判据交给工具：`node check-cycles.mjs <源码目录>` 必须 `CYCLES=0` exit 0。第一版同工具实测 `CYCLES=1`。桩验证见 0.4。

## 4. 拓展链路：新增一个"解释"要动几处

| 打算做的事 | 要动的代码 | 成本 |
| --- | --- | --- |
| 加一个具体的剑（数值不同） | `Data/Gear.cs` 一行 `new Sword("铁剑", 5, ...)` | 1 行 |
| 加一件新的具体装备 | 同上 | 1 行 |
| 加一个**新的装备种类**（新行为） | `Data/Gear.cs` **新类型 1 个** + `Data/Forge.cs` 登记 **1 行** | 1 类型 + 1 行 |
| 加一个新道具 | 新类型 1 个 + `Data/Forge.cs` 登记 1 行 | 1 类型 + 1 行 |
| 加一个新属性 | `Data/Templates.cs` 模板里加一个键 | 0 处代码 |
| 加一个新物种 | `Data/Templates.cs` 加一行 `Template` | 0 处代码 |
| 加一个新套装（数值） | `Data/Suits.cs` 一行 `new Suit(...)` | 0 处代码 |
| 加一种新检定条件 | 继承 `Adjust`/`Require` 1 个类型 | 1 类型 |
| 加一种新修正算法 | 继承 `Shift` 1 个类型 | 1 类型 |
| 加一条新槽位 | `Data/Slots.cs` 一行 | 1 行 |

**分清两件事**：**定义变体** = 装备/道具的**具体种类**写一个类型，落在 `Data/`；**登记变体** = `Data/Forge.cs` 里 `Add` 一行。（策略变体 `Plus`/`Times`/`Mute`/`Fixed`/`Flat`/`AtLeast` 等与基类同在 `Core/`，见 §2.2，不受此约束。）

**度量结论**：新增一个解释 = **一个类型 + 一行登记**；组合既有解释 = 0～1 行。窄缝唯一。

## 5. 锚点与其守卫断言

| # | 锚点 | 守护断言 |
| --- | --- | --- |
| A1 | 聚合 `(Origin + Σ加) × Π乘 ÷ 100ⁿ`；乘积先算完、最后一次整数除 | `Origin=10, Add(5), Scale(150)` → `Now == 22`（顺序反得 20；漏乘得 15） |
| A1b | 乘法可交换 ⇒ 聚合与穿戴/脱下**历史无关** | `Origin=10` 的同一个 `Value` 上 `Scale(55)`+`Scale(150)`；四种历史（先穿A后穿B / 先B后A / 穿上再脱下再穿上 / 换槽后重挂）下 `Now` **全部相等** |
| A2 | 换装旧件效果**完全消失** | 穿 `+3` → `Origin+3`；同槽换 `+5` → `Origin+5`（漏撤销得 `+8`） |
| A2b | 聚合与**穿戴顺序**无关，且条件效果只读 `Origin` | 同一集合 {`重剑`、`头槽 +3 根骨`}，基础根骨 **12**、身法 10 —— 钉死绝对值：**身法 8、根骨 19**。读 `Now` 会得身法 10，去掉排序且读 `Now` 会让两种穿戴顺序分别得 8 与 10。两条都要红 |
| A3 | 需求不满足时**不摘旧件、不改状态** | 同槽先穿低需件；高需件 `Wear` 返回 `false`；槽内仍是旧件且 `Now` 不变 |
| A4 | 套装掉到阈值下效果**完全消失** | 3 件达标 → `Now == Origin + 效果`；脱 1 件 → `Now == Origin` |
| A5 | 修正层是当前穿戴的纯函数 | 同一件连穿两次 → `Now == Origin + 3`（不是 `+6`） |
| A6 | 检定含等号 | `var check = new Check(new Fixed(12)); check.Against(bonus: 3, need: 15).Passed == true` |
| A7a | 战斗终止且血空倒下 | 定骰、`Rounds` 足够 → `Run()` 返回 **`left`**（点名到具体一方），且 `right.Value(Health).Now <= 0` |
| A7b | 超时 = 平局 | `Rounds` 极小且双方打不中 → `Run()` 返回 `null`，且双方 `Now > 0` |
| A8 | 三类对象是**同一个类型** | `monster.GetType() == typeof(Thing) && npc.GetType() == typeof(Thing) && hero.GetType() == typeof(Thing)`；且三者分别穿装备、用道具、被打均成立 |
| A9a | 主干不认识实现类型 | 从 **`Data/`** 推导**类型名** → 回查 `Core/` → 命中 `== 0`（**来源收窄到 `Data/`**：`Spec/` 是脚手架，`Program.cs` 不声明类型） |
| A9b | 主干不认识数据名 | **`Data/` 的字面量集合 ∩ `Core/` 的字面量集合 `== ∅`**（集合求交，不是子串出现；忽略空串） |
| A10 | 名字分派只在工厂 | 由 **`No-DataName-In-Core`** 守（来源集合含 `Forge` 登记名与 `Data/` 全部字面量） |
| A11 | 十一条红线 | `else`/`switch`/`enum`/填充词/非追溯注释/向上边/层表完整性/环/`static`/字符串键越界/实现类型越界，全部 `== 0` |
| A12 | 检查本身会红，且红的是**那一条** | `checks.ps1 -Probe`：18 个探针，每个声明打哪条；**该条必须红，其余必须全绿** |
| A13 | 装载期建、查找期抛 | `Sheet.Value("未登记")` 抛 `KeyNotFoundException`；模板里写了的键读到其值、不抛 |
| A14 | 道具效果落在持久层 | 用道具 → `Now` 变化；**随后做一次换装触发 `Settle()`** → 变化仍在 |
| A14b | 标记不受 `Clear()` 影响 | 挂标记 → 换装触发 `Settle()` → 标记仍在 |
| A15 | 道具用完出背包 | `Use` 后该道具不在 `Bag` 里 |
| A16 | 装备的**乘算**真的生效 | `Origin=10`，穿一件 `+50%` 的装备 → `Now == 15`（不是 0，不是 10） |
| A16b | 加算与乘算**同时**来自装备 | `Origin=10`，穿 `+5` 与 `+50%` 各一件 → `Now == 22`（排除 20 与 15 两种错法） |
| A17 | 职业门槛真的挡人 | `Brand("少林")`：无标记的 `Thing` `Wear` 返回 `false`；打了标记的返回 `true` |
| A18 | 双方**轮流**检定 | `Rounds=3`、双方都必中 → 战报 **4 行**（3 行交手 + 1 行收场），且交手行的出手者依次为 `left`、`right`、`left`——证明双方各自出手，而不是只有一方在打 |
| A19 | 登记与查找都是显式失败，不静默覆盖 | 重复登记同名种类抛；查找未登记的种类抛 |

**A9b 的豁免与作用域**：`String-Key-Only-In-Sheet` 的**作用域是 `Core/`**——`Core/` 内以 `string` 为键的集合只允许出现在 `Core/Sheet.cs`（属性名在运行期以 `string` 进入主干）。**`Data/Forge.cs` 必然也是 `Dictionary<string, Item>`**（名字注册表），那是设计本意，作用域写错会让这条检查永远红。

| 锚点 | 守它的断言 |
| --- | --- |
| A1–A8、A13–A18 | `Spec/`（C# 断言，跑一条报一条） |
| A9a–A12 | `checks.ps1`（结构红线 + 反例自验） |

## 6. 设计模式：点名与排除

### 6.1 用了

| 模式 | 用在哪 | 为什么 |
| --- | --- | --- |
| **Type Object（类型对象）** | 装备/道具种类 = CLR 类型；`Data/Forge.cs` = "名字 → 类型"的**唯一**位置 | 种类携带**行为**。数据表只能表达既有解释的组合，表达不了新解释。类型让主干能 `is`，也让编译器帮忙。 |
| **Composite（组合）** | `Shift[]` 组成装备与套装效果、`Require[]` 组成需求、`Total(params Adjust[])` | 组合开放，且组合器本身是抽象的实现——"组合"不需要主干支持。 |
| **Strategy（策略）** | `Dice`、`Adjust`、`Report` | 同一位置多实现，且必须可替换（检查要定骰与静音）。 |
| **Null Object（空对象）** | `Report` 的 `Mute` | 检查要完整跑流程但不刷屏，比到处 `if (report != null)` 干净。 |
| **Ledger / Accumulator（修正累积）** | `Value`：基础值一份真相，修正分加算表与乘算表累积 | 状态只有一份；聚合无分支。 |
| **Rebuild over Undo（重建代替撤销）** | `Thing.Settle()` = 全清 + 全量重挂 | 把"撤销配对"这个必然出错的操作整个删掉。**本设计最重要的一步**：不需要来源身份，E2/E3/E5 无从发生。 |
| **Prototype（共享原型）** | `Forge` 持无状态物品实例，多 `Thing` 共享 | 装备/道具**无状态**（效果写在卡上，不在物品上），共享安全。刻意不做克隆。 |
| **Registry（登记表）** | `Data/Forge.cs` | 名字 → 类型的唯一窄缝；`Dictionary.Add` 重复键显式抛。 |

### 6.2 为什么不是另外几个

| 候选 | 为什么不用 |
| --- | --- |
| **把种类做成数据表**（`{"kind":"剑","bonus":{"身法":3}}`） | 需求点名要我回答的。数据表扩大的是**"谁能表达"**（策划不重编译）和**"要不要重编译"**，**不是"能表达什么"**——策划的自由度 = 既有解释的组合。一旦要"吸血刀"（新行为），数据表撑不住，必须回头改主干。所以**种类必须是类型，数值才是数据**。真正 0 处代码的只有"新属性/新物种/新数值"，我把它们留在数据层。 |
| **继承层级分怪物/NPC/角色**（`Monster : Thing`） | 需求原话"不要做三套相似的东西"。更深一层：这三者**没有任何行为差异**——都能穿装备、都被打、都能用道具。"怪物能穿装备"和"角色能穿装备"是同一段代码。为不存在的差异建抽象是最典型的过度设计。统一为 `Thing`，差异进 `Template`。 |
| **完整 ECS** | ECS 付出"数据与行为分离、结构由 System 遍历顺序定义"的认知成本，换**缓存友好与百万实体规模**。这是控制台文字游戏，一个场景两个对象打架，且需求把"以人为本（简单清晰易读 > 高性能）"排第一。ECS 收益为 0、成本全额支付。**但借用了 ECS 的一件东西**：数值与行为分离（`Value` 是纯数据，`Shift` 是行为），只是没引入 Entity/System 两层。 |
| **访客 Visitor** | Visitor 解决"对一组**封闭**类型集合反复加新操作"。这里变体集合是**开放**的（需求要不断加装备种类）。开放集合上做 Visitor，每加一个变体就要改所有 Visitor——方向正好相反。多态虚调用就是答案。 |
| **装饰器 Decorator** | 装饰器是"运行期层层包裹同一接口"。这里装备不是包在角色外面，而是往卡上挂一组修正，且**每次换装全部重建**。装饰器要求每层转发全部接口，对公开面增长很敏感。 |
| **观察者 Observer / 事件** | 事件解决"变化要通知多方，且订阅者运行期才知道"。这里订阅者是**固定的一个**——`Thing` 自己。为固定的一个订阅者建事件系统，是给不存在的差异建抽象。 |
| **撤销（Undo）** | 撤销要求每个操作配一个逆操作，且逆操作必须精确配对——这正是 E2/E3 的来源。`Settle()` 用重建代替撤销，逆操作不存在，配对错误也就不存在。 |
| **单例 Singleton** | 只有数据表是静态只读的，且是 `static readonly` 字段而非单例——没有实例唯一性需求，也没有生命周期管理需求。 |
| **枚举 `SlotKind`/`DamageKind`** | 枚举把"可新增的集合"变成"必须改主干并重编译的封闭集合"。槽位用 `Slot` 实例（可新增、能当字典键），修正算法用 `Plus`/`Times` 类型（能 `is`、各自携带数据）。 |

## 7. 硬约束自查（规划期）

| 约束 | 规划期状态 |
| --- | --- |
| No Else | 分支一律 `if (...) return;`；`Equip.Need` 用 `foreach + if (!pass) return false`；`WornSuits` 用 `foreach + continue` |
| No Switch | 修正算法靠 `Shift` 多态 |
| 类型替代枚举 | 无 `enum`；`Plus`/`Times` 用类型 |
| 主干只知抽象 | `Core/` 零"Core 之外"类型名（A9a）、零 `Data/` 字面量（A9b）、零向上边（`No-Upward-Edge`） |
| 不写注释 | 源码零注释；只在破坏编码哲学处写追溯注释，本项目预计 0 条 |
| 无填充词命名 | 无 `Manager`/`Service`/`Helper`/`Util`/`Impl` |
| 依赖无环 | `check-cycles.mjs`；分层单向由 `No-Upward-Edge` 另守 |
| 静默覆盖 | 唯一登记点 `Forge.Add` 用 `Dictionary.Add` 显式抛；**修正层已无字典** |

## 8. 规格留白（需求没说清，我做了判断）

| # | 留白 | 判断 | 影响面 |
| --- | --- | --- | --- |
| L1 | 加算与乘算混算顺序 | 先加算后乘算（D&D 3.5 惯例） | `Value.Now`；A1 |
| L2 | 战斗打不中会死循环吗 | 加 `Rounds` 上限，超时返回 `null` | `Duel.Run`；A7b |
| L3 | 装备需求"等级"是什么 | 普通属性（模板里一个键）；职业门槛用标记 `Brand` | 无需新机制 |
| L4 | 一件装备能否属多套 | 只属一套（`Equip.Suit` 单值） | 够用即可 |
| L5 | 物品实例能否被多对象共享 | 能。无状态，共享安全（Prototype）。**不做耐久**是需求明说的 | 若加耐久必须每次造新实例 |
| L6 | 槽位全局固定还是按物种不同 | 全局固定一套 | "蛇没有手"留待以后 |
| L7 | 读不存在的属性会怎样 | **装载期建、查找期抛**：`Sheet.Open` 建档；`Sheet.Value` 读未登记名抛 `KeyNotFoundException` | 封死"任何字符串都是合法属性名"；A13 守 |
| L8 | 战斗同步还是可交互 | 同步一轮到底，`Report` 逐条输出 | 需求不做界面 |
| L9 | 伤害公式 | 伤害 = `Clash.Harm` 的骰值，**不叠任何属性** | A7a 不被"命中扣 1 点"蒙混 |
| L10 | 一轮双方各检定一次还是只有攻方 | 每回合攻方检定一次，轮流当攻方 | `Report` 条数、A7a 回合数 |
| L11 | 先手怎么定 | `left` 先手 | A7a 点名 `left` 胜 |
| L12 | 回合内可否用道具/换装 | 不可以。`Duel` 只写气血，不碰槽位/背包/修正层 | 保证 `Duel → Thing` 的写面最窄 |
| L13 | 套装"件数"怎么算 | 占着槽位、`Suit` 相同的装备件数；一件只占一个槽 | A4 的阈值跨越 |
| L14 | 属性名允许只出现在模板里吗 | 允许，**模板是属性的唯一定义处**（L7）。模板必须把用到的属性全部写出 | "自动建属性"无任何合法场景 |
| L15 | 平局 `Report` 输出什么 | 一行"未分胜负"（Core 的组合句式） | A7b |
| L16 | `Times` 参数语义与取整 | 百分数；`n * percent / 100`，`int` 整数除向零取整 | A1 的 22 |
| L17 | 缺 `node` 时 `checks.ps1` | `Cycles` 直接判**失败**并打印"缺 node"，不静默跳过 | A11 必须可复跑，跳过等于假绿 |
| L18 | "数据名"指什么 | `Data/` 里的**字符串字面量**（属性名/物品名/标记/槽位名） | 抽取器抽错集合会假绿；A9b 已定死来源 |
| L19 | 装备/道具效果是增量还是绝对值；`Settle()` 取 `Now` 还是转移表 | **`Shift.Apply` 直接施加到穿戴者的 `Value`**（加算进加算表、乘算进乘算表），**不取 `Now`** | 否则乘算装备恒为 0；A16 守 |
| L20 | `Sheet` 一卡两职（对象的数值卡 / 效果描述）怎么分 | 两者**不是同一个 Sheet**：效果由 `Equip`/`Suit` 持有的 `Shift[]` 描述，直接施加到穿戴者 | "消耗品只改 Origin"由 A14 守，不靠约定 |
| L21 | 换装后旧件去哪 | **不再持有**。`Thing.Bag` 是消耗品的家；被顶替的装备直接丢弃。"效果完全消失"由 `Settle()` 保证，与物品去向无关 | A2/A3。需求只说"旧件卸下"，没说保留；要保留须另立"退役装备"容器（第三版写"回背包"是错的，当时 `Bag` 只收 `Consumable`，那条规则无法表达） |
| L22 | 消耗品用后出背包吗、能否叠加 | 用完即出背包（`Consumable` 语义）；不做数量叠加 | A15 |
| L23 | "气血"这个属性名在主干里怎么指定 | 由 `Clash` 的 `string` 字段传入，**Core 不写该字面量** | A7a 的 `Value(Health)` 记号；A9b 不假红 |
| L24 | `Clash` 的 7 个可调项由谁构造 | `Data/Clashes.cs`（唯一窄缝仍在 `Forge`，`Clash` 是第二条数据但**不是名字分派缝**） | §4 度量 |
| L25 | 文案落 Core 还是 Data | 专名（属性/物品/标记/槽位）落 `Data/`；**组合句式（"X 击中 Y"）是 Core 的**，但不得含任何 `Data/` 字面量 | A9b 守 |
| L26 | A9b 的判据形式 | **集合求交**：`Data/` 的字面量集合 ∩ `Core/` 的字面量集合 `== ∅`（忽略空串） | 子串出现式判据（第二版写法）**不可满足**：`Data/` 里一个 `""` 让 16 个 Core 文件全红；Core 写"出手"会撞 `Data/Slots.cs` 的单字槽位名"手"。法官实测 X2/X3 |
| L27 | `Forge` 的类型还原 | `Wearable(name)` → `Equip`、`Usable(name)` → `Consumable`，**两个 typed 方法**；用户面无 `as` | A（类型安全） |
| L28 | A8 是否要手写 `Monster`/`Npc`/`Role` 清单 | **不手写**。A8 用 `GetType() == typeof(Thing)` 相等断言 + 三类行为断言；结构性由 A9a 与该 `GetType()` 断言**共同**覆盖 | 在 `Data/` 里加 `Monster : Thing` 不会被 A9a 抓到（A9a 只查 Core 里的 `Data` 名字），第二版把这条归因写错了 |
| L31 | `sum * scale` 的溢出 | 不做防护（框架雏形）。乘算条数极多时 `int` 会溢出 | `Value.Now` |
| L29 | C1–C5 的作用域 | `Core/` + `Data/` + `Spec/` + `Program.cs`（**含装配层**，第二版漏了） | 装配层不得乱写 |
| L30 | `String-Key-Only-In-Sheet` 只认 `Dictionary<string` 吗 | 不。正则覆盖 7 种集合类型且不分大小写：`(?i)(Dictionary\|SortedDictionary\|SortedList\|HashSet\|IDictionary\|IReadOnlyDictionary\|ILookup)<string` | 守卫强度 |
| L32 | `Names-Are-Chinese` 的逃逸面 | 已知且**不堵**：长度 < 2 的字面量整条跳过（`"A"` 逃逸）；作用域只有 `Core/` + `Data/`（`Program.cs` 的演示文案全英文化仍绿）；"至少含一个汉字"放行 `"IronSet 铁甲套"` 这类中英混排 | 需求"中国风"的边界本身不可机械判定，这是最弱可用版本。要更严需需求方给口径 |
| L33 | `No-Comments` 的作者名绑定 `$env:USERNAME` | 保留。换机器/CI 复跑时，原作者写的合法追溯注释会被判红 | 当前 0 条注释所以不显形；要交付给别人复跑就得改成白名单或"任意真实用户名" |
| L34 | A8 的 `GetType() == typeof(Thing)` 是同义反复 | 保留并**如实标注**：`Thing` 是 `sealed`，这条由编译器保证、构造上不可能红。A8 真正的判别力在它的三条行为断言 | 它作"锚点被断言守住"的证据不算，只作意图声明 |
| L35 | `-Probe` 的 `$implTypes.Count -eq 0` 分支（Data 侧全失明）没有探针 | 保留。P17 只缩进 `Core/`，所以这一支从未被自验过 | 已知的探针覆盖缺口，明写不掩盖 |

## 9. 交付物

```
.spine-game/
  PLAN.md            本文件
  DESIGN.md          设计说明 + 工具输出的真实边表 + 留白
  README.md          运行命令
  SpineGame.csproj   net10.0，零 NuGet
  Program.cs         装配层：造数据、跑演示 / 跑检查
  Core/              主干 16 个文件
  Data/              Slots / Suits / Gear / Drugs / Forge / Clashes / Templates
  Spec/              行为检查（A1–A8、A13–A19），并在 Summary 里对账锚点覆盖率
  checks.ps1         结构红线 15 项（A9–A11）+ 探针自验 18 个（A12）
```

复跑命令：

```
dotnet run --project H:\Git\dsh-mydsh\.spine-game\SpineGame.csproj
dotnet run --project H:\Git\dsh-mydsh\.spine-game\SpineGame.csproj -- --check
pwsh -File H:\Git\dsh-mydsh\.spine-game\checks.ps1
pwsh -File H:\Git\dsh-mydsh\.spine-game\checks.ps1 -Probe
```

## 10. 检查规格（`checks.ps1`）

`Invoke-Checks -Root <目录>` 返回**失败的检查名集合**，供探针断言"只有一条红"。

| 检查名 | 判据 | 作用域 |
| --- | --- | --- |
| `No-Else` | `\belse\b` `== 0` | `Core/ Data/ Spec/ Program.cs` |
| `No-Switch` | `\bswitch\b` `== 0` | 同上 |
| `No-Enum` | `\benum\b` `== 0` | 同上 |
| `No-Filler` | `(?i)(manager\|service\|helper\|util\|impl)` `== 0`——**子串、不分大小写** | 同上 |
| `No-Comments` | 非追溯注释格式的 `//`、`/*` `== 0` | 同上 |
| `No-Impl-In-Core` | 从 **`Data/`** 推导**类型名** → `Core/` 命中 `== 0` | `Core/` |
| `No-DataName-In-Core` | **`Data/` 字面量集合 ∩ `Core/` 字面量集合 `== ∅`**（忽略空串） | `Core/` |
| `No-Upward-Edge` | ① 按 §3.1 分层表，不存在 `层号(F) < 层号(G)` 的 Core 边 `F → G`；② **完整性**：层表列出的文件集合 `==` `Core/` 实际 `.cs` 文件集合（多一个未登记文件即红——否则新文件静默失去覆盖） | `Core/` |
| `Cycles` | `node check-cycles.mjs` → 必须 `CYCLES=0`；缺 node 判失败（L17） | 全仓 |
| `No-Static-In-Core` | `\bstatic\b\|\bconst\b` `== 0`（`const` 隐含 static；蕴含"无 static 字段"与"`Value` 不是进程级映射"，比第二版条件更严） | `Core/` |
| `String-Key-Only-In-Sheet` | `(?i)(Dictionary\|SortedDictionary\|SortedList\|HashSet\|IDictionary\|IReadOnlyDictionary\|ILookup)<string` 只出现在 `Core/Sheet.cs` | **`Core/`** |
| `Spec-Naming` | `Spec/` 里声明的类型名一律以 `Spec` 结尾；`Program.cs` 不声明类型 | `Spec/ Program.cs` |
| `Names-Are-Chinese` | `Core/` 与 `Data/` 里长度 ≥ 2 的字符串字面量必须至少含一个 CJK 字符 | `Core/ Data/` |
| `No-Orphan-Anchor` | 从 `PLAN.md` §5 推导锚点 id，每一个必须在 `Spec/Cases.cs` 或 `checks.ps1` 的 `$anchorGuard` 里被点名 | `PLAN.md Spec/ checks.ps1` |
| `No-Now-In-Affect` | **装备 `override void Affect` 的方法体内不得出现 `.Now`**（`Get-AffectBodies` 做花括号配对取体）。读 `Now` 就是把部分聚合值当输入，结果将依赖施加顺序——这是 §2.1 写死的规则，必须机械化 | `Core/ Data/` |

> **`No-Orphan-Anchor` 存在的理由**：证伪者实测，删掉 `Cases.cs` 里的一行 `Fighting(spec);` 会让 A7a/A7b/A18 七条断言集体蒸发，而 `--check` 仍然打印"断言 26 条，不成立 0 条"、exit 0，结构检查照样全绿。**「断言条数」本身没有任何守卫。** 本检查从规划反推必须存在的锚点。
>
> **但文本层不够（第二轮实测）**：删调用行只让断言不再**执行**，`spec.That("A7a …")` 的文本仍在文件里，`No-Orphan-Anchor` 照绿。真正的守卫是 **`--check` 自己核**：`Spec.Summary(planPath)` 把**已执行**的锚点集合与从 `PLAN.md` 推导的锚点集合对账（结构性锚点 A9a/A9b/A10/A11/A12 由 `checks.ps1` 守），缺一条即 exit 非零。实测：删 `Fighting(spec);` ⇒ `--check` 报 `A7a A7b A18` 缺失、exit 3。
>
> **`No-Now-In-Affect` 存在的理由**：第二轮证伪者实测——把 `HeavyBlade.Affect` 的 `Origin` 改回 `Now`，用户可见数值从 身法 8 变成 10（条件效果静默消失），而 **40 条断言 + 14 项结构检查 + 17 个探针全绿**。§2.1 与 README 都把它写成硬约束，当时却**零机制**在守。
>
> **`No-Impl-In-Core` 的逐文件失明地板**：只兜"总数 = 0"不够。证伪者实测——只把一个 Data 文件缩进（它的 6 个类型从名字来源消失），再往 Core 注入真实引用 `typeof(Sword)`，检查**假绿**。现在每个 `Core/`、`Data/` 的 `.cs` 都必须至少抽出一个类型名，否则判红。类型抽取正则同时补上 `readonly`（原本漏掉 `public readonly record struct Trial`）。
>
> **`Names-Are-Chinese` 存在的理由**：需求把中国风写成硬要求（属性名、物件名、事件文案都用中式的），而证伪者实测把它全换成英文（"木棍"→"Stick"、"未分胜负"→"draw"）仍然全绿——**零守卫**。这是机械可判定的最弱版本：主干与数据里不许出现没有汉字的长字面量。
>
> **`No-Filler` 的边界教训（同一处栽了两次）**：第一版 `\b(Manager|…)\b` 漏在**前**边界（`ProbeHelper` 匹配不上）；改成 `\b[A-Za-z0-9_]*(…)\b` 后又漏在**后**边界与大小写（`StringUtils`、`HelperMethods`、`ItemManagerBase`、`helper`、`utils` 全不红）。两次都是"反例只挑了让这条检查满意的形状"。现在用**子串、不分大小写**，并补 P16 专门注入 `ItemManagerBase`。当前代码上基线仍是 0 命中。

> **`String-Key-Only-In-Sheet` 的作用域必须是 `Core/`**：`Data/Forge.cs` 必然也是 `Dictionary<string, Item>`（名字注册表）。第二版漏写作用域 ⇒ 按字面读永远红（法官实测：基线 `offenders=Data/Forge.cs`）。
>
> **`Spec-Naming` 存在的理由**：`check-cycles.mjs` 按 token 建边。法官实测 `Spec/Values.cs` 的 `class Values` 撞上 Core 的 `dictionary.Values`，造出 `Core → Spec` 伪边，而 `Spec → Core` 是真的 ⇒ 一次性造出 **8 条环**、`Cycles` exit 1。所以脚手架类型名必须与 Core 的成员名分池。

> **`No-Upward-Edge` 取代第二版的 `No-Token-Collision`。** 第二版说"撞名只在造成环时才违规"——**这句是错的**，法官实测 X6 证明 `No-Upward-Edge` 对**向上的**撞名同样直接判红。正确的说法是：撞名有两个后果，**成环**由 `Cycles` 守，**跨层**由 `No-Upward-Edge` 守，**同层伪边**（如第二版的 `Shift → Adjust`）不为违规、但由 `Cycles` 兜底。两条检查合起来覆盖第二版想覆盖的东西，且都可满足。

### 探针（`-Probe`）

每个探针：复制源码到 `$env:TEMP` 下的临时目录 → **在钉死的文件**注入一处 → 跑 `Invoke-Checks` → 断言**期望的那一条红、其余全绿** → 删临时目录。名字**从 `Data/` 实际声明推导，不手写**。

| # | 打哪一条 | 注入位置（钉死） | 注入什么 |
| --- | --- | --- | --- |
| P1 | `No-Else` | `Core/Thing.cs` | `else { }` |
| P2 | `No-Switch` | `Core/Thing.cs` | `switch` |
| P3 | `No-Enum` | `Core/Thing.cs` | `enum` |
| P4 | `No-Filler` | `Core/Thing.cs` | `class ProbeHelper` |
| P5 | `No-Comments` | `Core/Thing.cs` | `// 探针` |
| P6 | `No-Impl-In-Core` | `Core/Thing.cs` | 用**从 `Data/Gear.cs` 实际声明的**一个装备类型名（`Data` 的图到不了 `Thing`，故不成环） |
| P7 | `No-DataName-In-Core` | `Core/Thing.cs` | 用**从 `Data/` 实际抽出的**一个字面量去 `==` 比较（集合求交判据下必然命中） |
| P8 | `No-Static-In-Core` | `Core/Thing.cs` | `static` 字段 |
| P9 | `Cycles` | `Core/Sheet.cs` | 引用 `Suit`（同层，非向上边，且 `Suit → Sheet` 已存在 ⇒ 成环，只 `Cycles` 红） |
| P10 | `String-Key-Only-In-Sheet` | `Core/Thing.cs` | `Dictionary<string, int>`（作用域是 `Core/`，故只有本条红） |
| P11 | `No-Upward-Edge`（判据①） | `Core/Report.cs` | 引用 `Clash`（0 层引用 4 层 = 向上边；`Clash` 的图到不了 `Report` ⇒ 不成环，只本条红） |
| P12 | `No-Upward-Edge`（判据②） | `Core/` 下新增文件 `Core/Stray.cs` | 一个未被层表登记的 Core 文件 ⇒ 只本条红 |
| P13 | `Spec-Naming` | `Spec/` | 一个不以 `Spec` 结尾的类型名 |
| P14 | `Names-Are-Chinese` | `Data/Forge.cs` | 一个长度 ≥ 2 且不含汉字的字面量（证伪者实测的 ENGLISH 变异） |
| P15 | `No-Orphan-Anchor` | `PLAN.md` | 追加一行 `\| A99 \| 假锚点 \| 假断言 \|`（规划里凭空多一个锚点） |
| P16 | `No-Filler` | `Core/Thing.cs` | `class ItemManagerBase` + 字段 `helper`（**后边界 + 小写**，第一版与第二版正则都漏掉的形状） |
| P17 | `No-Impl-In-Core`（**失明地板**） | `Core/` 全部文件 | 把每个文件套进块级 `namespace` 并缩进（**行首正则全部失明** ⇒ `types=0` 的假绿通道。三条依赖 token 扫描的检查会同时静默，由 `No-Impl-In-Core` 的失明地板报红；`Cycles` 另有 `types>0` 地板兜全树失明） |
| P18 | `No-Now-In-Affect` | `Data/Gear.cs` | 把 `HeavyBlade` 的判据从 `Origin` 改回 `Now`（**第二轮证伪者的注入，当时 40+14+17 全绿**） |

**P7 是这套检查里最关键的一条**：它验 `No-DataName-In-Core` 的来源是否真的从 `Data/` 推导。若探针手写一个 `Data/` 里不存在的字面量，检查照绿 ⇒ 探针报失败，**"来源缺陷"当场暴露**。

**P6/P9/P11 的注入位置是钉死的**：P6 若注入 `Core/Equip.cs`，会同时造出 `Equip ↔ Gear` 的环，把 `Cycles` 一起弄红——探针会假失败，进而把实现者引向削弱检查（法官实测 X7）。

**已知的探针弱点（明写，不掩盖）**：整套结构检查的覆盖面全押在 `-Probe` 会被跑。法官实测 X4：把源码全部套一层块级 `namespace`，`check-cycles.mjs` 会打印 `types=0 edges=0 CYCLES=0` 的**假绿**，同时静默清空 `Cycles`/`No-Impl-In-Core`/`No-Upward-Edge` 三条。这一次探针网能兜住（P6 期望红却拿到绿 ⇒ 探针失败），所以它是单点依赖，不是漏洞。**结论：`checks.ps1` 不带 `-Probe` 的结果不采信。**

全部探针跑完后，**对原始目录复跑一次**，必须全绿。
