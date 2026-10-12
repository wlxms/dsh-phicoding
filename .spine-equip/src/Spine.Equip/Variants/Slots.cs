namespace Spine.Equip;

public sealed class Weapon : Slot
{
    public override bool Takes(ItemKind kind) => kind is Kind;

    public abstract class Kind : ItemKind
    {
    }
}

public sealed class Armor : Slot
{
    public override bool Takes(ItemKind kind) => kind is Kind;

    public abstract class Kind : ItemKind
    {
    }
}

public sealed class Trinket : Slot
{
    public override bool Takes(ItemKind kind) => kind is Kind;

    public abstract class Kind : ItemKind
    {
    }
}
