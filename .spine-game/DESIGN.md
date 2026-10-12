> **结构检查已迁移。** 本文提到的 `checks.ps1` 已删除；15 条结构检查与其探针自验
> 已由 `phicoding` 承接（13 条规则 + 13 个探针，宿主在 dsh-phicoding 包内）。
> 本文正文保留原样——它是当时那一版的证据，不追改。

# 设计说明

规划全文与三轮评审记录见 [PLAN.md](PLAN.md)。本文件只讲**做成了什么**、**为什么这么做**、**哪里还欠需求方一句话**。

## 1. 需求 → 落地 → 守卫断言

| 需求"必须有" | 落地 | 守卫断言 |
| --- | --- | --- |
| 属性：加算与乘算两种修正 | `Value`（基础值 + 加算表 + 乘算表）、`Shift`（`Plus` / `Times`） | A1、A1b、A16、A16b |
| 装备：若干槽、一槽一件 | `Slot`、`Equip`、`Thing.Wear`、`Thing.Unwear` | A2、A3、A5 |
| 装备：换装时旧件效果**完全消失** | `Thing.Settle()` = 全清 + 全量重挂 | A2 |
| 装备：使用需求（等级 / 职业门槛） | `Require`（`AtLeast` 属性下限 / `Brand` 标记） | A3、A17 |
| 装备：成套，凑够件数触发额外效果 | `Suit`（`sealed` 数据：阈值 + `Shift[]`） | A4 |
| 道具：消耗品，用了产生效果 | `Consumable.Use(Sheet)`、`Thing.Hold` / `Thing.Use` | A14、A14b、A15 |
| 检定：骰子 + 修正 对抗 难度 | `Check`（返回 `Trial`）、`Dice`（`Die` / `Many` / `Fixed`） | A6 |
| 战斗：轮流检定，打中扣血，血空了倒下 | `Duel`、`Clash` | A7a、A7b、A18 |
| 三类对象共享一套体系，差别用数据定义 | 只有一个 `Thing` 类型；差异全在 `Data/Templates.cs` | A8 + A9a |
| 中国风：属性名、物件名、事件文案 | 全部落在 `Data/`；`Core/` 里没有任何 `Data/` 字面量 | A9b |

## 2. 设计模式

### 2.1 用了哪些

| 模式 | 用在哪 | 为什么 |
| --- | --- | --- |
| **Type Object（类型对象）** | 装备/道具种类 = CLR 类型；`Data/Forge.cs` 是"名字 → 类型"的**唯一**位置 | 种类携带**行为**。数据表只能表达既有解释的组合，表达不了新解释 |
| **Composite（组合）** | `Shift[]` 组成装备与套装效果、`Require[]` 组成需求、`Total(params Adjust[])` | 组合是开放的，组合器本身是抽象的实现，所以"组合"不需要主干支持 |
| **Strategy（策略）** | `Dice`、`Adjust`、`Report` | 同一位置多实现，且必须可替换（检查要定骰与静音） |
| **Null Object（空对象）** | `Report` 的 `Mute` | 检查要完整跑流程但不刷屏 |
| **Ledger / Accumulator（修正累积）** | `Value`：基础值一份真相，修正分加算表与乘算表累积 | 状态只有一份；聚合无分支 |
| **Rebuild over Undo（重建代替撤销）** | `Thing.Settle()` = `Clear()` + 按**槽位名序**全量重挂 | **本设计最重要的一步**：把"撤销配对"整个删掉，"完全消失"成为结构性保证而非纪律。按槽位名序遍历让结果只取决于**穿戴集合**，不取决于穿戴历史 |
| **Prototype（共享原型）** | `Forge` 持无状态物品实例，多个 `Thing` 共享 | 装备与道具无状态（效果写在卡上，不在物品上），共享安全 |
| **Registry（登记表）** | `Data/Forge.cs` | 唯一窄缝；`Dictionary.Add` 重复键**显式抛**，不静默覆盖 |

### 2.2 为什么不是另外几个

| 候选 | 为什么不用 |
| --- | --- |
| **把种类做成数据表** | 数据表扩大的是**"谁能表达"**（策划不重编译）与**"要不要重编译"**，**不是"能表达什么"**——策划的自由度 = 既有解释的组合。一旦要"吸血刀"（新行为），数据表撑不住，必须回头改主干。所以**种类必须是类型，数值才是数据**。真正 0 处代码的只有"新属性/新物种/新数值"三类，它们留在数据层 |
| **继承层级分怪物 / NPC / 角色** | 需求原话"不要做三套相似的东西"。更深一层：这三者**没有任何行为差异**——都能穿装备、都被打、都能用道具。"怪物能穿装备"和"角色能穿装备"是同一段代码。为不存在的差异建抽象是最典型的过度设计 |
| **完整 ECS** | ECS 付出"数据与行为分离、结构由 System 遍历顺序定义"的认知成本，换**缓存友好与百万实体规模**。这是控制台文字游戏，一个场景两个对象打架，且需求把"以人为本（简单清晰易读 > 高性能）"排第一。收益为 0、成本全额支付。**但借用了 ECS 的一件东西**：数值与行为分离（`Value` 是纯数据，`Shift` 是行为），只是没引入 Entity / System 两层 |
| **访客 Visitor** | Visitor 解决"对一组**封闭**类型集合反复加新操作"。这里变体集合是**开放**的（需求要不断加装备种类）。开放集合上做 Visitor，每加一个变体就要改所有 Visitor——方向正好相反 |
| **装饰器 Decorator** | 装饰器是"运行期层层包裹同一接口"。这里装备不是包在角色外面，而是往卡上挂一组修正，且**每次换装全部重建**。装饰器要求每层转发全部接口，对公开面增长敏感 |
| **观察者 Observer / 事件** | 事件解决"变化要通知多方，且订阅者运行期才知道"。这里订阅者是**固定的一个**——`Thing` 自己 |
| **撤销（Undo）** | 撤销要求每个操作配一个逆操作且精确配对——这正是第一版被打回的两处缺陷的来源。`Settle()` 用重建代替撤销，逆操作不存在，配对错误也就不存在 |
| **单例 Singleton** | 数据表是 `static readonly` 字段而非单例——没有实例唯一性需求，也没有生命周期管理需求 |
| **枚举 `SlotKind` / `DamageKind`** | 枚举把"可新增的集合"变成"必须改主干并重编译的封闭集合"。槽位用 `Slot` 实例（可新增、能当字典键），修正算法用 `Plus` / `Times` 类型（能 `is`、各自携带数据） |

## 3. 真实依赖边表（`check-cycles.mjs` 输出，不是手抄）

下面是 **`Core/` + `Data/` 的完整边表**；`checks.ps1` 每次运行都打印**全仓**（含 `Program.cs`、`Spec/`）的完整边表。

```
Core\Adjust.cs       -> Sheet, Value
Core\Check.cs        -> Dice
Core\Clash.cs        -> Adjust, Dice
Core\Consumable.cs   -> Item, Sheet
Core\Duel.cs         -> Check, Clash, Dice, Report, Thing, Value
Core\Equip.cs        -> Item, Require, Sheet, Shift, Slot, Suit
Core\Require.cs      -> Sheet, Value
Core\Sheet.cs        -> Value
Core\Shift.cs        -> Sheet, Value
Core\Suit.cs         -> Sheet, Shift
Core\Thing.cs        -> Consumable, Equip, Sheet, Slot, Suit
Data\Clashes.cs      -> Adjust, Clash, Dice
Data\Drugs.cs        -> Consumable, Sheet, Value
Data\Forge.cs        -> Consumable, Equip, Item, Require, Drugs, Gear, Suits
Data\Gear.cs         -> Equip, Require, Sheet, Shift, Slot, Suit, Value, Slots
Data\Slots.cs        -> Slot
Data\Suits.cs        -> Shift, Suit
Data\Templates.cs    -> Thing, Forge
```

**关键不变量**：`Core/Thing.cs` 出现 `Equip`，但 `Core/Equip.cs` **不出现 `Thing`**——反向只到 `Sheet` 为止，而 `Sheet` 不认识任何施加者。这是"装备作用于数值卡，不作用于游戏对象"的直接结果，也是第一版那处环的解。

**第五处 token 撞名（证伪者发现，已修）**：`Core/Thing.cs` 里的 `entry.Value`（`KeyValuePair.Value`）撞上类型名 `Value`，造出一条 `Thing.cs -> Value.cs` 的**伪边**。改成解构 `foreach (var (_, item) in ordered)` 后消失。这与 PLAN §0.4 记录的四处同源：**该检查器按 token 建边，同名即建边**。

分层（`checks.ps1` 的 `No-Upward-Edge` 守）：

```
L0 Value Item Slot Dice Report
L1 Sheet Shift Suit Adjust Require
L2 Equip Consumable
L3 Thing Check
L4 Clash
L5 Duel
```

## 4. 新增一个"解释"要动几处

| 打算做的事 | 要动的代码 | 成本 |
| --- | --- | --- |
| 加一把新剑（数值不同） | `Data/Forge.cs` 一行 `new Sword("铁剑", 5, …)` | 1 行 |
| 加一件新装备（新数值） | 同上 | 1 行 |
| 加一个**新装备种类**（新行为） | `Data/Gear.cs` 新类型 1 个 + `Data/Forge.cs` 登记 1 行 | 1 类型 + 1 行 |
| 加一个新道具 | `Data/Drugs.cs` 新类型 1 个 + 登记 1 行 | 1 类型 + 1 行 |
| **加一个新属性** | `Data/Templates.cs` 模板里加一个键 | **0 处代码** |
| **加一个新物种**（怪物 / NPC / 角色） | `Data/Templates.cs` 加一行 `Template` | **0 处代码** |
| 加一个新套装（纯数值） | `Data/Suits.cs` 一行 `new Suit(…)` | 1 行 |
| 加一条新槽位 | `Data/Slots.cs` 一行 | 1 行 |
| 加一种新检定条件 | 继承 `Adjust` / `Require` 1 个类型 | 1 类型 |
| 加一种新修正算法 | 继承 `Shift` 1 个类型 | 1 类型 |

窄缝**唯一**：`Data/Forge.cs` 的登记表。

## 5. 检查

```
pwsh -File checks.ps1          # 15 项结构红线 + 打印全仓真实边表
pwsh -File checks.ps1 -Probe   # 18 个探针：每个注入点必须只红它声称的那一条，跑完复跑原目录
dotnet run -- --check          # 40 条核心行为断言（A1–A8、A13–A19），并核对锚点覆盖率
```

**`checks.ps1` 不带 `-Probe` 的结果不采信**：整套结构检查的覆盖面押在探针会被跑。

### 已知的假绿通道与地板

`check-cycles.mjs` 与 `checks.ps1` 的类型扫描都用**行首锚定**的正则。只要项目改用**块级 `namespace`**（顶层类型被缩进），扫描就全树失明：`types=0 edges=0 CYCLES=0`，`Cycles` / `No-Impl-In-Core` / `No-Upward-Edge` 三条**同时静默变绿**。

两道地板：
- `No-Impl-In-Core`：`Core` 或 `Data` 抽出的类型名数为 0 ⇒ **判红**（"扫描器失明"，不静默通过）。由 P17 验。
- `Cycles`：`check-cycles.mjs` 报告的 `types <= 0` ⇒ **判红**（兜全树失明）。

### 锚点覆盖率由程序自己对账

`CasesSpec` 跑完后调用 `Spec.Summary(planPath)`：把**已执行**断言里出现的锚点集合，与从 `PLAN.md` §5 推导出的锚点集合对账（结构性锚点 A9a/A9b/A10/A11/A12 由 `checks.ps1` 守）。缺一条即 exit 非零。

**为什么需要它**：`No-Orphan-Anchor` 只查"锚点 id 文本在不在文件里"。删掉 `Cases.cs` 里一行 `Fighting(spec);`，断言不再**执行**，但 `spec.That("A7a …")` 的文本还在——文本层照绿。实测：删掉后 `--check` 报 `A7a A7b A18` 缺失、exit 3；断言条数从 40 掉到 33。

这条对账第一次跑就抓出两条**伪锚点**：`PLAN.md` §5 尾部的映射行 `| A1–A8、A13–A18 |` 与 `| A9a–A12 |` 被当成了锚点 id。已收紧为"单元格必须恰好是一个锚点 id"。

### 探针抓到的四个真实缺陷

**P4 第一次跑是绿的——探针失败，检查有洞。**
`No-Filler` 原本写成 `\b(Manager|Service|Helper|Util|Impl)\b`。`\b` 要求前面是非词字符，于是 `ProbeHelper` **匹配不上**。改成 `\b[A-Za-z0-9_]*(…)\b` 后，**证伪者又实测出后边界与大小写的逃逸**：`StringUtils`、`HelperMethods`、`ItemManagerBase`、`DamageServiceImplX`、`helper`、`utils` 全部不红。已改为**子串、不分大小写** `(?i)(manager|service|helper|util|impl)`，并补 P16 专门注入 `ItemManagerBase` + `helper`。

> 同一个 `\b` 栽了两次：第一版漏**前**边界，第二版漏**后**边界。两次都是"反例只挑了让这条检查满意的形状"。这就是 `spine-check` 说的"反例要造这条检查**声称要防的那个东西**"。

**P15 第一次跑也是绿的——探针自指。**
`No-Orphan-Anchor` 原本把整个 `checks.ps1` 当作守护者文本，而探针注入的假锚点 `A99` **正好写在 `checks.ps1` 里**，于是它自己把自己证成了"有守护"。已改为只认 `Spec/Cases.cs` 与显式声明的 `$anchorGuard`。

**P17 第一次跑红错了检查。**
块级 `namespace` 的注入只让 `No-Impl-In-Core` 的失明地板报红（`Cycles` 的 `types>0` 地板兜的是全树失明，而 Data/Spec 仍能抽出类型）。探针的期望值已改成实际负责那条地板的检查。

**P18 是第二轮证伪者逼出来的。**
把 `HeavyBlade.Affect` 的判据从 `Origin` 改回 `Now`：用户可见数值从 身法 8 变成 10（条件效果静默消失），而当时 **40 条断言 + 14 项结构检查 + 17 个探针全绿**。§2.1 与 README 都把"装备 `Affect` 只能读 `Origin`"写成硬约束，**却零机制在守**。现在有了 `No-Now-In-Affect`（花括号配对取出 `override void Affect` 的方法体，体内不得出现 `.Now`），P18 每次都验它会红。

### 上一轮证伪者改了什么

| 它抓到的 | 处理 |
| --- | --- |
| **A13 无断言**（且它守的正是 PLAN §0.1 自认已修的 E4——把 `Sheet.Value` 改回"未登记就建 0 值"可 33/33 + 12/12 全绿） | 补 `Guarded()` 两条断言；新增 `No-Orphan-Anchor` 从规划反推必须存在的锚点，堵住"断言被静默删除" |
| **`HeavyBlade` 读部分聚合值 `Now`，打破"修正层 = 当前穿戴的纯函数"**（同一集合 {铁甲, 重剑} 实测得 身法 8 / 10，全绿） | `Settle()` 改为按**槽位名序**遍历（顺序由集合决定，不由历史决定）；`HeavyBlade` 的 `floor` 判定改读 `Origin`；补 A2b |
| `No-Filler` 正则逃逸面 | 改子串 + 不分大小写；补 P16 |
| `Spec.Report()` 撞类型名 `Report` 造成伪边 | 方法改名 `Summary()`；边表恢复诚实；`DESIGN §3` 也点出第五处撞名 |
| `No-Static-In-Core` 漏 `const` | 正则加 `\bconst\b` |
| `String-Key-Only-In-Sheet` 名字匹配窄 | 覆盖 7 种集合类型 + 大小写不敏感 |
| `No-Comments` 只验形状不验内容（`// NobodyAtAll - 1999-01-01 : …` 全绿） | 校验作者名必须等于 `$env:USERNAME`、日期必须能解析且不是未来 |
| 中国风零守卫 | 新增 `Names-Are-Chinese`；补 P14 |
| `Forge.Add` 静默覆盖零覆盖 | 补 A19（重复登记抛 + 未登记查找抛） |
| `-Probe` 在退化树上崩在探针循环之前，且临时目录泄漏 | 名字来源先做非空校验并给出明确原因；`try/finally` 清理临时目录 |
| 旧件去向「回背包」无法表达（`Bag` 只收 `Consumable`） | 改为明确的"不再持有"，写进 PLAN §8 L21 与 DESIGN §6 |

**第二轮证伪者又抓到三处**（都已修，且都用变异测试验过会红）：

| 它抓到的 | 处理 |
| --- | --- |
| **A2b 对它声称防的缺陷没有判别力** —— 夹具用 根骨 10 时，`重剑` 自身的 `+4` 恰好把根骨顶到 `floor=14`，缺陷被参数遮住；只有把起始根骨改成 8 才红 | 夹具改成 根骨 12 + 一个**头槽**（排序在 `手` 之前）+3 根骨件，并**钉死绝对值**：身法 **8**、根骨 **19**。实测：读 `Now` ⇒ A2b 红 ✅ |
| **「装备 `Affect` 只能读 `Origin`」零守卫**（改回读 `Now` 时 40+14+17 全绿，身法 8→10） | 新增结构检查 `No-Now-In-Affect` + 探针 P18 |
| **`No-Orphan-Anchor` 没堵住它存在的理由**（删 `Fighting(spec);` 仍全绿——文本在，只是不执行） | `--check` 自己核锚点覆盖率（见上）。实测：删 `Fighting(spec);` ⇒ exit 3、报 `A7a A7b A18` 缺失 ✅ |
| 单文件失明仍假绿（缩进一个 Data 文件 + Core 注入真实引用 `typeof(Sword)` ⇒ 全绿） | `No-Impl-In-Core` 加**逐文件**失明地板：每个 `Core/`、`Data/` 的 `.cs` 必须至少抽出一个类型名 |
| 类型抽取正则漏 `public readonly record struct`（`Core/Check.cs` 的 `Trial` 一直抽不到） | 修饰符列表补 `readonly` |
| `PLAN.md` §2.1 仍写"旧件回背包"，与 §8 L21 矛盾 | 已改（V3 之前只闭了一半） |
| `PLAN.md` §10 的 `No-Static-In-Core` / `String-Key-Only-In-Sheet` 两行未同步 | 已同步（含 `const` 与 7 种集合类型） |
| A18 断言在失败时会下标越界崩掉整段（`Shared()` 四条再也不跑） | 加 `notes.Lines.Count == 4 &&` 短路，断言失败不再中断后续用例 |
| `No-Comments` 的理由只需 1 个字符 | 要求理由 ≥ 4 个非空白字符 |

## 6. 规格留白

规划里做过的判断（L1–L31）见 [PLAN.md](PLAN.md) 第 8 节。以下是**需求方需要拍板**的部分：

| # | 需求没说清 | 我暂时怎么判的 | 拍板后会怎样 |
| --- | --- | --- | --- |
| R1 | "成套凑够件数触发**额外效果**"是否只允许数值型 | `Suit` 是 `sealed`，只有 `Shift[]` | 若要"三件套：命中回血"，`Suit` 必须升级为类型，并在 `Thing.Settle` 之外加战斗期钩子 |
| R2 | 战斗回合内能否吃药 / 换装 | 不能。`Duel` 只写气血，不碰槽位、背包、修正层 | 要战斗吃药就得放宽 `Duel` 的写面 |
| R3 | 怪物 / NPC / 角色的差别具体含哪些字段 | `Template` 只有 姓名 / 属性 / 标记 / 随身装备 / 背包 | 职业、阵营、阵营敌对关系等要靠标记补 |
| R4 | 气血是"当前值"还是"上限" | 当普通 `Value`（受加算与乘算影响） | 若要"当前 / 上限"两段，`Value` 要加一层 |
| R5 | 职业门槛里的"职业"从哪来 | 标记（`Brand`） | 与 R3 同源 |
| R6 | 骰子分布有无要求 | 无。`Die` / `Many` 随机，`Fixed` 定值 | 要"取两次高的"之类就得加 `Dice` 实现 |
| R7 | 属性名的错别字如何处理 | 查找期**直接抛** `KeyNotFoundException`，不自动建 0 值属性 | 若希望容错，需要另设"未登记属性读作 0"的开关（那会让错别字重新变成静默通过） |
| R8 | 换装 / 脱下时旧件去哪 | **不再持有**——被顶替的装备直接丢弃；`Thing.Bag` 只收消耗品 | 需求只说"旧件卸下"，没说保留。要保留须另立"退役装备"容器，并想清楚它要不要参与套装件数 |
| R9 | 装备效果能否依赖"当前部分聚合值" | **不能**。条件效果只许读 `Origin`（基础值）；读 `Now` 会让结果依赖施加顺序（证伪者实测同一集合 8 vs 10） | 若需求方要"按当前总根骨判定"，必须改成两阶段结算（先全部加算、再求值条件效果、再全部乘算），而不是放开读 `Now` |
| R10 | 打不完怎么办 | `Rounds` 上限（默认 60），超时返回 `null` = 平局并打印一行收场 | 当前实现下"平局"是常规可达结局。要不要改成"血多者胜"或无限回合，需求方定 |
