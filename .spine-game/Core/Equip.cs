namespace Spine;

public abstract class Equip : Item
{
    private readonly Shift[] shifts;
    private readonly Require[] needs;

    protected Equip(string name, Suit? suit, Shift[] shifts, Require[] needs) : base(name)
    {
        Suit = suit;
        this.shifts = shifts;
        this.needs = needs;
    }

    public Suit? Suit { get; }

    public abstract Slot Slot { get; }

    public bool Need(Sheet sheet)
    {
        foreach (var need in needs) if (!need.Pass(sheet)) return false;
        return true;
    }

    public virtual void Affect(Sheet sheet)
    {
        foreach (var shift in shifts) shift.Apply(sheet);
    }
}
