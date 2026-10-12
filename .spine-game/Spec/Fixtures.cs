namespace Spine.Spec;

using Spine;

public sealed class GearSpec(string name, Slot slot, Shift[] shifts, Suit? suit = null, params Require[] needs)
    : Equip(name, suit, shifts, needs)
{
    public override Slot Slot => slot;
}

public sealed class PillSpec(string name, string trait, int delta) : Consumable(name)
{
    public override void Use(Sheet sheet) => sheet.Value(trait).Origin += delta;
}
