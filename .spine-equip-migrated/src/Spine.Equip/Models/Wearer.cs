namespace Spine.Equip;

public readonly struct Wearer
{
    public Wearer(int level, Type job)
    {
        Level = level;
        Job = job;
    }

    public int Level { get; }

    public Type Job { get; }
}
