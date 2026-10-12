# Spine.Equip

一个最小完备的装备系统模型：槽位、种类、加算/乘算贡献、使用需求、套装效果、四种清理时机，以及数据驱动的种类装载。

## 跑一次

```powershell
pwsh -NoProfile -File .\check.ps1          # 构建 + 行为检查 + 结构检查
pwsh -NoProfile -File .\check-structure.ps1            # 只跑结构红线
pwsh -NoProfile -File .\check-structure.ps1 -SelfTest  # 结构红线 + 13 个反例必须变红
pwsh -NoProfile -File .\check-mutants.ps1              # 往核心里注入 5 个坏实现，行为检查必须变红
```

`check.ps1` 退出码 0 = 全绿。

## 目录

| 目录 | 是什么 | 允许出现什么 |
| --- | --- | --- |
| `src\Spine.Equip\Core\` | 主干：模型与不变量 | 抽象；**不允许**出现任何名字、字符串、具体变体、static 状态 |
| `src\Spine.Equip\Variants\` | 具体变体：槽位、种类、属性、职业、需求 | 具体类型 |
| `src\Spine.Equip\Load\` | 装载层：`Catalogue` 登记表 + `Loader` JSON 解析 | 名字（**唯一的缝**） |
| `check\Spine.Equip.Check\` | 可运行的行为检查（控制台程序） | 用户面用法，含"新增一种槽位"的扩展示范 |
| `data\*.json` | 数据 | 名字与数值 |

## 加一个"解释"要写几处

| 想做的事 | 代价 |
| --- | --- |
| 加一件装备（已有种类/套装/需求形状） | **0 处代码**，只加一行 JSON |
| 加一种装备种类（例：`wand`） | **1 个类型 + 1 行登记**：`sealed class Wand : OffHand.Kind` + `catalogue.Kinds.Add("wand", new Wand())` |
| 加一种槽位（例：`offhand`） | **1 个类型 + 1 行登记**：`sealed class OffHand : Slot`（内含 `Kind` 基类）+ `catalogue.Slots.Add("offhand", new OffHand())` |
| 加一种使用需求（例：`level_max`） | **1 个类型 + 1 行登记**：`sealed class MaxLevel : Requirement` + `catalogue.Requires.Add("level_max", e => new MaxLevel(e.GetInt32()))` |
| 加一种属性（例：`focus`） | **1 个类型 + 1 行登记**：`sealed class Focus : Stat` + `catalogue.Stats.Add("focus", new Focus())` |

核心（`Core\`）在以上任何一种情况下都是 0 行改动——`check-structure.ps1` 的"core contains no variant type"就是这条的机械判据：变体名清单**从工厂的登记行推导**，核心一旦出现任何一个即变红。

`check\Spine.Equip.Check\Extension.cs` 就是一个照抄样板：它在**库之外**新增了 `OffHand` 槽位、`Wand` 种类、`Focus` 属性、`MaxLevel` 需求，然后装载 `data\extension.json` 并走通全流程。

## 主干的不变量

- **一份真相**：角色身上的 `worn`（槽位 → 占用物）是唯一状态。属性账本 `Stats` 与套装激活都是**从它重新算出来的**，不是增量加减。因此"旧装备贡献被完全撤销"是结构保证，不依赖记账纪律。
- **加算与乘算分开**：`Pool{Flat,Ratio}`，`Final = Flat * Ratio`。加算进 `Flat`、乘算进 `Ratio`，所以施加顺序不参与结果。
- **四种清理时机归一**：主动卸下 / 装备销毁 / 角色死亡 / 场景卸载 全部走同一个幂等的 `Clear`，顺序不保证也无所谓；24 种排列都被检查覆盖。
- **装备实例唯一**：一件被穿着的装备不能被另一个角色再穿（`Item.Held`）。
- **装载期不抛，查找期可抛**：引用了未登记的种类/需求/槽位/职业 = 警告；重复 id、悬空 set id、非法数值 = 错误；两者都跳过该条目、不产出半成品；只有文件读不了/JSON 语法错才抛。

## 数据格式

```json
{
  "sets": [ { "id": "iron", "pieces": 3, "mods": [ { "stat": "defense", "add": 8 }, { "stat": "attack", "mul": 1.2 } ] } ],
  "items": [ { "id": "iron-sword", "kind": "sword", "set": "iron",
               "requires": [ { "level_min": 3 } ],
               "mods": [ { "stat": "attack", "add": 8 } ] } ],
  "characters": [ { "id": "hero", "level": 7, "job": "warrior",
                    "slots": [ "weapon", "armor", "trinket" ],
                    "basis": { "attack": 10, "defense": 5 } } ]
}
```

`kind` / `slot` / `stat` / `job` / 需求键 / `set` 都以字符串出现在数据里，只在 `Catalogue` 与 `Loader` 被解释成类型；主干拿到的已经是类型。

## 检查清单

| 文件 | 能判定什么 |
| --- | --- |
| `check.ps1` | 构建 + 行为检查 + 结构检查，一条命令的总闸 |
| `check\Spine.Equip.Check\Program.cs` | 137 条行为断言（见脚本输出分节） |
| `check-structure.ps1` | 12 条结构红线，含依赖无环、核心无名字/无变体/无字符串/无 static |
| `check-structure.ps1 -SelfTest` | 17 个反例注入临时副本，逐条验证红线真的会红 |
| `check-mutants.ps1` | 6 个坏核心（不卸下旧装备 / 不重置账本 / 套装阈值差一 / 场景卸载空转 / 无视需求 / 允许一件两穿），验证行为检查真的会红；外加一个"编译不过的变异体必须不算被抓到"的对照 |

改动前请先读 `REPORT.md`（判断点、刻意没做的、不可判定的需求、独立复审结论）。
