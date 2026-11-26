# PhiCoding 插件执行契约

本文件是 **dsh-phicoding 插件的强制指令**，适用于所有使用本插件的 agent。
它不是建议，也不是可选的“风格提示”。

## 1. 写代码前必须先读 SKILL

在任何写代码、改代码、评审代码或做设计决策之前：

1. 必须加载并阅读 `phicoding` 技能正文，不能只凭记忆、摘要或上次会话。
2. 按任务必须加载对应专项技能：
   - 设计框架 / 抽象 / 分层 / 判断该不该抽 → `phicoding-design`
   - 依赖方向 / 等级 / 注入 / 底层依赖上层 → `phicoding-level`
   - 注册表 / 事件 / 管线 / 管理器 / 修正系统 → `phicoding-shape`
   - Unity 组件 / 生命周期 / 全局管理器 → `phicoding-unity`
3. 交付前必须加载 `phicoding-check`，按它的判定顺序自查。
4. **没有读对应技能，不许开始编辑。**

## 2. 写完必须跑检查器

每次代码改动完成后，从目标工程根目录运行完整检查：

```sh
# 从本仓库使用
node dsh-plugins/dsh-phicoding/checks/phicoding.mjs --root <工程根>

# 插件安装位置不同就用实际路径
node <dsh-phicoding>/checks/phicoding.mjs --root <工程根>
```

判定：

- `exit 0`：通过，才算交付完成。
- `exit 1`：有违规，必须修到通过，不能把红项说成完成。
- `exit 3`：skip / 不适用，**不算通过**，必须说明原因并继续软审。

## 3. 禁止绕过

以下都不算通过：

- 只跑 `--only` 单条规则，代替完整检查。
- 为了让检查通过而删规则、改规则、改 `tiers.mjs` 或放宽 `profile`。
- 用 `waive` 掩盖结构性问题；waive 只能用于明确记录的引擎 / plumbing 约束。
- 把 `BLOCKED`、`skip` 或“规则不适用”解释成绿。
- 改测试期望来迁就错误实现。

规则红了先改代码和结构；规则本身有错，必须单独说明理由并补正反例，不能顺手改绿。

## 4. 项目适配层

工程若有 `.phicoding/adapter.json`，它只提供**项目事实、命名策略、强度、规则扩展和装饰**：

- 可以补语义事实（例如 UE 的 `UClass(ClassFlags.Abstract)`），不改通用规则；
- 可以调强度，但 `off` 不是通过；
- 可以替换允许覆盖的规则、增加项目规则、用 decorator 抑制 findings，但必须留下 trace；
- `adapter suppressed`、`WARN`、`off` 都要在报告里如实出现。

不要为了适配层去改通用规则，也不要把适配层当作隐藏 waiver。

## 5. 交付前自审

必须读 `phicoding-check`，按它的两个关口检查：

1. 标准符合性；
2. 硬检查结果 + 软审查结论。

最终答复必须报告：

- 跑了哪个检查命令；
- 实际退出码；
- 红项是否已修；
- 哪些是 `skip`，为什么；
- 有没有使用 waiver；用了就写清规则 ID、位置和 `why`。

没有完成上述步骤，不得声称“已完成”或“全绿”。
