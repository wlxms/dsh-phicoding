# buff（状态效果）系统 —— 实现报告

目录：`H:\Git\dsh-mydsh\.spine-test\`（只在此目录内落盘，未改动仓库其他位置）

---

## 0. 交付与运行

### 文件结构

```
.spine-test/
├── run.ps1                     # 唯一入口：编译 + 跑检查
├── .gitignore                  # bin/ obj/
├── REPORT.md                   # 本文件
├── Effects/                    # 主干（类库，程序集 Effects，命名空间 Effects）
│   ├── Effects.csproj
│   ├── Layer.cs                # 合并用的值：(层数, 剩余时间)
│   ├── Stacking.cs             # 叠加规则抽象 + Add / Refresh
│   ├── Buff.cs                 # buff 抽象
│   ├── Stats.cs                # 属性累积器 (Basis + Flat) * Ratio
│   ├── Handle.cs               # 施加凭据（幂等释放）
│   ├── Buffs.cs                # 主干：持有 / 施加 / 逐帧 / 清理
│   └── Character.cs            # 聚合根：Stats + Buffs + Tick + Die
└── Effects.Check/              # 可运行的检查（控制台程序，程序集 Effects.Check）
    ├── Effects.Check.csproj
    ├── Program.cs              # 入口
    ├── Verify.cs               # 断言
    ├── Lifecycle.cs            # 45 条行为断言
    ├── Structure.cs            # 9 条结构红线断言（grep 式）
    ├── Attributes.cs           # Attack / MoveSpeed（空类，类型替代枚举）
    ├── GameBuffs.cs            # Rage / Blade / Haste / Charge
    ├── Extend.cs               # ★ 第三个叠加规则，定义在主干之外
    ├── Skill.cs                # 来源①：技能施加
    ├── Equipment.cs            # 来源②：装备附带
    └── Aura.cs                 # 来源③：场景光环
```

### 运行命令

```powershell
pwsh -NoProfile -File H:\Git\dsh-mydsh\.spine-test\run.ps1
```

`run.ps1` 内部只有一条 `dotnet run --project .\Effects.Check\Effects.Check.csproj -c Release -- <root>`，
并透传退出码（全部通过 = 0，任一失败 = 1）。依赖：.NET SDK 8/10（本次用 8.0.31 运行时，`net8.0` 目标）。

### 实际输出

从 `bin/`、`obj/` 全删后的干净重建开始，完整输出见本文件末尾 [附录 A](#附录-a完整运行输出)。
结论行：

```
OK  54/54 assertions passed
[exit=0]
```

---

## 1. 加载了哪些 skill

| skill | 是否加载 | 用在哪 |
| --- | --- | --- |
| `spine` | ✅ | 总准则。八条核心哲学定优先级，五条编码哲学定写法（No Else / No Switch / 不写注释 / 无填充词） |
| `spine-design` | ✅ | 找主干：先从需求反推最小实现，再按「固化 / 可替换 / 可新增」三层拆 `Stacking` 与 `Buff` |
| `spine-shape` | ✅ | 直接落地两处形态：**修正累积**（`Flat` / `Ratio` 双累积器 → 顺序无关）、**按类型索引**（属性维度用类型当键） |
| `spine-level` | ✅ | 定注入面：三个来源注入的是 `Buffs`（一项能力），不是 `Character`（整个对象）；`Handle` 是「推」不是「拉」 |
| `spine-check` | ✅ | 收尾自审的七条红线，已经**编译进检查程序**（`Structure.cs`），不是靠人肉 grep |
| `ov-experience-memory` | ⚠️ 加载未生效 | 本会话没有注册 OpenViking 的语义检索工具，MCP 服务器 `openviking` 返回 `server is disconnected`。按该 skill 自己的前置条件「检索或读取能力缺失时，不带经验继续」，未做任何替代性直连。 |

未加载且与本任务无关：`spine-unity`（本项目不是 Unity）、`cordis-*`、`azure-*`、`office-*`、`openviking-*`（记忆/技能库本身）。

---

## 2. 主干与扩展点的划分

### 2.1 最小实现（设零）

先问「这个功能的最小实现是什么，少哪个环节就不成立」。答案是 5 个环节：

| 环节 | 落成的抽象 | 可变性处方 |
| --- | --- | --- |
| ① 一个能被 buff 改动的值 | `Stats`（`Basis` + `Flat` / `Ratio` 累积器） | **固化**：形状写死。加算与乘算分开累积后，施加顺序不参与结果 |
| ② 一份带剩余时间的 buff | `Buff`（抽象）+ `Layer`（值） | **可替换**：`Modify` 走继承 |
| ③ 逐帧递减、归零移除 | `Buffs.Tick` | **固化**：`Remaining > 0` 存活，否则当帧移出并重建 |
| ④ 重复施加时怎么办 | `Stacking`（抽象） | **可替换**：`Merge` 走继承 |
| ⑤ 外部挂上 / 摘下，且彼此不知道 | `Buffs.Apply` → `Handle.Release` | **固化**：谁申请谁拿凭据，凭据幂等 |

### 2.2 三层拆解

**固化（写死，不动）—— 主干语义与不变量**

- 属性结果 = `(Basis + Flat) * Ratio`；`Flat` 与 `Ratio` 分开累积，**顺序无关**。
- 状态只有一份：`Buffs.held` 是唯一真相；属性是它的**派生缓存**，任何集合变化后整体 `Rebuild`。
  好处是「撤销一个 buff」不需要记住当初加了什么，因此不存在加减法漂移。
- 同类型即同一个 buff 实例（身份 = CLR 类型）。
- `Handle.Release()` 与 `Buffs.Clear()` 幂等 —— 这是「死亡 / 场景卸载顺序不保证」的直接落点。
- `Apply` 收 `Func<Buff>` 而不是实例：实例由框架创建，从**形状上**消除「同一个实例被挂两次」这类隐式失败。

**可替换（继承与多态）—— 扩展点 1、2**

| 扩展点 | 契约 | 换实现 = 写一个子类 |
| --- | --- | --- |
| 这个 buff 改什么 | `Buff.Modify(Stats, int layers)` | `Effects.Check/GameBuffs.cs` 的 `Rage` / `Blade` / `Haste` / `Charge` |
| 重复施加怎么合 | `Stacking.Merge(Layer held, Layer added)` | 主干内 `Stacking.Add` / `Stacking.Refresh`；主干外 `Extend` |

**可新增（组合）—— 扩展点 3、4**

| 扩展点 | 怎么加 | 主干改动 |
| --- | --- | --- |
| 新属性维度 | 写一个空类 `internal sealed class CritRate;`，然后 `stats.Flat<CritRate>(…)` | 0 行 |
| 新 buff | 写一个 `Buff` 子类，构造时声明时长与叠加规则 | 0 行 |
| 新叠加规则 | 写一个 `Stacking` 子类 | 0 行 |
| 新来源 | 任何拿到 `Handle` 的东西 | 0 行 |

### 2.3 扩展点是真的被验证过的，不是声称的

- **主干里搜不到任何实现类型**。`Structure.cs` 有一条可复跑的断言：
  `trunk names no implementation` —— 在 `Effects/*.cs` 里 grep
  `Skill|Equipment|Aura|Rage|Blade|Haste|Charge|Attack|MoveSpeed`，0 命中。
- **第三个叠加规则定义在主干之外，且跨程序集**。`Extend`（时长累加、封顶 12 秒）在
  `Effects.Check/Extend.cs`，属于**另一个程序集**，只用公开面 `Stacking` / `Layer` 就写成了，
  主干 0 行改动。这是「加一个变体，主干 diff = 0 行」的实证。
  需求只点名了两种规则（叠层 / 刷新），第三种是我为验证扩展点而加的 —— 它证明的是**这个口子开着**。
- **三个来源跨程序集**。`Skill` / `Equipment` / `Aura` 全部在检查工程里，只依赖
  `Effects` 的公开面。它们能编译本身，就说明主干没有靠 `internal` 偷信息。

### 2.4 三个来源如何做到互不知道

> 需求：三类来源互相不知道对方存在，也不应该知道具体的 buff 是谁挂的。

落成两条：

1. **buff 身上没有任何「来源种类」字段**。主干里没有 `SourceKind`，没有枚举，没有分支。
   主干根本不知道「来源」这个概念存在。
2. **`Apply` 返回 `Handle`，`Handle.Release()` 幂等**。来源只握自己的凭据，不查询别人。
   这是 `spine-level` 的「推」—— 来源把 buff 交出去、事后收回自己的那份，全程不需要知道还有谁在挂 buff。

检查里两处证据：

- `Structure.cs` 的 `source X names no other source`：三个来源文件里 grep 不到另外两个的名字。
- 行为断言 `skill end drops only its own buff` / `one claimant left keeps the buff`：
  技能结束只带走自己那份，装备那份留下。

### 2.5 两个清理时机的正确性（顺序不保证）

关键不是「谁先谁后」，而是**清理动作必须幂等**：

| 顺序 | 过程 | 结果 |
| --- | --- | --- |
| 死亡 → 场景卸载 | `Die()` 清空全部；随后 `skill.End()` / `TakeOff()` / `Unload()` 逐个释放 | 全部是空操作，无异常，无复活 |
| 场景卸载 → 死亡 | `Unload()` 只撤走光环那份（断言此时还剩 2 个）；`TakeOff()` 撤走装备；`Die()` 收尾 | 终态与上一种**逐字段相同** |

跨来源共享同一个 buff 时还有第三层：`Buff.claims` 引用计数。
技能和装备都挂了 `Rage` → 合并成 1 个实例、2 层、2 个凭据；技能结束只减到 1 个凭据，buff 留下。

---

## 3. 我判断出来的决定（不是从需求推导的）

按影响从大到小：

1. **属性维度用「空类 + 泛型」，不用枚举 / 字符串。**
   需求只说「例如攻击力、移速」。用类型当键换来编译期拼写检查，代价是每个属性要写一个空类。
   这是我按 `spine`「类型替代枚举」选的，需求没要求。

2. **累积器形状取 `(Basis + Flat) * Ratio`，而不是「按顺序依次施加」。**
   需求只说「分加算与乘算两种」，**没说顺序**。选这个形状让顺序天然无关，
   直接消掉「装备先算还是技能先算」这类扯皮。检查里 `ratio first equals flat first` 是它的断言。
   这是我从 `spine-shape` 搬的形状，但「本项目的加算与乘算该长这样」是我的判断。

3. **引用计数 `claims`。**
   两个来源挂了同一个 buff，其中一个撤销时**不能**把另一个的也带走。
   需求完全没提这件事，但不做就是 bug。这是我判断出来的必要性。

4. **buff 身份 = CLR 类型。**
   需求没定义「什么算同一个 buff」。我取同类型即同一 buff。副作用是「技能的 +10 攻击」与
   「装备的 +10 攻击」如果是同一个类，会合并成一个实例 —— 见第 5 节第 2 条。

5. **`Apply` 收 `Func<Buff>` 而不是 `Buff` 实例。**
   实例由框架造 ⇒ 「同一个实例挂两次」在形状上不可能发生，不需要运行期校验。
   代价是调用点多一个 `() =>`。这是设 2「把隐式失败变成显式失败」的落地。

6. **`Handle.Release()` 与 `Clear()` 幂等。**
   需求只说「两个时机顺序不保证」。我把它的另一面也做了：同一份清理跑两次、或在清理之后才跑，
   都必须无害。这是让「顺序不保证」成立的**机制**，不是附加功能。

7. **`Stats.Flat` / `Ratio` 对用户面公开写入。**
   这是本实现里**唯一**一处破坏「最小公开」的地方：`Buff` 子类在框架外的程序集里定义，
   `internal` 通道走不通。取舍是「接受这个写入口泄漏」而不是「为一个不存在的多态建接口」。
   已用一条追溯注释标记（`Stats.cs`）。

8. **`Buffs` 用 `List<Buff>` + 线性扫描，不用 `Dictionary<Type, Buff>`。**
   一个角色身上 buff 数量是个位数。上字典会出现「列表 + 字典两份真相」，
   而 `spine-shape` 明确要求状态只有一份。判断：可读性与单一真相 > O(1)。

9. **`Character` 这个类很薄，只有 `Stats` / `Buffs` / `Tick` / `Die`。**
   它是聚合根，也是「角色死亡」这个时机的落点。`spine-check` 对「纯转发」是警惕的，
   我判断这三行值得：需求的主语就是「角色」。

10. **`Die()` 不设 `Dead` 标志、不拒绝后续施加。**
    见第 5 节第 4 条。加标志会把「角色是否活着」变成框架里的第二份状态。

11. **命名空间从 `Buffs` 改成 `Effects`。**
    这是编译器判定的（`namespace Buffs` + `class Buffs` ⇒ CS0118：编译单元级的 `using` 位于全局命名空间，
    命名空间成员压过了导入的类型）。但**保留类名 `Buffs`、改命名空间**是我的判断 ——
    `character.Buffs.Apply(…)` 这个 API 比命名空间的名字值钱。

12. **`net8.0` + `TreatWarningsAsErrors` + `Nullable enable`。**
    环境里装了 7.0.203 / 8.0.425 / 10.0.112 三个 SDK。选 LTS 8；把警告当错误，保证「能编译」不是侥幸。

13. **检查输出用英文，报告用中文。**
    Windows 控制台的默认输出编码会把中文打成乱码，而「实际输出原样贴回来」是交付要求。
    判断：输出可复现 > 输出语言与报告一致。

14. **追溯注释的作者名取 `dsh`，日期 `2026-10-10`。**
    `spine` 只规定格式「作者 - 日期 : 原因」，没规定作者是谁，我自己定的。

15. **把 `spine-check` 的红线做成可执行的断言。**
    「主干无 `else` / 无 `switch` / 无枚举 / 无填充词 / 无来源实现名 / 注释可追溯」全部落进
    `Structure.cs`，每次运行都验。这超出了需求（需求只要「核心行为正确」），
    但它是让「代码即设计」这句话可复跑的唯一办法。

---

## 4. 我刻意没有做的东西

| 没做 | 为什么不做 |
| --- | --- |
| **buff 的免疫 / 驱散 / 优先级 / 互斥组** | 需求没提。而且它们都能在主干之外加上去（互斥 = 一个 `Stacking` 子类，驱散 = 调 `Clear` 或持有对方凭据），不需要主干支持。提前做就是**功能齐全**而不是**能力完备** |
| **`Scope`（一组 `Handle` 打包释放）** | 三个来源各自维护 `List<Handle>`，是同 6 行重复。抽一个类型很诱人，但最小实现不需要它 —— 出现第四个来源时这份重复才变成抽取信号。现在抽是**为一个不存在的差异建抽象** |
| **`IBuffSource` 接口** | 三个来源唯一的共同点是「握着 `Handle`」。那不是一个共同行为，是一个值。给它们抽公共接口就是拿抽象去装巧合 |
| **事件 / 通知 / 脏标记** | UI 要显示 buff 列表就读 `Buffs.Held` —— 那是唯一真相。再挂一套订阅就是第二份全集 |
| **buff 的 ID / 配置表 / 序列化 / 工厂注册表** | 需求里的 buff 是代码里定义的。配置驱动是另一个维度，加进来会往主干里塞一个注册表 |
| **`[Require]` 式声明注入 / 单例容器** | 这是 `spine-level` 决策树的第四步。本项目构造链只有一层（`new Buffs(stats)`），注入面已经窄到「一个对象的两个方法」。而且没有生成等级图的工具时，这一层的收益小于代价（依赖从签名里消失）。停在第三步 |
| **多线程安全** | 需求是逐帧递减的单线程模型。加锁会把所有方法变成不可读，且没有热路径依据 |
| **性能优化（增量更新属性而不是全量 `Rebuild`）** | `Rebuild` 只在 buff 集合变化时跑，buff 数量是个位数 —— 低频路径。`spine` 的豁免条款只给最低等级框架内部，且要求「高频才优化，且要有依据」。现在没有依据 |
| **定点数 / 整数帧计时** | 见第 5 节第 6 条。需求没说精度策略 |
| **死亡后拒绝施加 buff** | 见第 5 节第 4 条 |
| **`else` / `switch` / `enum` / 说明性注释** | 不是「没来得及」，是刻意不做。主干里 `else` 0 处、`switch` 0 处、`enum` 0 处，注释只有 1 条追溯注释 —— 且这五条都有可复跑的断言盯着 |

---

## 5. 我认为不可判定、需要人来定的需求

按「不定就没法确定行为」的严重度排序：

1. **同一 buff 被两个来源挂上，一个撤销后另一个还算不算数？**
   我选了**算**（`claims` 引用计数）。但这是**产品决定**不是技术决定：
   如果策划要的是「任何一方撤销即整体消失」，去掉 `claims` 即可。
   需求写了「三类来源互相不知道对方」，恰恰使得「谁知道该不该整体消失」无人可问 —— 这正是它不可判定的原因。

2. **「同一个 buff」的身份由什么决定？**
   我用 CLR 类型。但需求没说「技能的 +10 攻击」和「装备的 +10 攻击」是不是同一个 buff。
   如果它们应当各自独立，身份就不能是类型，得由 buff 自带一个 key，`Buffs.Find` 的判据要换
   （目前主干里只有一行）。这个决定我做不了，因为它取决于数值策划怎么想。

3. **「场景卸载」的清理范围是「场景挂的那些」还是「角色身上的一切」？**
   我落成前者（靠 `Handle` 记账）。但「角色已经不在任何场景里了」也可以被读成后者。
   两种解释下代码形状不同：后者需要角色记录自己的场景归属，而不是靠凭据。
   需求同时说了「角色死亡」和「场景卸载」两个时机，暗示它们清理的**不是**同一批东西 —— 但也只是暗示。

4. **角色死亡之后还能不能被施加 buff？**
   我允许（`Die()` 只做 `Clear()`）。如果要做成「死亡后拒绝一切施加」，就需要 `Dead` 标志 + 拒绝策略，
   而「复活」必须负责重置它 —— 那条链需求里完全没有。这决定了 `Character` 要不要变成一个小状态机。

5. **叠层 buff 重复施加时，持续时间取哪一个？**
   需求只说「层数影响强度」。我给 `Stacking.Add` 选了「取较长的那个」（重复施加兼作刷新），
   给 `Stacking.Refresh` 选了「重置为新值」。另外两种同样合理：时长相加、或每层各自独立计时。
   三者行为差异很大，需求无法区分。

6. **「归零时自动失效」的精度判据是什么？**
   我落成 `Remaining > 0` 存活。逐帧递减的浮点误差会让一个理论 10 秒的 buff 在 9.999999 或
   10.000001 秒结束。如果要求「一定是 600 帧」这种严格一致，需要定点数或整数帧计数。
   这是精度策略，需求没说，而且它会影响 `Layer.Remaining` 的类型（`float` → 别的）。

7. **加算与乘算之外，还会不会有第三种修改方式？**
   需求把「两种」写死了，我就只做两种。但 `(Basis + Flat) * Ratio` 这个形状承载不了
   「覆盖为固定值」「取所有来源的最大值」这类语义 —— 那要改 `Stats` 的**数据形状**，
   也就是「修改抽象」而不是「新增抽象」。这个边界在哪，需要人划。

---

## 附录 A：完整运行输出

命令与输出（`bin/` `obj/` 全删后重建）：

```console
$ pwsh -NoProfile -File H:\Git\dsh-mydsh\.spine-test\run.ps1
== buff system check ==
-- stat modification (flat / ratio) --
PASS  attack basis                                    expected 100, got 100
PASS  flat +5 on basis 100                            expected 105, got 105
PASS  (100 + 5) * 1.2                                 expected 126, got 126
PASS  ratio first equals flat first                   expected 126.00001, got 126
-- stacking rules --
PASS  Rage stacks to 3 layers                         expected 3, got 3
PASS  3 layers of +5 on basis 100                     expected 115, got 115
PASS  Rage caps at Stacking.Add(5)                    expected 5, got 5
PASS  cap holds attack at 125                         expected 125, got 125
PASS  Haste burned 3 of 5 seconds                     expected 2, got 2
PASS  Refresh resets the clock                        expected 5, got 5
PASS  Refresh keeps a single layer                    expected 1, got 1
PASS  Charge burned 1 of 3 seconds                    expected 2, got 2
PASS  Extend piles time up to its cap                 expected 5, got 5
PASS  Extend keeps a single layer                     expected 1, got 1
-- three sources that do not know each other --
PASS  three sources hold three buffs                  expected 3, got 3
PASS  Rage and Blade compose                          expected 126, got 126
PASS  Aura raises move speed                          expected 6.5, got 6.5
PASS  skill end drops only its own buff               expected 2, got 2
PASS  attack without Rage                             expected 120, got 120
PASS  move speed untouched by skill end               expected 6.5, got 6.5
PASS  two sources share one instance                  expected 1, got 1
PASS  shared layers add up                            expected 2, got 2
PASS  shared attack                                   expected 110, got 110
PASS  one claimant left keeps the buff                expected 110, got 110
PASS  last claimant clears it                         expected 0, got 0
PASS  attack back to basis                            expected 100, got 100
-- cleanup on death and scene unload --
PASS  death alone clears every buff                   expected 0, got 0
PASS  death alone restores attack                     expected 100, got 100
PASS  death alone restores move speed                 expected 5, got 5
PASS  death first: late releases change nothing       expected 0, got 0
PASS  death first: attack stays restored              expected 100, got 100
PASS  death first: move speed stays restored          expected 5, got 5
PASS  unload first: aura buff gone                    expected 2, got 2
PASS  unload first: other sources untouched           expected 126, got 126
PASS  unload first: move speed restored               expected 5, got 5
PASS  unload first: no buffs left                     expected 0, got 0
PASS  both orders land on the same state              0 buffs, attack 100, speed 5 vs 0 buffs, attack 100, speed 5
PASS  aura drops the one that left                    expected 0, got 0
PASS  aura keeps the one in range                     expected 1, got 1
PASS  aura unload clears the rest                     expected 0, got 0
PASS  still held before the clock runs out            expected 1, got 1
PASS  removed on the frame it expires                 expected 0, got 0
PASS  stat restored on expiry                         expected 100, got 100
PASS  release after release and death is a no-op      expected 0, got 0
PASS  attack after repeated release                   expected 100, got 100

-- structural red lines --
PASS  No Else in the trunk                            7 files clean
PASS  No Switch in the trunk                          7 files clean
PASS  types replace enums in the trunk                7 files clean
PASS  no filler-word names                            7 files clean
PASS  trunk names no implementation                   7 files clean
PASS  every comment is traceable                      1 comment(s), 0 violating 
PASS  source Skill names no other source              isolated
PASS  source Equipment names no other source          isolated
PASS  source Aura names no other source               isolated

OK  54/54 assertions passed
[exit=0]
```

## 附录 B：这份检查被验证过「有牙」

「全绿」只有在它**会红**的前提下才有意义。所以做了三次变异测试（改坏 → 跑 → 确认红 → 还原）：

| 变异 | 预期红 | 实际 |
| --- | --- | --- |
| `Stacking.Add.Merge` 不再累加层数 | 叠层相关全红 | `FAILED 41/49`：`Rage stacks to 3 layers`、`3 layers of +5`、`Rage caps`、`cap holds attack`、`shared layers add up`、`shared attack`、`one claimant left keeps the buff` |
| 框架文件里加一个 `else` | 结构红线红 | `FAIL  No Else in the trunk  Buffs.cs:30` |
| `Character.Die()` 改成空实现 | 死亡清理红 | `FAILED 51/54`：`death alone clears every buff`、`death alone restores attack`、`death alone restores move speed` |
| `Aura.Unload()` 只清账不释放 | 场景卸载红 | `FAILED 51/54`：`unload first: aura buff gone`、`unload first: move speed restored`、`aura unload clears the rest` |

第 3 次变异**第一次跑时没有红** —— 因为当时「死亡优先」的场景在 `Die()` 之后又调了
`skill.End()` / `TakeOff()` / `Unload()`，把 `Die()` 失效这件事盖住了。
这是变异测试真正抓到的测试盲区：检查从 49 条补到 54 条，加了
`death alone clears every buff` / `death alone restores attack` / `death alone restores move speed`，
让「角色死亡」和「场景卸载」两个时机各自被独立断言，不再互相掩盖。
