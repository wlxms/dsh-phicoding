namespace Spine;

public abstract class Shift(string trait)
{
    public string Trait { get; } = trait;

    public abstract void Apply(Sheet sheet);
}

public sealed class Plus(string trait, int amount) : Shift(trait)
{
    public override void Apply(Sheet sheet) => sheet.Value(Trait).Add(amount);
}

public sealed class Times(string trait, int percent) : Shift(trait)
{
    public override void Apply(Sheet sheet) => sheet.Value(Trait).Scale(percent);
}
