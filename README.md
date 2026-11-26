# dsh-phicoding · Philosophy Coding

把一套**自有的编码哲学**做成可强制执行的形态：**6 个常驻技能**（软性）+ **一个硬性检查器**（21 条语言级规则 + 项目自带规则）。

不是文档，是**闸**——规则要么能被机器判定，要么就得先证明它判不了。

## 这套东西分两层

| 层 | 是什么 | 在哪 |
| --- | --- | --- |
| **软性** | 6 个技能，常驻（每个会话都在） | [`dsh-plugins/dsh-phicoding/skills/`](dsh-plugins/dsh-phicoding/skills) |
| **硬性** | 一条命令跑 20 条语言级规则 + 项目自带规则：元规则递进硬审，profile 半硬，soft 只审查 | [`dsh-plugins/dsh-phicoding/checks/`](dsh-plugins/dsh-phicoding/checks) |
| **执行契约** | 插件内 [`AGENTS.md`](dsh-plugins/dsh-phicoding/AGENTS.md) 强制“先读技能、写完跑检查”；Copilot 用 `.github/copilot-instructions.md` | [`dsh-plugins/dsh-phicoding/`](dsh-plugins/dsh-phicoding) |

检查器内部按 `meta → profile → soft` 分层：六个 meta 阶段顺序执行，前一个阶段红了，后面的 meta 阶段与 profile/soft 标 `BLOCKED`，不会把未跑的规则报成绿。

## 装进 VS Code Copilot（全局，一条命令）

phicoding 的 6 个技能就是 **Agent Skills**（`SKILL.md` + frontmatter，开放标准），所以能直接装进 Copilot。
装到**你自己账户下**，对所有仓库生效，不碰任何项目目录。

```powershell
# Windows
irm https://raw.githubusercontent.com/wlxms/dsh-phicoding/main/install-copilot.ps1 | iex
```

```sh
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/wlxms/dsh-phicoding/main/install-copilot.sh | sh
```

脚本会从 GitHub 拉源码、现场构建，然后装到 `~/.copilot/skills/`（技能）与 `~/.copilot/phicoding/`（检查器）。
`-Shared` / `--shared` 会同时装到 `~/.agents/skills/`（跨 Agent 的标准位置）。

**同一个脚本就是更新器**：再跑一次即可。它比对内容指纹，没变化就什么都不做，有变化就整份替换并打印新旧指纹。

```powershell
.\install-copilot.ps1              # 更新（内容没变则提示"已是最新"）
.\install-copilot.ps1 -Force       # 指纹相同也重装
.\install-copilot.ps1 -Uninstall   # 卸载（不需要网络）
```

`~/.copilot/.installed.json` 记录了装的是哪个指纹、什么时候装的。

### 本地开发：让 Copilot 跟随当前工作区

上面的安装是“构建后复制”的快照；要让 Copilot 实时看到**当前工作区**（包括未提交的
技能 / 规则改动），用链接模式：

```powershell
pwsh -NoProfile -File .\link-copilot.ps1
```

Windows 创建符号链接通常需要管理员权限，脚本用 **junction（目录重解析点）** 做等价链接；
它会把 `~/.copilot/skills/phicoding*` 和 `~/.copilot/phicoding` 指到本仓库的
`dsh-plugins/dsh-phicoding`。已有的真实安装先备份到
`~/.copilot/backup-before-link-<时间>/`，可手工回滚。

```powershell
pwsh -NoProfile -File .\link-copilot.ps1 -Unlink   # 解除链接，真实安装与备份不动
```

链接模式下 `install-copilot.ps1` 会拒绝覆盖（避免追进链接删到仓库文件）；要回到普通
安装，先 `link-copilot.ps1 -Unlink`，再跑 `install-copilot.ps1`。

装完之后在 Copilot Chat 里说「按 phicoding 设计这个功能」它会自动加载对应技能，也可以敲 `/phicoding`、
`/phicoding-check`。检查器：

```powershell
node "$env:USERPROFILE\.copilot\phicoding\checks\phicoding.mjs" --root <你的项目>
```

**依赖**：Node.js ≥ 18、.NET SDK ≥ 8（首次运行编译语法底座，约 3 秒）。项目侧不用手写配置——首次运行会自动推断 `trunk` / `variants` / `author` 并生成 `.phicoding/config.json`。

## 快速开始（仓库内）

```powershell
# 结构检查（21 条语言级 + 项目自己的 3 条）
node dsh-plugins/dsh-phicoding/checks/phicoding.mjs --root .spine-game

# 列出规则（从目录扫，不手写清单）
node dsh-plugins/dsh-phicoding/checks/phicoding.mjs --list
```

首次运行会编译 C# 底座（Roslyn，约 3 秒）。**底座拿语法树，不拿编译产物**——所以半成品、
缺 `using`、跨平台编不过的代码一样能查。

## 哲学

**核心哲学（序号即优先级，序号小的压序号大的）**

1. **以人为本** —— 简单清晰易读 > 高性能
2. **最小实现** —— 核心是一套完备的最小实现，不多发散
3. **能力完备** —— 以完整、完备的方式结束
4. **最小最简命名** —— 避免前后缀
5. **最小公开** —— 只公开完成功能所必需的信息、接口与参数
6. **依赖单向** —— 严禁互相依赖
7. **低耦合高内聚**
8. **TDD** —— 只保证核心业务的核心需求与小范围鲁棒性

**编码哲学**：代码即注释 · 注释可追溯 · 命名用软件工程用词 · 线性直达无分支（No Else）· 设计模式优先（No Switch）

**设计哲学**：零 找准主干 · 1 以拓展性为先 · 2 以编码安全/强制性为先 · 3 最小信息成本 · 4 信息有边界 · 5 核心框架应完备

**边界**：这套哲学**管编码与设计，不管实现**。唯一伸进实现层的一只手是「不得采用明显高开销的做法」。

## 几条承重的判据

- **最小完备** —— 最小实现与能力完备是对立的；解法只有一个：**完备性靠可组合达成，不靠把功能做进去**
- **信息单向** —— 依赖图无环 ⇒ 等级存在；高等级可取低等级的信息，反之不可
- **解释与度量** —— 设计成立的唯一度量是「新增一个解释要写几处」（目标：一个类型 + 一行登记）
- **接口是概念的最小承诺** —— 概念对外公开时，接口才是它的最小公开面；所有公开面必须被接口覆盖；每个行为类至少配一个接口；依赖注入只注入接口
- **机械化** —— 规则没被机械化的那部分就是没生效的那部分；**检查器本身是待审对象**

## 检查器纪律

- **规则的正确性由框架自带的测试承担**（`checks/*.test.mjs`，用合成工程，不依赖任何项目源码）。业务项目不写测试、不写探针，只跑 CLI
- **检查器对被测工程零写入**
- **底座自己带自测**——它出过的三个漏洞都是「少了一整类事实而检查照绿」
- **没东西可判是正常的**：一条规则在某个工程上从未变红，可能只是这个工程没用到它。规则不要求项目为它造样例

给检查器写规则的约定见 [`checks/README.md`](dsh-plugins/dsh-phicoding/checks/README.md)。

## 目录

```
dsh-plugins/dsh-phicoding/      插件本体（技能 + 检查器）
.spine-game/                    验证载体①：DND 式中国风 MUD 文字游戏
.spine-equip/                   验证载体②：装备系统 v3
.spine-equip-migrated/          迁移样本：.spine-equip 按接口模块手册迁移（行为 137/137，META_DIR_CLASS_02–META_DIR_CLASS_03 全绿）
.spine-test/                    验证载体③：buff 系统（第一次验证）
spine-framework.png             框架图
spine-game-classes.png          抽象方案类图
```

三个验证载体都是**真实跑通**的工程，不是示意代码——它们是这套体系的效果证据。
`.spine-equip-migrated` 不是第四个载体，是 `.spine-equip` 的接口模块迁移版；
前后对照与验证记录见 [.spine-equip-migrated/MIGRATION.md](.spine-equip-migrated/MIGRATION.md)。

## 文档

| 文件 | 内容 |
| --- | --- |
| [RECOVERY.md](RECOVERY.md) | 产物被清空后如何从会话记录重放恢复，以及逐字节保真依据 |
| [phicoding-interface-root.md](phicoding-interface-root.md) | 接口根：新根推翻了哪四条旧条文、两个项目的红点、两处声明的不完整 |
| [phicoding-interface-modules.md](phicoding-interface-modules.md) | 接口模块：目录分层（Interfaces/Models/概念实现）、聚合根与组合根、硬检查与软审口径（H1–H4a 已落） |
| [phicoding-interface-modules-handbook.md](phicoding-interface-modules-handbook.md) | 接口模块落地执行手册：迁移顺序、命令、常见红与改法、验收清单 |
| [DSH-STORE.md](DSH-STORE.md) | DSH Store 提交说明：monorepo 显式包路径、精确兼容声明、一次性 Profile 验收 |
| [.spine-equip-migrated/MIGRATION.md](.spine-equip-migrated/MIGRATION.md) | 迁移样本记录：`.spine-equip` 的目录前后对照、行为 137/137、META_DIR_CLASS_02–META_DIR_CLASS_03 全绿、保留的软审项 |
| [checks/README.md](dsh-plugins/dsh-phicoding/checks/README.md) | 面向检查器维护者：底座与规则的分工、加规则/加语言各改哪、四条戒律 |
| [.spine-game/PLAN.md](.spine-game/PLAN.md) | 那个游戏在被验证时被哲学法官三轮打回的全过程 |

## 已知的不完整

- `.spine-equip` 尚未迁移到 `phicoding`（没有 `.phicoding/config.json`），它仍用旧的 PowerShell 检查器
- `.spine-equip-migrated` 已完成 C/D、目录规则与配置 DTO 迁移：行为类补接口、字段改成只持接口、配置数据放 `Config/`；除 `META_NAMING_02`（非 UE）外全部 20 条语言级硬规则为绿
- 「接口有没有覆盖抽象的**完整**抽象面」机器判不了，归软审查
- 两个彼此无关、也没有继承关系的类型之间，那条依赖该不该有 —— 只取决于设计意图，检查器不判，归哲学法官
- 接口模块的目录分层：H1–H4a 已机械化（`META_DIR_CLASS_02`–`META_DIR_CLASS_03`，用例 `checks/layout.test.mjs`）；
  H4b–H4d / H5 / H6 仍归软审。delegate 不在底座 facts 里，数据原子/引用里的 delegate 判不了
  （见 [phicoding-interface-modules.md](phicoding-interface-modules.md) 与
  [handbook](phicoding-interface-modules-handbook.md)）
