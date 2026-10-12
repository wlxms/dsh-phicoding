namespace Spine.Equip;

public readonly struct Mod
{
    public Mod(Stat stat, float add, float mul)
    {
        Stat = stat;
        Add = add;
        Mul = mul;
    }

    public Stat Stat { get; }

    public float Add { get; }

    public float Mul { get; }
}
