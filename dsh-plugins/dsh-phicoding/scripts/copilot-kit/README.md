# phicoding · VS Code Copilot 套件

把 [phicoding](https://github.com/wlxms/dsh-phicoding) 的编码哲学与硬检查器装进任意仓库，
供 **GitHub Copilot in VS Code** 使用。

本目录是**生成物**——由 `dsh-plugins/dsh-phicoding/scripts/build-copilot-kit.mjs`
从插件包构建。改规则请改插件，别改这里。

## 装什么

| 路径 | 进 Copilot 的方式 |
| --- | --- |
| `.github/skills/` | **Agent Skills**（开放标准，与 Copilot CLI / coding agent 通用）。VS Code 按需自动加载，也能 `/phicoding` 手动调 |
| `.github/copilot-instructions.md` | 常驻指令：写代码前加载技能、交付前跑检查器 |
| `phicoding/checks/` | 检查器本体（Node + Roslyn 语法底座） |
| `.vscode/tasks.json` | 一键跑检查（终端 → 运行任务） |

## 安装

在目标仓库根目录：

```
node <本套件目录>/install.mjs .
```

然后直接跑一次：

```
node phicoding/checks/phicoding.mjs --root .
```

**第一次运行会自己生成 `.phicoding/config.json`**，并把推断依据打出来：

```
   已生成 .phicoding/config.json
     主干 src/Core/ —— 33 个类型，没有一条引用指向它外面（闭合）
     变体 src/Game
     作者 wlxms（git config user.name）
   想改就改这个文件——规则只读它，不猜。
```

主干靠**依赖图判闭合**（某一组类型不引用组外任何类型），作者取 `git config user.name`。
两项都是工程里已有的东西，不需要你先懂这套哲学再手填。

想换一个判断就手改那个文件；`phicoding --init` 可以随时重新推断一遍。

## 用法

```
node phicoding/checks/phicoding.mjs --root .          # 全量检查
node phicoding/checks/phicoding.mjs --root . --list   # 列出规则
```

退出码：`0` 通过 · `1` 有违规 · `3` 不适用（跳过，**不算通过**）。

在 Copilot Chat 里直接说"按 phicoding 设计这个功能"，它会自动加载对应技能；
也可以敲 `/phicoding`、`/phicoding-check` 显式调用。

**增量开发**：`--session-begin` / `--diff` 只判这次动过的行，把"全红"变成"没变坏"，
适合装进已有工程。

## 依赖

- **Node.js ≥ 18**
- **.NET SDK ≥ 8** —— 首次运行会用 Roslyn 编译自己的语法底座（约 3 秒，之后复用）

没有 .NET SDK 时检查器报错退出，**不会假装通过**。

## 与 DSH 版的关系

同一份技能、同一套规则。DSH 版把技能交给插件运行时；本套件把它们交给 Copilot 的
Agent Skills 机制。检查器完全相同，判定不会分叉。

## 它不判什么

- **命名粒度**（一个名字一个词、`AAndB` 式并列）——判据不可信，交给人工审查
- **可变静态状态**——同上
- **两个无关类型之间那条边该不该有**——取决于设计意图，代码里读不出来
- **没东西可判时它就是绿的**。这不是缺陷：工程里没用到那类写法，规则自然没有对象。
  规则不要求项目为它造样例
