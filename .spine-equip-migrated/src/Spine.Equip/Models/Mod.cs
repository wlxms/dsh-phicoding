namespace Spine.Equip;

public readonly struct Mod
{
    public Mod(Type stat, float add, float mul)
    {
        Stat = stat;
        Add = add;
        Mul = mul;
    }

    public Type Stat { get; }

    public float Add { get; }

    public float Mul { get; }
}
