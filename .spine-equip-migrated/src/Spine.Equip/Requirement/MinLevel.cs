namespace Spine.Equip;

public sealed class MinLevel : IRequirement
{
    private readonly int level;

    public MinLevel(int level) => this.level = level;

    public bool Met(Wearer wearer) => wearer.Level >= level;
}
