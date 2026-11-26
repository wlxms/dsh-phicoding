# 迁移记录：`.spine-equip` → 接口模块版

**日期**：2026-11-18
**源**：`.spine-equip`（未改动）
**目标**：`.spine-equip-migrated`
**依据**：[phicoding-interface-modules-handbook.md](../phicoding-interface-modules-handbook.md)
与 `META_DIR_CLASS_02`–`META_DIR_CLASS_03` 四条硬规则。

> **2026-11-24 规则族重构后的状态**：`META_DIR_CLASS_02` / `META_SURFACE_05` / `META_DIR_CLASS_03` 仍绿；C/D 族的 `META_SURFACE_01`、`META_DIR_CLASS_04`、
> `META_SURFACE_02`、`META_SURFACE_03`、`META_SURFACE_04`、`META_REF_LEVEL_01`、`SOFT_DESIGN_01`、`SOFT_DESIGN_02`、`META_REF_ACYCLIC_01`、`META_REF_ACYCLIC_02` 以及新增的
> `META_DIR_CLASS_01` / `META_DIR_ACYCLIC_01` 也全部绿。迁移样本已完成行为类接口化、“字段只持接口”改造、
> 配置 DTO 外置，并把数据对接口的反向依赖断开（详见 [README.md](README.md) 的“检查结果”）。
> 下文旧编号是历史记录，映射见 `checks/README.md`。

## 1. 迁移前 / 后

| 指标 | 迁移前 | 迁移后 |
| --- | --- | --- |
| `.cs` 文件 | 23 | 41（新增角色/种类接口 + 拆分概念实现目录 + 独立 Load 项目 + Config DTO） |
| 代码行 | 1,150 | 1,258（只搬不改逻辑；加接口、种类契约与空行分组） |
| 类型 | 41 | 51 |
| 接口 | **0** | **14**（含 `IWeaponKind` / `IArmorKind` / `ITrinketKind` / `IOffHandKind`；`IStatsMutable` 与 `IStats` 同文件） |
| 抽象类 | 9 | 4（`WeaponKind` / `ArmorKind` / `TrinketKind` / `OffHandKind`，分别实现对应 kind 接口） |
| struct | 3 | 3（全部在 `Models/`） |
| 引用边 | 420 | 434 |
| 行为断言 | 137 | **137 / 137 PASS** |

类型总数增加：抽象种类家族从 concrete implementation 直接判断，改成“种类接口 + 抽象共享实现”；`ArmorKind` 的两个实现拆到 `ItemKind/ArmorKind/`。

## 2. 目录映射

| 旧 | 新 |
| --- | --- |
| `src/Spine.Equip/Core/ItemKind.cs` 等 5 个抽象 | `src/Spine.Equip/Interfaces/I*.cs` |
| `src/Spine.Equip/Core/Mod.cs`、`Stats.cs` 里的 `Pool`、`Requirement.cs` 里的 `Wearer` | `src/Spine.Equip/Models/` |
| `src/Spine.Equip/Core/Character.cs` / `Item.cs` / `Scene.cs` / `Stats.cs` | `src/Spine.Equip/` 根（模块实体） |
| `src/Spine.Equip/Core/Set.cs` | `src/Spine.Equip/Config/SetDto.cs` + `Config/ModDto.cs`（外部配置 PureDTO，不引用模块内类型） |
| `src/Spine.Equip/Variants/Slots.cs` 的 `Weapon` / `Armor` / `Trinket` | `src/Spine.Equip/Slot/` |
| `Variants/Slots.cs` 里的嵌套 `Kind` | `src/Spine.Equip/ItemKind/{WeaponKind,TrinketKind}.cs`；`ArmorKind/` 放 `ArmorKind.cs` + `Plate.cs` + `Robe.cs` |
| `Variants/Kinds.cs` | `src/Spine.Equip/ItemKind/{Sword,Plate,Robe,Ring}.cs` |
| `Variants/Jobs.cs` | `src/Spine.Equip/Job/{Warrior,Mage}.cs` |
| `Variants/Requirements.cs` | `src/Spine.Equip/Requirement/{MinLevel,ClassOnly}.cs` |
| `Variants/Stats.cs` | `src/Spine.Equip/Stat/{Attack,Defense}.cs` |
| `src/Spine.Equip/Load/` | `src/Spine.Equip.Load/`（模块外 boundary，独立 project） |
| `check/Spine.Equip.Check/Extension.cs` | 保留在模块外消费者；`OffHand.Kind` → `OffHandKind`，全部改成实现接口 |
| `check-structure.ps1` / `check-mutants.ps1` | 删除（旧的角色分层脚本已不适用） |
| `check.ps1` | 只跑行为断言；新增 `check-layout.ps1` 跑全部语言级规则 |

## 3. 迁移步骤（按手册）

1. 复制工程；建 `Interfaces/`、`Models/`、5 个概念实现目录、`src/Spine.Equip.Load/`。
2. 5 个抽象类改接口；实现类改 `: I*`，去掉 `override`（接口实现不用 `override`）。
3. `Mod` / `Pool` / `Wearer` 移入 `Models/`；`Wearer` 的 `Job` 字段改为 `IJob`。
4. `Variants` 按概念拆目录；嵌套 `Kind` 改名，消除同名类型（否则 `0910/META_SURFACE_05/META_DIR_CLASS_03` 会 skip）。
5. `Load` 移出模块成独立 project；`Catalogue` / `Loader` 使用接口类型，`check` 同时引用模块与 boundary。
6. `check` 的扩展样板改接口；`OffHand.Kind` 改名 `OffHandKind`。
7. 补 `.phicoding/config.json`（author / trunk / variants / plan）；槽位种类判断改依赖 `I*Kind` 接口，长方法空行分组。

## 4. 验证

### 行为

```powershell
pwsh -NoProfile -File .\check.ps1
```

结果：`checks run: 137, failed: 0` / `RESULT: ALL PASS`。

沙箱环境说明：本机的 .NET SDK 10.0.402 缺 workload resolver 目录，`dotnet build`
在这里被 `TreatWarningsAsErrors` 放大成失败（不是项目代码问题）。本次在临时副本里关闭
该属性后 `dotnet build` 三个程序集，再直接运行 check；编译 0 错，行为 137/137。
正常环境按 `check.ps1` 的 `dotnet build && dotnet run` 跑即可。

### 布局硬规则

对迁移后的工程产出 facts，逐条跑：

```powershell
node dsh-plugins/dsh-phicoding/checks/phicoding.mjs --root .spine-equip-migrated
```

或直接运行 `pwsh -NoProfile -File .\check-layout.ps1`（现在跑全部语言级规则）。

| 规则 | 结果 |
| --- | --- |
| `META_DIR_CLASS_02` | 0 个 finding（exit 0） |
| `META_SURFACE_05` | 0（exit 0） |
| `META_DIR_CLASS_03` | 0（exit 0） |
| `META_SURFACE_01` | 0（exit 0；Config PureDTO 在接口中允许） |
| `META_DIR_CLASS_04` | 0（exit 0；struct 一律算数据） |
| `META_SURFACE_02` | 0（exit 0；`Character` / `Item` / `Scene` / `Stats` 已实现接口） |
| `META_SURFACE_03` | 0（exit 0；模块内 class 数据概念有接口，Config DTO 豁免） |
| `META_SURFACE_04` | 0（exit 0；`SetDto` / `ModDto` 不引用模块内类型） |
| `META_REF_LEVEL_01` | 0（required/delta 基线；无 waiver） |
| `SOFT_DESIGN_01` | 0（实体字段只持接口；无 waiver） |
| `SOFT_DESIGN_02` | 0（exit 0） |
| `META_REF_ACYCLIC_01` | 0（exit 0） |
| `META_REF_ACYCLIC_02` | 0（exit 0） |
| `META_DIR_CLASS_01` | 0（exit 0） |
| `META_DIR_ACYCLIC_01` | 0（exit 0） |

### 其余硬规则

| 规则 | 结果 |
| --- | --- |
| `PROFILE_STYLE_01` / `META_NAMING_01` / `PROFILE_STYLE_02` / `PROFILE_STYLE_03` | 0（exit 0） |
| `META_NAMING_02` | skip（不是 UE 工程） |

`PROFILE_STYLE_02` 需要 `.phicoding/config.json`（author = `Administrator`）；已补。

## 5. 仍然归软审的

- **聚合根**：`Character` 已实现 `ICharacter`，但它是不是模块唯一入口仍需软审；H5 不硬判。
- **boundary 的形状**：`src/Spine.Equip.Load` 已移出模块，`check` 是消费者；扩展样板
  （`Extension.cs`）在消费者项目里，硬规则看不到“外部概念实现”的落点，归软审。
- **抽象基类位置**：`WeaponKind` / `ArmorKind` / `TrinketKind` 放在 `ItemKind/` 概念目录，
  `META_SURFACE_02` / H4d 的“模块根 vs 概念目录”仍归软审。
- **数据与接口的方向**：`Models` 里的 `Mod.Stat` / `Wearer.Job` 改存 `Type`，避免 `Models ↔ Interfaces` 同级环；`Set` 改为 `Config/` 的 PureDTO，接口只在参数/返回中作为外部已知数据引用。数据字段是否应该一直退化到 `Type`（而不是某个更窄的数据契约）仍归软审。
- **H4b–H4d / H5 / H6** 仍未机械化；本样本只验证了 H1–H4a。目录层新增的 `META_DIR_CLASS_01` / `META_DIR_ACYCLIC_01` 已硬判。
- **无子模块**：本样本只有一个模块，H3 的父子方向没有被真实覆盖；模块图只是单点。

## 6. 与旧版的关系

- 原 `.spine-equip` 保持不动，仍可跑它自己的旧检查。
- 迁移版保留全部行为断言、数据文件和核心不变量；只改类型表达、目录、构造边界。
- 旧结构脚本 `check-structure.ps1` / `check-mutants.ps1` 不适用于新目录，已删除；
  新结构检查由 `META_DIR_CLASS_02`–`META_DIR_CLASS_03`、`META_SURFACE_01`–`META_SURFACE_04`、`META_REF_LEVEL_01`–`META_REF_ACYCLIC_02`、`META_DIR_CLASS_01`–`META_DIR_ACYCLIC_01` 承担。
