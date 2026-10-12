---
name: phicoding-unity
description: Unity 组件与全局管理器的关系。MonoBehaviour 无法构造注入，所以「推」是唯一的无环解——组件在 Awake 里向一个最低等级的账本自报家门，管理器订阅变化。含完整 Board 实现、先回放后增量的时序保证，以及 Domain Reload、假 null、委托身份三个 Unity 特有陷阱。WHEN：写任何 MonoBehaviour、管理器、组件注册，或处理 Unity 生命周期与销毁时序时加载。
---

# phicoding-unity

## 为什么必然落在「推」

`MonoBehaviour` **无法接受构造注入**：不能写构造函数，实例由 Unity 反序列化或 `AddComponent` 创建。

所以四步决策树里：

| 步 | 可用性 |
| --- | --- |
| 第一步 拿掉职责 | **不适用**——组件必须自报家门，没人能替它报 |
| 第二步 推 | **唯一出路** |
| 第三步 下沉契约 + 注入 | 不可用——注入需要一个构造点 |
| 第四步 `[Require]` | 可用，但不必要 |

## 那个最底层类型必须同时是账本和通道

`Awake` 的顺序在 Unity 里**不确定**。若管理器比组件晚初始化：

> 组件喊了一声，当时没人在听 → 这条信息永久丢失。

**纯通道结构上无法解决它**——通道不保存状态。所以：**订阅时先把已有的回放给你。**

```csharp
public static class Board
{
    private static readonly List<Action> clears = new();

    private static class Slot<T>
    {
        static Slot() => clears.Add(() => { items.Clear(); added = null; removed = null; });

        public static readonly List<T> items = new();
        public static Action<T> added;
        public static Action<T> removed;
    }

    public static void Attach<T>(T item)
    {
        Slot<T>.items.Add(item);
        Slot<T>.added?.Invoke(item);
    }

    public static void Detach<T>(T item)
    {
        Slot<T>.items.Remove(item);
        Slot<T>.removed?.Invoke(item);
    }

    public static IReadOnlyList<T> All<T>() => Slot<T>.items;

    public static Action Watch<T>(Action<T> added, Action<T> removed)
    {
        Slot<T>.added += added;
        Slot<T>.removed += removed;
        var snapshot = Slot<T>.items.ToArray();
        for (int i = 0; i < snapshot.Length; i++) added(snapshot[i]);
        return () => Unwatch(added, removed);
    }

    public static void Unwatch<T>(Action<T> added, Action<T> removed)
    {
        Slot<T>.added -= added;
        Slot<T>.removed -= removed;
    }

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
    private static void Reset()
    {
        for (int i = 0; i < clears.Count; i++) clears[i]();
    }
}
```

组件侧——**不知道有谁在看**：

```csharp
public sealed class Unit : MonoBehaviour
{
    private void Awake() => Board.Attach(this);
    private void OnDestroy() => Board.Detach(this);
}
```

管理器侧——**不在乎组件什么时候创建**：

```csharp
public sealed class Units : MonoBehaviour
{
    private Action stop;

    private void OnEnable() => stop = Board.Watch<Unit>(Enter, Exit);
    private void OnDisable() => stop();

    private void Enter(Unit unit) => pool.Warm(unit);
    private void Exit(Unit unit) => pool.Release(unit);

    private void Update()
    {
        var units = Board.All<Unit>();
        for (int i = 0; i < units.Count; i++)
        {
            if (units[i] == null) continue;
            units[i].Tick();
        }
    }
}
```

**时序无关**：管理器先订阅 → 回放补上已有的；组件先创建 → 进了账本，订阅时回放补上。两种顺序结果一致，**因此不需要 `[DefaultExecutionOrder]`**——那是约定式解法的补丁，而这里是结构保证。

## 状态与变化必须分开

| 机制 | 职责 |
| --- | --- |
| `All<T>()` | **状态**——唯一真相来源 |
| `Watch<T>()` | **变化**——通知，且回放 |

管理器**不在自己的列表里存副本**：回调只触发动作（`Warm` / `Release`），要遍历就查 `All<T>()`。

否则就是两份 `Unit` 全集——**第二个真相来源**，一旦不同步就要开始写仲裁代码。

## 三个 Unity 特有陷阱

**1. Domain Reload 关闭时静态状态跨播放残留。** 这是静态类在 Unity 里唯一的坑。`Reset` 挂在 `SubsystemRegistration` 时机清空所有槽；`clears` 本身保留（它记录的是「见过哪些类型」，本来就该保留）。

**2. 假 null。** 已销毁对象 `== null` 为 true，但引用还在 `items` 里。所以 `Update` 里那句 `if (units[i] == null) continue;` **不是过度容错**，是 Unity 对象模型的正确语义（用的是重载的 `==`）。而 `Detach` 走 `List.Remove`（`Object.Equals` 是引用比较）是安全的。

**3. 委托身份。** 方法组每次转换都产生**新委托**，所以 `Unwatch<Unit>(OnEnter, OnExit)` 传新委托会退订失败。因此 `Watch` 直接**返回取消动作**——把「订阅必须能退订」变成不可能忘记，而不是要求使用者记住委托身份。
