namespace Spine.Equip;

public sealed class MinLevel : Requirement
{
    private readonly int level;

    public MinLevel(int level) => this.level = level;

    public override bool Met(Wearer wearer) => wearer.Level >= level;
}

public sealed class ClassOnly : Requirement
{
    private readonly Job job;

    public ClassOnly(Job job) => this.job = job;

    public override bool Met(Wearer wearer) => job.GetType().IsInstanceOfType(wearer.Job);
}
