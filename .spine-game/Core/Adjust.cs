namespace Spine;

public abstract class Adjust
{
    public abstract int Of(Sheet sheet);
}

public sealed class Flat(int amount) : Adjust
{
    public override int Of(Sheet sheet) => amount;
}

public sealed class Score(string trait) : Adjust
{
    public override int Of(Sheet sheet) => sheet.Value(trait).Now;
}

public sealed class Total(params Adjust[] parts) : Adjust
{
    public override int Of(Sheet sheet)
    {
        var sum = 0;
        foreach (var part in parts) sum += part.Of(sheet);
        return sum;
    }
}
