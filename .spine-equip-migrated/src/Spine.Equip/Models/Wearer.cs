namespace Spine.Equip;

public readonly struct Wearer
{
    public Wearer(int level, IJob job)
    {
        Level = level;
        Job = job;
    }

    public int Level { get; }

    public IJob Job { get; }
}
