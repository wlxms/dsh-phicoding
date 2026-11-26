# dsh-phicoding

DeepSeek Harness 的**常驻编码与设计准则**。

一句话锚：**最小完备，信息单向。**

- **最小完备** —— 最小实现与能力完备本来是对立的。解法只有一个：**完备性靠可组合达成，不靠把功能做进去。** 固化写死、可替换走继承与多态、可新增走组合。
- **信息单向** —— 依赖图不得有环。由此产生信息等级：高等级可取低等级的信息，反之不可。

## 技能

| 技能 | 何时加载 |
| --- | --- |
| `phicoding` | 任何写代码、改代码、评审、做设计决策的任务。总入口与路由 |
| `phicoding-design` | 设计框架 / 抽象 / 分层 / 判断该不该抽 |
| `phicoding-level` | 依赖方向、谁能看谁、注入太深、底层要依赖上层 |
| `phicoding-shape` | 写注册表 / 事件 / 管线 / 管理器 / 修正系统 |
| `phicoding-unity` | Unity 组件与生命周期 |
| `phicoding-check` | 收尾自审或评审别人的代码 |

## Agent 执行契约

插件根目录的 [`AGENTS.md`](AGENTS.md) 是**强制指令**，不是建议：

1. 写代码前必须读 `phicoding`，并按任务读对应专项技能；没读不许编辑。
2. 交付前必须读 `phicoding-check`。
3. 改完必须跑完整检查；`exit 0` 才算完成，`exit 1` 修到通过，`exit 3` 不算通过。
4. 不许用 `--only`、删规则、放宽 profile、伪造 waiver 或改测试期望绕过检查。

Copilot 套件里对应的是 `.github/copilot-instructions.md`，同一份契约。

## 项目适配层

项目差异不进入规则本体。工程根可放 `.phicoding/adapter.json`：

```json
{
  "id": "wy-ue",
  "engine": "unreal",
  "naming": { "interface": { "prefix": "I" } },
  "placement": {
    "cs": {
      "atoms": { "enum": ["Enums"], "struct": ["Models"], "recordstruct": ["Models"] },
      "nested": { "enum": { "allow": true, "scope": "containing" } }
    }
  },
  "rules": {
    "severity": { "META_NAMING_02": "warn" },
    "add": ["./rules/WY_NAMING_01.mjs"]
  }
}
```

它做六件事：`facts` 补语义事实、`naming` 给命名策略、`placement` 按语言配原子目录和嵌套
enum 范围、`severity` 调强度、`replace` 覆盖允许覆盖的规则、`decorate` 做带 trace 的装饰；
`add` 增加项目规则。结构性规则受保护，不能被替换。默认原子目录是 `Models/`，可以改为
`Enums/`、`Structs/` 等；空目录配置是错误，不是关闭规则。

`off`、`WARN`、`adapter suppressed` 都会出现在报告里，不算 `green`。完整接口见
[`checks/adapters.mjs`](checks/adapters.mjs) 与 [`checks/README.md`](checks/README.md)。

语言级 Profile 放在 `profiles.<language>`。例如 C# 要求一个类一个文件：

```json
{
  "profiles": {
    "cs": {
      "options": { "oneTypePerFile": true }
    }
  }
}
```

它启用 `PROFILE_FILE_01`；默认关闭，嵌套类型不计数，`partial` 同名声明算同一个类型。
`Foo` 与 `Foo<T>` 是不同 arity，同一个文件里的同名泛型伴生类默认豁免
（`exemptGenericSameName: false` 可关闭）；`Foo` 与不同名的 `Bar<T>` 仍算两个类型。
需要把 interface / enum 也纳入“一个类型一个文件”时，使用对象形式：

```json
"oneTypePerFile": {
  "enabled": true,
  "kinds": ["class", "record", "interface", "enum", "struct", "recordstruct"]
}
```

## 八条核心哲学（序号即优先级）

1. **以人为本** —— 简单清晰易读 > 高性能。2. **最小实现**。3. **能力完备**。4. **最小最简命名**。
5. **最小公开**。6. **依赖单向**。7. **低耦合高内聚**。8. **TDD**。

## 安装

```sh
dsh plugin --profile web add H:\Git\dsh-mydsh\.recovery-tmp\stage\plugins\dsh-phicoding
```

宿主行注册进 `ctx.skills` 的**全局层**，所以每个 agent preset 的作用域链都会合并这批技能——这就是「常驻」的机制保证，不需要任何用户配置。

## DSH Store

本包在仓库子目录 `dsh-plugins/dsh-phicoding`；仓库根没有 `package.json`，
提交 DSH Store 时必须使用显式路径：

`https://github.com/wlxms/dsh-phicoding/tree/main/dsh-plugins/dsh-phicoding`

`package.json` 已声明精确的 `dsh.compatibility.dshReleases` 与 `dshOperations`
（后者在真实一次性 Profile 验收前保持 `unknown`）。提交步骤与验收命令见
[DSH-STORE.md](../../DSH-STORE.md)。

## 验证

```sh
node scripts/verify-provider.mjs     # exit 0 = PASS
```

两层检查：原始文件层（frontmatter 能被真 YAML 接受、`name` 与目录名一致、`description` 单行且不含 ASCII 的 `": "`）+ provider 层（注册 → `list()` → 逐个 `get()` 加载正文）。

### 为什么那条 `": "` 检查是硬错误

YAML 的**普通标量里不能出现 `: `**（冒号加空格）。带这个模式的 `description` 会让 frontmatter 解析失败，技能被**静默丢弃**——不报错，只是不出现。所以描述保持单行，用全角 `：`。

## 许可

MIT。
