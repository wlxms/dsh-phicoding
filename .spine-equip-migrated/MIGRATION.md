# 迁移记录：`.spine-equip` → 接口模块版

**日期**：2026-11-18
**源**：`.spine-equip`（未改动）
**目标**：`.spine-equip-migrated`
**依据**：[phicoding-interface-modules-handbook.md](../phicoding-interface-modules-handbook.md)
与 `0900`–`0930` 四条硬规则。

## 1. 迁移前 / 后

| 指标 | 迁移前 | 迁移后 |
| --- | --- | --- |
| `.cs` 文件 | 23 | 36（拆分概念实现目录 + 独立 Load 项目） |
| 代码行 | 1,150 | 1,169（只搬不改逻辑；加了 boundary waiver 注释与空行分组） |
| 类型 | 41 | 41 |
| 接口 | **0** | **5** |
| 抽象类 | 9 | 4（`WeaponKind` / `ArmorKind` / `TrinketKind` / `OffHandKind`，都实现 `IItemKind`） |
| struct | 3 | 3（全部在 `Models/`） |
| 引用边 | 420 | 411 |
| 行为断言 | 137 | **137 / 137 PASS** |

类型总数不变：5 个抽象概念变成接口，4 个 `Kind` 抽象保留为共享实现（改名消歧），其余类型只是换目录。

## 2. 目录映射

| 旧 | 新 |
| --- | --- |
| `src/Spine.Equip/Core/ItemKind.cs` 等 5 个抽象 | `src/Spine.Equip/Interfaces/I*.cs` |
| `src/Spine.Equip/Core/Mod.cs`、`Stats.cs` 里的 `Pool`、`Requirement.cs` 里的 `Wearer` | `src/Spine.Equip/Models/` |
| `src/Spine.Equip/Core/Character.cs` / `Item.cs` / `Scene.cs` / `Set.cs` / `Stats.cs` | `src/Spine.Equip/` 根（模块实体） |
| `src/Spine.Equip/Variants/Slots.cs` 的 `Weapon` / `Armor` / `Trinket` | `src/Spine.Equip/Slot/` |
| `Variants/Slots.cs` 里的嵌套 `Kind` | `src/Spine.Equip/ItemKind/{WeaponKind,ArmorKind,TrinketKind}.cs` |
| `Variants/Kinds.cs` | `src/Spine.Equip/ItemKind/{Sword,Plate,Robe,Ring}.cs` |
| `Variants/Jobs.cs` | `src/Spine.Equip/Job/{Warrior,Mage}.cs` |
| `Variants/Requirements.cs` | `src/Spine.Equip/Requirement/{MinLevel,ClassOnly}.cs` |
| `Variants/Stats.cs` | `src/Spine.Equip/Stat/{Attack,Defense}.cs` |
| `src/Spine.Equip/Load/` | `src/Spine.Equip.Load/`（模块外 boundary，独立 project） |
| `check/Spine.Equip.Check/Extension.cs` | 保留在模块外消费者；`OffHand.Kind` → `OffHandKind`，全部改成实现接口 |
| `check-structure.ps1` / `check-mutants.ps1` | 删除（旧的角色分层脚本已不适用） |
| `check.ps1` | 只跑行为断言；新增 `check-layout.ps1` 跑 `0900–0930` |

## 3. 迁移步骤（按手册）

1. 复制工程；建 `Interfaces/`、`Models/`、5 个概念实现目录、`src/Spine.Equip.Load/`。
2. 5 个抽象类改接口；实现类改 `: I*`，去掉 `override`（接口实现不用 `override`）。
3. `Mod` / `Pool` / `Wearer` 移入 `Models/`；`Wearer` 的 `Job` 字段改为 `IJob`。
4. `Variants` 按概念拆目录；嵌套 `Kind` 改名，消除同名类型（否则 `0910/0920/0930` 会 skip）。
5. `Load` 移出模块成独立 project；`Catalogue` / `Loader` 使用接口类型，`check` 同时引用模块与 boundary。
6. `check` 的扩展样板改接口；`OffHand.Kind` 改名 `OffHandKind`。
7. 补 `.phicoding/config.json`（author / trunk / variants / plan）、`0750` 的 6 个 boundary/槽位 waiver、长方法空行分组。

## 4. 验证

### 行为

```powershell
pwsh -NoProfile -File .\check.ps1
```

结果：`checks run: 137, failed: 0` / `RESULT: ALL PASS`。

沙箱环境说明：本机的 .NET SDK 10.0.402 缺 workload resolver 目录，`dotnet build`
在这里起不来（不是项目代码问题）。本次用 Roslyn `csc` 直接编译 module → load → check
三个程序集，再用 `dotnet exec` 跑行为检查；编译 0 错，行为 137/137。正常环境按
`check.ps1` 的 `dotnet build && dotnet run` 跑即可。

### 布局硬规则

对迁移后的工程产出 facts，逐条跑：

```powershell
node dsh-plugins/dsh-phicoding/checks/phicoding.mjs --root .spine-equip-migrated --only 09
```

或直接运行 `pwsh -NoProfile -File .\check-layout.ps1`。

| 规则 | 结果 |
| --- | --- |
| `0900-interface-structure` | 0 个 finding（exit 0） |
| `0910-reference-set` | 0（exit 0） |
| `0920-module-one-way` | 0（exit 0） |
| `0930-implementation-placement` | 0（exit 0） |

### 其余硬规则

| 规则 | 结果 |
| --- | --- |
| `0100` / `0400` / `0500` / `0600` / `0700` / `0800` | 0（exit 0） |
| `0750` | 0；6 个类型带 `waive=0750 why=plumbing`：`Catalogue`、`OffHand`、`Relic`、`Weapon`、`Armor`、`Trinket` |
| `0450` | skip（不是 UE 工程） |

`0500` 需要 `.phicoding/config.json`（author = `Administrator`）；已补。

## 5. 仍然归软审的

- **聚合根**：`Character` 是候选，但它是具体类，没有单独的 `ICharacter` / 模块入口接口；
  H5 不硬判，需要软审确认“这个模块的入口是不是它”。
- **boundary 的形状**：`src/Spine.Equip.Load` 已移出模块，`check` 是消费者；扩展样板
  （`Extension.cs`）在消费者项目里，硬规则看不到“外部概念实现”的落点，归软审。
- **抽象基类位置**：`WeaponKind` / `ArmorKind` / `TrinketKind` 放在 `ItemKind/` 概念目录，
  `0700` 已绿；H4d 的“模块根 vs 概念目录”仍归软审。
- **数据原子引用接口**：`Models/Wearer` 引用 `IJob`。硬规则允许；数据原子是否只该有最小约束，
  归软审。
- **H4b–H4d / H5 / H6** 仍未机械化；本样本只验证了 H1–H4a。
- **无子模块**：本样本只有一个模块，H3 的父子方向没有被真实覆盖；模块图只是单点。

## 6. 与旧版的关系

- 原 `.spine-equip` 保持不动，仍可跑它自己的旧检查。
- 迁移版保留全部行为断言、数据文件和核心不变量；只改类型表达、目录、构造边界。
- 旧结构脚本 `check-structure.ps1` / `check-mutants.ps1` 不适用于新目录，已删除；
  新结构检查由 `0900–0930` 承担。
