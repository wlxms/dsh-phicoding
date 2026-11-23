namespace Spine.Equip;

public readonly struct Mod
{
    public Mod(IStat stat, float add, float mul)
    {
        Stat = stat;
        Add = add;
        Mul = mul;
    }

    public IStat Stat { get; }

    public float Add { get; }

    public float Mul { get; }
}
