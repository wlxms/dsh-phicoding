using Spine.Equip;

namespace Check;

public sealed class OffHand : Slot
{
    public override bool Takes(ItemKind kind) => kind is Kind;

    public abstract class Kind : ItemKind
    {
    }
}

public sealed class Wand : OffHand.Kind
{
}

public sealed class Relic : Slot
{
    public override bool Takes(ItemKind kind) => kind is Trinket.Kind;
}

public sealed class Focus : Stat
{
}

public sealed class MaxLevel : Requirement
{
    private readonly int level;

    public MaxLevel(int level) => this.level = level;

    public override bool Met(Wearer wearer) => wearer.Level <= level;
}
