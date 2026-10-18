# 本仓库遵循 phicoding

写代码、改代码、评审代码、做设计决策之前，**先加载 `phicoding` 技能**。它会按任务路由到
`phicoding-design` / `phicoding-shape` / `phicoding-level` / `phicoding-check` / `phicoding-unity`。

## 交付前必须跑

```
node phicoding/checks/phicoding.mjs --root .
```

- 退出码 `0` 通过 · `1` 有违规 · `3` 不适用（跳过，**不算通过**）
- 红了就是违规，**不许绕过**；改法是结构性的，不是删掉那行
- 要改规则本身，先说明理由：**规则是待审对象，不是权威**

## 注释只能是这样

```
// [作者 日期 key=value] 原因
```

方括号里按空格切：前两项是作者与日期，其余只能是 `key=value`；方括号外整段是原因，
随便写、不用转义。作者取版本管理的用户名。

## 术语

主干（trunk）与变体（variants）在哪、作者是谁，由 `.phicoding/config.json` 声明。
**规则不猜**——没有配置就报"跳过，不算通过"。
