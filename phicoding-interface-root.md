# 接口根：最小公开面

落盘日期 2026-10-12。来源：会话 `session-4106e1b1`（该会话在 pwsh 崩溃 `0xC0000142` 时中断，
技能四处与检查规则已完成但未验证、未报告）。本文补上缺的第 7、8 项。

> **后续（同日）：等级表已整体移除。** 本文里提到的 `0850` / `0900` 两条等级规则已删除，
> `levels.json` 不再是任何工程的文件。等级律要回答的"谁在谁上面"，现在由两条**本地**判据回答：
> `0900-trunk-is-self-contained`（看两端声明在哪个目录）与 `0750-no-more-concrete`（看两端各是什么档位）。
> 本文其余部分是当时的事实记录，未回改。

## 一、根

> **接口是最小的公开面——一个层级里能被公开的东西，最底下那一档就是接口。**

它只含能力面，不含固化与身份，所以**承诺最少、能被最多人看见**。三条推论：

| # | 推论 |
| --- | --- |
| 1 | **所有公开面必须被一个以上的接口覆盖** |
| 2 | **每个抽象至少配一个接口**——接口覆盖它的完整抽象面 |
| 3 | **依赖注入只能注入接口**——不得注入具体抽象 |

**2 与 3 是 1 的推论，不是三条独立规则。** 抽象是公开面，所以要被接口覆盖；注入是一种公开，
所以注入面只能是接口。

由此得到接口的等级：**接口必须定义在所有使用者的等级之下**——这就是「最底层」的判据形态。

**接口命名不在本体系规定范围内。** 是否加 `I` 前缀由实现者定，不构成违规。

## 二、落到了五处

| 处 | 内容 |
| --- | --- |
| `skills/phicoding/SKILL.md` | 新增「接口：最小的公开面」一节（根 + 三条推论 + 等级）；核5 挂链；硬约束表加一行 `抽象配接口` |
| `skills/phicoding-design/SKILL.md` | 三层拆分表「可替换」由「继承与多态」改为「接口 + 抽象类」；规范 5 改为「类型安全的接口（**不得是具体抽象**）」；新增规范 7 |
| `skills/phicoding-check/SKILL.md` | 九条红线 → **十条**；判定顺序第 5 条加「且公开面必须被接口覆盖」；规则清单加 `0700` 一行 |
| `skills/phicoding-level/SKILL.md` | 注入面从「收益」升为**硬要求**；第三步「下沉成契约」在落地时就是「抽一个能力接口」 |
| `checks/.cs/0700-abstract-has-interface.mjs` | 新规则：每个 `abstract class` 至少实现一个接口 |

顺带修掉一处过时引用：`phicoding` 硬约束表里的 `scripts/check-cycles.mjs` 改成了
`phicoding --root <项目>`。

## 三、新根推翻了四条旧条文

| 旧条文 | 为什么与新根冲突 | 改成 |
| --- | --- | --- |
| **`phicoding-check` 常见违规：「只有一个实现的接口 → 删掉，写最简实现 + 标记缝」** | **正面冲突。** 新根说抽象必须配接口，而抽象通常只有一个实现。旧条文会让人把刚配上的接口删掉 | 「**"只有一个实现"不是删接口的理由**——接口是公开面，抽象配接口是常态」；新增两行：固化层不抽接口 / 具体抽象被注入要抽能力接口 |
| **`phicoding-design`：反例「给一个只有一种实现的东西抽接口」** | 判据用错了轴——按「有几个实现」判，而新根按「属不属于公开面」判 | 「反例：给一个**写死的东西**抽接口——固化层不配接口。**判据不是"有几个实现"，而是"它属于哪一层"**」 |
| **`phicoding-design` 三层表：「可替换 → 继承与多态」** | 漏了接口。继承只解决身份，能力要走接口 | 「**接口 + 抽象类**：接口是最小公开面（唯一可注入的），抽象类放共享实现」 |
| **`phicoding-level`：注入面只是「收益」** | 新根把它升为必须 | 「**这不是收益，是本体系的硬要求：注入面只能是接口**」 |

## 四、验证

### 包自检

```
verify-provider.mjs     dirs=6  listed=6  loadedBodies=6     VERIFY=PASS
phicoding --list        语言级 11 条规则（+ 项目级 3 条 = 14）
```

### `.spine-game` 实跑

```
== .cs  27 个文件      底座：types=48  refs=275
   green ×12
   RED   0700-abstract-has-interface
           Core/Adjust.cs:3        抽象 Adjust 没有实现任何接口
           Core/Consumable.cs:3    抽象 Consumable 没有实现任何接口
           Core/Dice.cs:3          抽象 Dice 没有实现任何接口
           Core/Equip.cs:3         抽象 Equip 没有实现任何接口
           Core/Item.cs:3          抽象 Item 没有实现任何接口
           Core/Report.cs:3        抽象 Report 没有实现任何接口
           Core/Require.cs:3       抽象 Require 没有实现任何接口
           Core/Shift.cs:3         抽象 Shift 没有实现任何接口
PHICODING=FAILED  1 项      exit 1
```

**8 处红，全是真违规**：这个项目写于新根之前，`.cs` 里 `interface` 零命中。

### `.spine-equip` 实跑

```
== .cs  23 个文件      底座：types=41  refs=420
   green 0100-no-else
   RED   ×7    读不到项目配置 / 读不到 levels.json   ← 不是代码违规，是没迁移
   RED   0700-abstract-has-interface
           check/Spine.Equip.Check/Extension.cs:9    抽象 Kind
           src/Spine.Equip/Core/ItemKind.cs:3        抽象 ItemKind
           src/Spine.Equip/Core/Job.cs:3             抽象 Job
           src/Spine.Equip/Core/Requirement.cs:16    抽象 Requirement
           src/Spine.Equip/Core/Slot.cs:3            抽象 Slot
           src/Spine.Equip/Core/Stat.cs:3            抽象 Stat
           src/Spine.Equip/Variants/Slots.cs:7       抽象 Kind
           src/Spine.Equip/Variants/Slots.cs:16      抽象 Kind
           src/Spine.Equip/Variants/Slots.cs:25      抽象 Kind
PHICODING=FAILED  9 项      exit 1
```

**`.spine-equip` 没有 `.phicoding/`，也没有 `levels.json`**——它还在 PowerShell 检查器时代
（`check.ps1` / `check-structure.ps1` / `check-mutants.ps1`），phicoding 迁移只做过 `.spine-game`。
所以它那 7 条红**不是等级问题，是这个项目不在 phicoding 的管理范围内**。真正有意义的只有
`0700` 的 9 处——而且其中 4 处是同一个嵌套 `Kind` 族（`Weapon.Kind` / `Armor.Kind` / `Trinket.Kind`）。

### 探针网

```
   ok ×12
   BASE 0700-abstract-has-interface
   基线已红 1 条：0700-abstract-has-interface
   规则确实会红（项目自己证的），但探针证明不了它只红自己 —— 把项目修绿，这条网才算完整
```

## 五、这次一并修掉的探针机制缺陷

原来的探针判据是 `mine.length === 1 && others.length === 0`——**「其余一条都不许红」是绝对值**。
它的隐含前提是「基线全绿」，而这个前提**从没写下来过**。

后果：项目只要已经违反某一条规则，那条规则就会把**其他每一条规则的探针**全部染红，整张网读作 FAIL，
而原因跟被验的规则毫无关系。加一条新规则正好会触发这个——所以这次先量基线：

```
baseRed = 基线已经红的规则集合
baseRed 里的规则      → verdict = 'baseline-red'（BASE），不假装探针证明了什么
others 的判据         → 排除 baseRed
```

现在 12 条 `ok`、1 条 `BASE`，**网没有再被一条已知红规则连坐**。

## 六、两处如实声明的不完整

**① `0700` 的探针还没被证明过。**

它的探针前提是项目里存在 `public abstract class Slot : ISlot`——两个项目都没有接口，所以这个锚点
不存在；同时它又是基线红，被 `baseRed` 短路。**两头都没走到。** 工具自己把这件事打出来了（那个 `BASE`
和那句话），没有假装通过。

要证明它，得先把某个项目修绿。

**② 硬约束表里的 `抽象配接口` 只查「有没有」，不查「覆盖没覆盖完整抽象面」。**

底座不记录成员级的 `abstract` 修饰符，"接口有没有覆盖它的完整抽象面"判不了。
那一半归哲学法官软审——规则文件里写明了这条限，没有假装查到。

## 七、下一步（需要你拍板）

**把 `.spine-game` 的 8 个抽象配上接口。** 那 8 个正是每条继承链的根（`Adjust` `Consumable`
`Dice` `Equip` `Item` `Report` `Require` `Shift`），所以只需 8 个接口 + 8 行 `levels.json`。

但这是**一次真实的设计改动**，按本体系的流水线它该先过哲学法官（关口一），而不是我直接改：

- 每个接口要覆盖对应抽象的**完整抽象面**（这条机器人判不了，只能设计时定）
- 接口等级必须 ≤ 实现它的抽象（`0900`），加 8 个类型要同步 `levels.json`（`0850` 双向核）
- 接口的方法签名若引入高等级类型，会立刻造出 `0900` 越界或 `0800` 环
- 改完还要复跑 `.spine-game` 自己的 40 条行为断言，证明没碰坏行为

修绿之后，`0700` 的探针才能第一次真正跑起来，「这张网完整」才成立。
