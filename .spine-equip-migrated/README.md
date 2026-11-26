# Spine.Equip（接口模块迁移版）

这是 `.spine-equip` 按 [接口模块落地手册](../phicoding-interface-modules-handbook.md) 迁移出来的版本：
**137 条行为断言保持不变，目录从角色分层（Core / Variants / Load / Check）改成模块分层
（Interfaces / Models / Config / 概念实现目录 + 模块外 boundary）**。原 `.spine-equip` 没有改动。

## 跑一次

```powershell
# 行为断言（137 条）
pwsh -NoProfile -File .\check.ps1

# 全部语言级硬规则
pwsh -NoProfile -File .\check-layout.ps1

# 等价的直接命令
node ..\dsh-plugins\dsh-phicoding\checks\phicoding.mjs --root .
```

`check.ps1` 退出码 0 = 行为全绿。`check-layout.ps1` 退出码 0 = 全部语言级硬规则绿。
全量检查里 `META_NAMING_02` 会 skip（不是 UE 工程）；其余 20 条应为 exit 0。

## 目录

| 目录 | 是什么 |
| --- | --- |
| `src\Spine.Equip\Interfaces\` | 概念层：`IItemKind` / `IWeaponKind` / `IArmorKind` / `ITrinketKind` / `IJob` / `ISlot` / `IStat` / `IRequirement` / `IItem` / `ICharacter` / `IScene` / `IStats` / `IStatsMutable` |
| `src\Spine.Equip\Config\` | 外部配置 DTO：`SetDto` / `ModDto`（只读入，不引用模块内类型） |
| `src\Spine.Equip\Models\` | 模块内 value data：`Mod` / `Pool` / `Wearer`（struct） |
| `src\Spine.Equip\ItemKind\` | `IItemKind` 的实现：三种槽位 kind 基类 + `Sword` / `Ring`；`ArmorKind/` 放抽象基类与 `Plate` / `Robe` |
| `src\Spine.Equip\Slot\` | `ISlot` 的实现：`Weapon` / `Armor` / `Trinket` |
| `src\Spine.Equip\Job\` | `IJob` 的实现：`Warrior` / `Mage` |
| `src\Spine.Equip\Requirement\` | `IRequirement` 的实现：`MinLevel` / `ClassOnly` |
| `src\Spine.Equip\Stat\` | `IStat` 的实现：`Attack` / `Defense` |
| `src\Spine.Equip\` 根 | `Character` / `Item` / `Scene` / `Stats`：模块实体与聚合根 |
| `src\Spine.Equip.Load\` | 模块外 boundary：`Catalogue` / `Loader` / `Registry` / `World` |
| `check\Spine.Equip.Check\` | 模块外消费者：行为检查 + 扩展样板（`OffHand` / `Wand` / `Relic` / `Focus` / `MaxLevel`） |
| `data\*.json` | 数据，不改 |

`Character` 是聚合根（模块入口实体），`Program` 是组合根 / 消费者；`Load` 和 `Check`
都在模块树外，符合“边界不放进模块”的形状。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| 行为断言 | **137 / 137 PASS** |
| `META_DIR_CLASS_02` / `META_SURFACE_05` / `META_DIR_CLASS_03` | 绿 |
| `PROFILE_STYLE_01` / `META_NAMING_01` / `PROFILE_STYLE_02` / `PROFILE_STYLE_03` | 绿 |
| `META_NAMING_02` | skip（不是 UE 工程） |
| `META_REF_LEVEL_01` | 绿（required/delta 基线；无 waiver） |
| `SOFT_DESIGN_01` | 绿（实体字段只持接口；无 waiver） |
| `SOFT_DESIGN_02` / `META_REF_ACYCLIC_01` / `META_REF_ACYCLIC_02` | 绿 |
| `META_SURFACE_01` / `META_DIR_CLASS_04` / `META_SURFACE_02` | 绿 |
| `META_SURFACE_03` / `META_SURFACE_04` | 绿（模块内 class 数据有接口；PureDTO 隔离） |
| `META_DIR_CLASS_01` / `META_DIR_ACYCLIC_01` | 绿（SCC 同目录、目录图无环） |

除 `META_NAMING_02` 外，当前 20 条语言级硬规则全部 exit 0。

## 关键变化

1. **5 个抽象概念改成接口**：`ItemKind` → `IItemKind`，`Job` → `IJob`，`Slot` → `ISlot`，
   `Stat` → `IStat`，`Requirement` → `IRequirement`。
2. **行为类也抽了接口**：`Character : ICharacter`、`Item : IItem`、`Scene : IScene`、
   `Stats : IStatsMutable`；`Character` 的字段/属性只持有 `IItem` / `IStats` / `IScene`。
3. **3 个 struct 留在 `Models/`**：`Mod` / `Pool` / `Wearer`，struct 一律按 value data 处理。
4. **`Set` 改成外部配置 DTO**：`Config/SetDto` + `Config/ModDto`；不再有 `ISet`，DTO 不引用模块内类型，Loader 在边界转换。
5. **数据反向依赖接口被断开**：`Mod.Stat` 改成 `Type`、`Wearer.Job` 改成 `Type`、
   `ClassOnly` 存 `Type`；这样 `Models/` 不再反向依赖 `Interfaces/`，`Models` 与
   `Interfaces` 的依赖保持单向（META_DIR_ACYCLIC_01）。
6. **`Variants/` 拆成概念实现目录**：`ItemKind/`、`Slot/`、`Job/`、`Requirement/`、`Stat/`。
7. **嵌套 `Kind` 改名**：`WeaponKind` / `ArmorKind` / `TrinketKind` / `OffHandKind`，消除同名歧义。
8. **`Load/` 移出模块**：成为独立的 `src\Spine.Equip.Load` project，check 同时引用模块与 boundary。
9. **扩展样板使用接口**：`OffHand : ISlot`、`Wand : OffHandKind`、`Focus : IStat`、`MaxLevel : IRequirement`。

完整的前后对照、验证方式、保留的软审项见 [MIGRATION.md](MIGRATION.md)。
