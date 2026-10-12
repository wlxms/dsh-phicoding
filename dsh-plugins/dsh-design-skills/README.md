# dsh-design-skills

DeepSeek Harness 的**常驻设计技能族**。

一条法则：

> **先尽量不写；不得不写时，让主干不知道变体的名字。**

`ponytail` 回答**要不要写、写多少**（量）；本包回答**必须写时怎么切**（形）。
本包**不重复** ponytail 的梯子——它把梯子铺到底了，我们补的是第二级。

## 技能

| 技能 | 何时加载 |
| --- | --- |
| `design` | 任何改结构的编码任务。总入口、四个元规则、三步流程与路由 |
| `design-contract` | 三集 / 两轴 / 三种接口来源 / 对象层三判据 / 目标树递归 / 设计卡模板 |
| `design-ladder` | 阶梯用例 L1–L5 + 组合档 / 红基线 / 主干字节边界 / 断言配对 / 失配行 |
| `design-audit` | 只读审查：过度抽象与主干渗漏，按最大削减优先排序 |
| `design-debt` | 缝台账：收拢 `ponytail:` 标记并补上「将来动哪里」 |
| `design-gain` | 变体成本台账：脚手架还是收费站；该留 / 该改 / 该撤 |
| `design-help` | 速查卡（仅用户可调用） |

## 依赖

| 包 | 作用 |
| --- | --- |
| `dsh-ponytail-skills` | **root 层**：要不要写、写多少。独立安装 |
| `@deepseek-ai/cordis` | peer，随宿主提供 |

`design` 的根技能里内联了一行梯子底线，所以 `ponytail` 没装时它会降级而不是悬空。

## 安装

```sh
dsh plugin --profile web add dsh-ponytail-skills
dsh plugin --profile web add H:\Git\dsh-mydsh\dsh-plugins\dsh-design-skills
# 重启 profile 后生效
```

宿主行注册进 `ctx.skills` 的**全局层**，所以每个 agent preset 的作用域链都会合并这批技能 —— 这就是「常驻」的机制保证，不需要任何用户配置。

## 验证

```sh
node scripts/verify-provider.mjs     # exit 0 = PASS
```

它做两层检查：

1. **原始文件层**：每个 `SKILL.md` 的 frontmatter 能不能被真 YAML 解析器接受；`name` 与目录名一致；`description` 够长（否则语义搜索找不到它）、单行、且**不含 ASCII 的 `": "`**。
2. **provider 层**：注册 → `list()` 返回 `{candidates, complete}` 且条数吻合 → 逐个 `get()` 把正文加载出来。

### 为什么第 1 层里那条 `": "` 检查是硬错误

YAML 的**普通标量里不能出现 `: `**（冒号加空格）。带这个模式的 `description` 会让 frontmatter 解析失败，技能被**静默丢弃** —— 不报错，只是不出现。这个坑在作者的另一个底座里踩过一次真实事故：技能文件写好了、挂载也通过了，但那个技能从头到尾没有被注册，而唯一发现它的原因是 agent 自己报告「技能不在本会话里」。

所以：**描述保持单行，别用 ASCII 冒号加空格。** 用全角 `：` 或改写。

## 许可与署名

本包代码 MIT。

「最懒资深工程师」梯子、`ponytail:` 标记约定来自
[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)（MIT, © DietrichGebert），
DSH 形态参考 [gongyijie85/dsh-ponytail](https://github.com/gongyijie85/dsh-ponytail)（MIT）。
本包**不内嵌**它们的技能文本；`design` 根技能里那段一行梯子底线是对其公开梯子的概括，保留署名。
