namespace Spine;

public sealed class Suit(string name, int need, params Shift[] shifts)
{
    public string Name { get; } = name;

    public int Need { get; } = need;

    public void Affect(Sheet sheet)
    {
        foreach (var shift in shifts) shift.Apply(sheet);
    }
}
