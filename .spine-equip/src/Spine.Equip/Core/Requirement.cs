namespace Spine.Equip;

public readonly struct Wearer
{
    public Wearer(int level, Job job)
    {
        Level = level;
        Job = job;
    }

    public int Level { get; }

    public Job Job { get; }
}

public abstract class Requirement
{
    public abstract bool Met(Wearer wearer);
}
