# Spine.Equip（接口模块迁移版）

这是 `.spine-equip` 按 [接口模块落地手册](../phicoding-interface-modules-handbook.md) 迁移出来的版本：
**137 条行为断言保持不变，目录从角色分层（Core / Variants / Load / Check）改成模块分层
（Interfaces / Models / 概念实现目录 + 模块外 boundary）**。原 `.spine-equip` 没有改动。

## 跑一次

```powershell
# 行为断言（137 条）
pwsh -NoProfile -File .\check.ps1

# 接口模块硬规则 0900–0930（需要仓库里的 dsh-phicoding 检查器）
pwsh -NoProfile -File .\check-layout.ps1
```

`check.ps1` 退出码 0 = 行为全绿。`check-layout.ps1` 退出码 0 = 布局规则全绿；
规则在工程没有 `Interfaces/` 时会 skip，这个迁移版不会 skip。

## 目录

| 目录 | 是什么 |
| --- | --- |
| `src\Spine.Equip\Interfaces\` | 概念层：`IItemKind` / `IJob` / `ISlot` / `IStat` / `IRequirement` |
| `src\Spine.Equip\Models\` | 数据原子：`Mod` / `Pool` / `Wearer`（struct） |
| `src\Spine.Equip\ItemKind\` | `IItemKind` 的实现：三种槽位 kind 基类 + `Sword` / `Plate` / `Robe` / `Ring` |
| `src\Spine.Equip\Slot\` | `ISlot` 的实现：`Weapon` / `Armor` / `Trinket` |
| `src\Spine.Equip\Job\` | `IJob` 的实现：`Warrior` / `Mage` |
| `src\Spine.Equip\Requirement\` | `IRequirement` 的实现：`MinLevel` / `ClassOnly` |
| `src\Spine.Equip\Stat\` | `IStat` 的实现：`Attack` / `Defense` |
| `src\Spine.Equip\` 根 | `Character` / `Item` / `Scene` / `Set` / `Stats`：模块的实体与聚合根候选 |
| `src\Spine.Equip.Load\` | 模块外 boundary：`Catalogue` / `Loader` / `Registry` / `World` |
| `check\Spine.Equip.Check\` | 模块外消费者：行为检查 + 扩展样板（`OffHand` / `Wand` / `Relic` / `Focus` / `MaxLevel`） |
| `data\*.json` | 数据，不改 |

`Character` 是聚合根候选（模块的入口实体），`Program` 是组合根 / 消费者；`Load` 和 `Check`
都在模块树外，符合“边界不放进模块”的形状。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| 行为断言 | **137 / 137 PASS** |
| `0900-interface-structure` | 绿 |
| `0910-reference-set` | 绿 |
| `0920-module-one-way` | 绿 |
| `0930-implementation-placement` | 绿 |
| `0100` / `0400` / `0500` / `0600` / `0700` / `0800` | 绿 |
| `0750` | 绿（6 个 boundary / 槽位类型带 `waive=0750 why=plumbing`） |
| `0450` | skip（不是 UE 工程） |

## 关键变化

1. **5 个抽象概念改成接口**：`ItemKind` → `IItemKind`，`Job` → `IJob`，`Slot` → `ISlot`，
   `Stat` → `IStat`，`Requirement` → `IRequirement`。
2. **3 个 struct 进 `Models/`**：`Mod` / `Pool` / `Wearer`。
3. **`Variants/` 拆成概念实现目录**：`ItemKind/`、`Slot/`、`Job/`、`Requirement/`、`Stat/`。
4. **嵌套 `Kind` 改名**：`WeaponKind` / `ArmorKind` / `TrinketKind` / `OffHandKind`，消除同名歧义。
5. **`Load/` 移出模块**：成为独立的 `src\Spine.Equip.Load` project，check 同时引用模块与 boundary。
6. **扩展样板使用接口**：`OffHand : ISlot`、`Wand : OffHandKind`、`Focus : IStat`、`MaxLevel : IRequirement`。

完整的前后对照、验证方式、保留的软审项见 [MIGRATION.md](MIGRATION.md)。
