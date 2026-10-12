# 中国风 DND 肉鸽 MUD 框架

`net10.0`，零 NuGet 依赖。文字游戏框架，跑控制台。

- 需求原文：[REQUIREMENT.md](REQUIREMENT.md)
- 设计与模式点名：[DESIGN.md](DESIGN.md)
- 规划与三轮评审记录：[PLAN.md](PLAN.md)

## 运行命令

```
dotnet run --project H:\Git\dsh-mydsh\.spine-game\SpineGame.csproj
```

跑演示：三张数据行造出少侠 / 山贼 / 药铺掌柜，走一遍换装、使用需求、套装、道具、检定、战斗。

```
dotnet run --project H:\Git\dsh-mydsh\.spine-game\SpineGame.csproj -- --check
```

跑 40 条核心行为断言（A1–A8、A13–A19），并在末尾把**已执行**的断言锚点与 `PLAN.md` 里的锚点对账——规划里有锚点却没有断言在执行，就 exit 非零。全过 exit 0。

```
node H:\Git\dsh-mydsh\dsh-plugins\dsh-phicoding\checks\phicoding.mjs --root H:\Git\dsh-mydsh\.spine-game
```

15 项结构红线（`else` / `switch` / `enum` / 填充词 / 注释（含作者与日期核对）/ 主干认不认实现类型与数据名 / 分层单向 / 依赖环 / 主干零 `static` 与 `const` / 字符串键越界 / 脚手架命名 / 画面文字是中文 / 锚点无孤儿 / 装备 `Affect` 不读 `Now`），并打印 `check-cycles.mjs` 算出的**全仓**真实边表。

```
node H:\Git\dsh-mydsh\dsh-plugins\dsh-phicoding\checks\phicoding.mjs --root H:\Git\dsh-mydsh\.spine-game --probe
```

18 个探针：把源码复制到临时目录，逐个注入一处它声称要防的东西，断言**只有对应的那一条检查变红**；跑完对原始目录复跑一次必须全绿。**这个模式才是自审的可信来源**——不带 `-Probe` 的结果不采信。

## 目录

```
Core/     主干 16 个文件。不认识 Data/ 的任何类型名与字面量。
Data/     数据层：槽位、装备种类、道具种类、套装、交手规则、登记表、模板。
Spec/     行为断言的夹具与用例。
Program.cs 装配层：演示 / --check。
phicoding 结构检查（13 条规则）+ 探针自验（13 个）。
```

## 主干一览

| 文件 | 是什么 |
| --- | --- |
| `Value.cs` | 一个可被修正的数：`Now = (Origin + Σ加算) × Π乘算 ÷ 100ⁿ`，乘算乘积先算完，最后一次整数除 |
| `Sheet.cs` | 数值卡：一组命名数值 + 一组标记。修正的作用面，也是**主干内**唯一的字符串键处（数据层另有 `Forge` 的种类表与 `Template` 的属性表用名字做键） |
| `Shift.cs` | 修改数值的算法：`Plus` 加算 / `Times` 乘算 |
| `Suit.cs` | 套装：件数阈值 + 一组修正 |
| `Item.cs` / `Equip.cs` / `Consumable.cs` | 物品 / 装备（槽 + 需求 + 套装 + `Shift[]`）/ 消耗品 |
| `Slot.cs` | 槽位键 |
| `Require.cs` | 使用需求：`AtLeast` 属性下限 / `Brand` 标记 |
| `Dice.cs` | 骰：`Die` / `Many` 随机，`Fixed` 定值 |
| `Check.cs` | 一次检定：骰子 + 修正 对抗 难度，返回 `Trial` |
| `Adjust.cs` | 取修正值：`Flat` / `Score` 属性值 / `Total` 求和 |
| `Clash.cs` | 交手规则：骰、攻击、防守、伤害、气血、难度、回合上限 |
| `Thing.cs` | 游戏对象：身份 + 数值卡 + 槽位 + 背包；`Settle()` 全清重挂 |
| `Duel.cs` | 战斗流程：轮流检定、命中扣血、血空倒下、超时平局 |
| `Report.cs` | 文案出口：`Screen` / `Mute` / `Notes` |

## 核心不变量

**修正层 = 当前穿戴集合的纯函数。** `Thing.Settle()` 做的是 `Clear()` + 按**槽位名序**遍历当前槽位与当前套装全量重挂。所以"换装时旧件效果完全消失"不是靠小心配对撤销，而是**没有可残留的容器**——这让"完全消失"成为结构性保证。

按槽位名序而不是按字典枚举序，是为了让结果**只取决于穿戴集合，不取决于穿戴历史**。配套约束：装备 override 的 `Affect` 只能读 `Origin`（基础值），**不得读 `Now`**——`Now` 是部分聚合值，读它就把顺序依赖放了回来。

**装备作用于数值卡（`Sheet`），不作用于游戏对象（`Thing`）。** 这就是 `Core/Equip.cs` 里不出现 `Thing` 这个 token 的原因，也是依赖无环的原因。

**三类游戏对象之间不存在类型差异。** 怪物 / NPC / 角色都是 `Thing`，差别全在 `Data/Templates.cs` 的数据行里。
