namespace Spine.Data;

using Spine;

public sealed class Sword(string name, int bonus, Suit? suit = null, params Require[] needs)
    : Equip(name, suit, [new Plus("身法", bonus)], needs)
{
    public override Slot Slot => Slots.Hand;
}

public sealed class Blade(string name, int bonus, Suit? suit = null, params Require[] needs)
    : Equip(name, suit, [new Plus("根骨", bonus)], needs)
{
    public override Slot Slot => Slots.Hand;
}

public sealed class Robe(string name, int bonus, Suit? suit = null, params Require[] needs)
    : Equip(name, suit, [new Plus("根骨", bonus)], needs)
{
    public override Slot Slot => Slots.Body;
}

public sealed class Crown(string name, int bonus, Suit? suit = null, params Require[] needs)
    : Equip(name, suit, [new Plus("悟性", bonus)], needs)
{
    public override Slot Slot => Slots.Head;
}

public sealed class Boots(string name, int bonus, Suit? suit = null, params Require[] needs)
    : Equip(name, suit, [new Plus("身法", bonus)], needs)
{
    public override Slot Slot => Slots.Feet;
}

public sealed class HeavyBlade(string name, int bonus, int floor, Suit? suit = null, params Require[] needs)
    : Equip(name, suit, [new Plus("根骨", bonus)], needs)
{
    public override Slot Slot => Slots.Hand;

    public override void Affect(Sheet sheet)
    {
        base.Affect(sheet);
        if (sheet.Value("根骨").Origin >= floor) return;
        sheet.Value("身法").Add(-2);
    }
}
