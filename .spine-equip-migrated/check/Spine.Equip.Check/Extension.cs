using Spine.Equip;

namespace Check;

public sealed class OffHand : ISlot
{
    // [Administrator 2026-11-18 waive=0750 why=plumbing] 槽位要按自己的 kind 族做类型判断
    public bool Takes(IItemKind kind) => kind is OffHandKind;
}

public abstract class OffHandKind : IItemKind
{
}

public sealed class Wand : OffHandKind
{
}

public sealed class Relic : ISlot
{
    // [Administrator 2026-11-18 waive=0750 why=plumbing] 槽位要按自己的 kind 族做类型判断
    public bool Takes(IItemKind kind) => kind is TrinketKind;
}

public sealed class Focus : IStat
{
}

public sealed class MaxLevel : IRequirement
{
    private readonly int level;

    public MaxLevel(int level) => this.level = level;

    public bool Met(Wearer wearer) => wearer.Level <= level;
}
