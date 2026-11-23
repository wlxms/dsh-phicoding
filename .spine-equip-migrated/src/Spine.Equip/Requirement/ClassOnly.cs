namespace Spine.Equip;

public sealed class ClassOnly : IRequirement
{
    private readonly IJob job;

    public ClassOnly(IJob job) => this.job = job;

    public bool Met(Wearer wearer) => job.GetType().IsInstanceOfType(wearer.Job);
}
