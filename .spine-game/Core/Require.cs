namespace Spine;

public abstract class Require
{
    public abstract bool Pass(Sheet sheet);
}

public sealed class AtLeast(string trait, int floor) : Require
{
    public override bool Pass(Sheet sheet) => sheet.Value(trait).Now >= floor;
}

public sealed class Brand(string mark) : Require
{
    public override bool Pass(Sheet sheet) => sheet.Tagged(mark);
}
