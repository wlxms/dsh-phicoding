namespace Spine.Equip;

public interface IStats
{
    Pool Pool<T>()
        where T : IStat;

    float Get<T>()
        where T : IStat;
}

public interface IStatsMutable : IStats
{
    void Reset(IReadOnlyList<KeyValuePair<IStat, float>> basis);

    void Apply(IReadOnlyList<Mod> mods);
}
