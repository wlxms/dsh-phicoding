# dsh-phicoding · Philosophy Coding

把一套**自有的编码哲学**做成可强制执行的形态：**6 个常驻技能**（软性）+ **一个硬性检查器**（14 条规则）。

不是文档，是**闸**——规则要么能被机器判定，要么就得先证明它判不了。

## 这套东西分两层

| 层 | 是什么 | 在哪 |
| --- | --- | --- |
| **软性** | 6 个技能，常驻（每个会话都在） | [`dsh-plugins/dsh-phicoding/skills/`](dsh-plugins/dsh-phicoding/skills) |
| **硬性** | 一条命令跑 14 条规则，不通过就不通过 | [`dsh-plugins/dsh-phicoding/checks/`](dsh-plugins/dsh-phicoding/checks) |

## 快速开始

```powershell
# 结构检查（11 条语言级 + 项目自己的 3 条）
node dsh-plugins/dsh-phicoding/checks/phicoding.mjs --root .spine-game

# 探针自验：每条规则必须能自己变红，且只红自己那一条
node dsh-plugins/dsh-phicoding/checks/phicoding.mjs --root .spine-game --probe

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
- **接口是最小的公开面** —— 所有公开面必须被接口覆盖；每个抽象至少配一个接口；依赖注入只注入接口
- **机械化** —— 规则没被机械化的那部分就是没生效的那部分；**检查器本身是待审对象**

## 检查器纪律

- **每条规则必须能自己变红一次，且只红自己那一条**（`--probe` 自动跑）
- **探针在副本里跑**，检查器对工程代码零写入
- **底座自己带自测**——它出过的三个漏洞都是「少了一整类事实而检查照绿」
- 探针只改已有类型，不新增类型（新增会让「等级登记」一起红，破坏「只红一条」）

给检查器写规则的约定见 [`checks/README.md`](dsh-plugins/dsh-phicoding/checks/README.md)。

## 目录

```
dsh-plugins/dsh-phicoding/      插件本体（技能 + 检查器）
dsh-plugins/dsh-design-skills/  前身包，保留作对照
.spine-game/                    验证载体①：DND 式中国风 MUD 文字游戏
.spine-equip/                   验证载体②：装备系统 v3
.spine-test/                    验证载体③：buff 系统（第一次验证）
spine-framework.png             框架图
spine-game-classes.png          抽象方案类图
```

三个验证载体都是**真实跑通**的工程，不是示意代码——它们是这套体系的效果证据。

## 文档

| 文件 | 内容 |
| --- | --- |
| [RECOVERY.md](RECOVERY.md) | 产物被清空后如何从会话记录重放恢复，以及逐字节保真依据 |
| [phicoding-interface-root.md](phicoding-interface-root.md) | 接口根：新根推翻了哪四条旧条文、两个项目的红点、两处声明的不完整 |
| [checks/README.md](dsh-plugins/dsh-phicoding/checks/README.md) | 面向检查器维护者：底座与规则的分工、加规则/加语言各改哪、四条戒律 |
| [.spine-game/PLAN.md](.spine-game/PLAN.md) | 那个游戏在被验证时被哲学法官三轮打回的全过程 |

## 已知的不完整

- `.spine-equip` 尚未迁移到 `phicoding`（无 `.phicoding/` 与 `levels.json`），它仍用旧的 PowerShell 检查器
- 规则 `0700-abstract-has-interface` 在两个载体上都是红的（两者都写于该根之前，`.cs` 里零接口）
- 「接口有没有覆盖抽象的**完整**抽象面」机器判不了，归软审查
