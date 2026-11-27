<!-- phicoding:start -->
# phicoding（用户级强制执行）

这是**用户级契约**，对所有 Copilot 会话生效；不是项目仓库里的建议。

## 写代码前

任何写代码、改代码、评审代码、做设计决策的任务，先读技能正文，不能凭记忆或摘要：

1. 必读：`{{SKILLS_DIR}}/phicoding/SKILL.md`
2. 按任务读专项：
   - 设计框架 / 抽象 / 分层 / 该不该抽：`{{SKILLS_DIR}}/phicoding-design/SKILL.md`
   - 依赖方向 / 等级 / 注入：`{{SKILLS_DIR}}/phicoding-level/SKILL.md`
   - 注册表 / 事件 / 管线 / 管理器：`{{SKILLS_DIR}}/phicoding-shape/SKILL.md`
   - Unity 组件 / 生命周期：`{{SKILLS_DIR}}/phicoding-unity/SKILL.md`
3. 交付前必读：`{{SKILLS_DIR}}/phicoding-check/SKILL.md`

没有读对应技能，不许开始编辑。

## 写完后

在项目根目录运行完整检查器：

```sh
node "{{RUNNER}}" --root .
```

- `exit 0`：通过。
- `exit 1`：有违规，必须修到通过，不能说成“已完成”。
- `exit 3`：skip / 不适用，**不算通过**；必须说明原因并继续软审。

`--only`、`BLOCKED`、`skip`、`off`、`WARN` 都不能替代完整通过。
不能用删规则、放宽 profile、改测试期望来绕过红线；waive 只能用于明确记录的引擎/plumbing 例外。

## 交付

最终答复必须报告：实际运行的检查命令、退出码、红项是否已修、哪些是 `skip` 及原因、是否使用了 waiver。
<!-- phicoding:end -->
