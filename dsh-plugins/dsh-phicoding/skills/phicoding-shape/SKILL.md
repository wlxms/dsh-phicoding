---
name: phicoding-shape
description: 可复用的结构形态库。核心是一条定理——在「主干只知抽象 + 类型替代枚举 + 信息单向」下，任何开放的集合都必然表现为「按类型索引」——以及五个已验证形态：单例、事件、管线、修正累积、账本加变化。含泛型静态槽的统一清理手法与「状态与变化必须分开且状态只有一份」。WHEN：要写注册表、事件系统、管线、管理器、属性或修正系统时加载。
---

# phicoding-shape

## 一条定理

> **在「主干只知抽象 + 类型替代枚举 + 信息单向」三条约束下，任何开放的集合都必然表现为「按类型索引」。**

它在五个不同问题上独立出现过：单例的 `Get<T>()`、事件的事件身份、元素与属性的键、伤害维度的 `GetDimension<T>()`、组件账本的 `Slot<T>`。

**五个例子的键都是编译期类型 `T`——这是硬要求，不是巧合。** 反例：

```csharp
public sealed class SlotKind                                        // ✗ 一个类型被降级成了数据
{
    public string Name { get; }
    public Slot Slot { get; }
}

private static readonly Dictionary<string, SlotKind> map = new();   // ✗ 字符串当键
```

一旦键是字符串，就必须发明一个类来承载这个字符串的含义，而主干里**再也写不出 `is`**（见 `phicoding-check` 的 A / B）。

> **字符串键只允许出现在工厂**——名字 → 类型的唯一位置。主干里出现 `Dictionary<string, ...>` 并且用它决定行为，就是违规。

**这不是五种模式，是一种。** 所以它自带一个统一的代价与一个统一的解。

| 代价 | 解 |
| --- | --- |
| 泛型静态槽**无法枚举**，因此无法批量清理 | **静态构造自登记** |

```csharp
private static readonly List<Action> clears = new();

private static class Slot<T>
{
    static Slot() => clears.Add(() => items.Clear());
    public static readonly List<T> items = new();
}

public static void Clear()
{
    for (int i = 0; i < clears.Count; i++) clears[i]();
}
```

`Slot<T>` 第一次被使用时静态构造跑一次，顺手把自己登记进非泛型的 `clears`。**零反射、零枚举开销、零诊断代码**，且读路径上不多一次比较——优于版本号方案。

## 单例

> **下面的形态都是静态的，但它们合法——前提是这些类型被项目声明为账本。**
> `0600-no-static-state` 禁的是**可变的**静态状态，不是 `static` 这个关键字；
> 而账本是例外，缝开在 `.phicoding/config.json` 的 `staticStateOwners` 里，
> 由项目点名。没点名的静态可变状态照报。

```csharp
public static class Singleton
{
    private static readonly List<Action> clears = new();
    private static readonly Dictionary<Type, object> map = new();

    private static class Slot<T>
    {
        static Slot() => clears.Add(() => Value = null);
        public static T Value;
    }

    public static void Set<T>(T value) where T : class
    {
        if (Slot<T>.Value != null) throw new InvalidOperationException(typeof(T).Name);
        foreach (var need in Needs(value))
        {
            if (!map.ContainsKey(need)) throw new InvalidOperationException(typeof(T).Name + " -> " + need.Name);
        }
        Slot<T>.Value = value;
        map[typeof(T)] = value;
    }

    public static T Get<T>() where T : class => Slot<T>.Value ?? throw new InvalidOperationException(typeof(T).Name);

    private static Require[] Needs(object value) => value.GetType().GetCustomAttributes<Require>(true).ToArray();
}
```

`Slot<T>` 让 `Get` 只剩一次字段读；`map` 只用于 `[Require]` 校验与释放。

## 事件

**写少读多**——`Reg`/`UnReg` 低频，`Fire` 高频。所以订阅时复制数组，派发时零分配零查找。

```csharp
public static class Event
{
    private static class Slot<T> { public static Action<T>[] handlers = Array.Empty<Action<T>>(); }

    public static void Reg<T>(Action<T> handler)
    {
        var old = Slot<T>.handlers;
        var next = new Action<T>[old.Length + 1];
        Array.Copy(old, next, old.Length);
        next[old.Length] = handler;
        Slot<T>.handlers = next;
    }

    public static void Fire<T>(T body)
    {
        var handlers = Slot<T>.handlers;
        for (int i = 0; i < handlers.Length; i++) handlers[i](body);
    }
}
```

**写时复制免费送了一个语义**：`Fire` 期间 `Reg`/`UnReg` 天然不影响本轮。

订阅必须能退订——**让 `Watch` 直接返回取消动作**，而不是要求使用者记住委托身份（方法组每次转换都是新委托）。

## 管线

`Pipe<T> : Pass<T>` —— 让管道自己也是一个环节。分组、复用、条件、中断全部变成组合，主干零改动。详见 `phicoding-design`。

## 修正累积

加算与乘算分成两个累积器后，**施加顺序不参与结果**。

> **这是实现选择，不是准则。** 顺序敏感的实现（按来源精确记账、精确撤销）同样合格。
> 通常选这个形状，是因为它更小，而且消掉了一整类扯皮；代价是**每次变更全量重算**——
> 低频场景下这个代价可以忽略，热路径上要另说（见 `phicoding` 的边界节）。

```csharp
public struct Pool
{
    public float Flat;
    public float Ratio;

    public Pool(float basis) { Flat = basis; Ratio = 1f; }

    public void Add(float value) => Flat += value;
    public void Mul(float value) => Ratio *= value;

    public readonly float Final => Flat * Ratio;
}
```

这消掉一整类扯皮（「装备先算还是技能先算」）——不是靠约定顺序，是靠**形状上让顺序无关**。

## 账本 + 变化

**状态与变化分开，状态只留一份。**

| 机制 | 职责 |
| --- | --- |
| `All<T>()` | **状态**——唯一真相来源 |
| `Watch<T>()` | **变化**——通知，且回放已有的 |

使用者**不在自己的列表里存副本**：回调只触发动作，要遍历就查 `All<T>()`。否则就是两份全集——第二个真相来源。完整实现在 `phicoding-unity`。

> **这一条同样是实现选择，不是准则。** 它之所以被推荐：两份全集要写同步代码，而同步代码迟早不一致。
> 它管的是**信息有边界**（设计层）——同一个事实不要在两处各存一份。

### 容器不暴露自己的键，会逼出外挂账本

一个具体的失效形状：容器按"来源"分片记账，却不提供"我现在有哪些来源"的查询。使用方要撤销某个来源时无法问容器，只好**自己另存一份来源清单**——第二个真相来源就诞生了。

```csharp
public static class Equipped
{
    private static readonly Dictionary<Character, ImmutableArray<string>> active = new();   // ← 外挂账本
}
```

两个后果：**进程级静态字典、键是实例 → 那些实例永不释放**；实例被 `Reset()` 之后这本账还留着旧值 → 状态不一致，**而且没有任何东西会报错**。

> **判据：`static` 字段的类型参数里出现实例类型。** 出现即违规——状态要么跟着实例走，要么容器自己能被枚举。

修法是让容器回答"我有哪些来源"，而不是让使用方另存一本。
