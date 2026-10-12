namespace Spine.Equip;

public sealed class Set
{
    public Set(int pieces, IReadOnlyList<Mod> mods)
    {
        Pieces = pieces;
        Mods = mods;
    }

    public int Pieces { get; }

    public IReadOnlyList<Mod> Mods { get; }
}
