namespace Spine.Equip;

public sealed class ClassOnly : IRequirement
{
    private readonly Type job;

    public ClassOnly(IJob job) => this.job = job.GetType();

    public bool Met(Wearer wearer) => job.IsAssignableFrom(wearer.Job);
}
