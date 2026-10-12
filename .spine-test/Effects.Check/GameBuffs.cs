using Effects;

namespace Check;

internal sealed class Rage : Buff
{
    public Rage() : base(10f, new Stacking.Add(5)) { }

    public override void Modify(Stats stats, int layers) => stats.Flat<Attack>(5f * layers);
}

internal sealed class Blade : Buff
{
    public Blade() : base(600f, new Stacking.Refresh()) { }

    public override void Modify(Stats stats, int layers) => stats.Ratio<Attack>(1.2f);
}

internal sealed class Haste : Buff
{
    public Haste() : base(5f, new Stacking.Refresh()) { }

    public override void Modify(Stats stats, int layers) => stats.Flat<MoveSpeed>(1.5f);
}

internal sealed class Charge : Buff
{
    public Charge() : base(3f, new Extend(12f)) { }

    public override void Modify(Stats stats, int layers) => stats.Flat<Attack>(2f);
}
