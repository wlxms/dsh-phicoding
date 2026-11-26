using Spine.Equip;

namespace Check;

public interface IOffHandKind : IItemKind
{
}

public sealed class OffHand : ISlot
{
    public bool Takes(IItemKind kind) => kind is IOffHandKind;
}

public abstract class OffHandKind : IOffHandKind
{
}

public sealed class Wand : OffHandKind
{
}

public sealed class Relic : ISlot
{
    public bool Takes(IItemKind kind) => kind is ITrinketKind;
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
