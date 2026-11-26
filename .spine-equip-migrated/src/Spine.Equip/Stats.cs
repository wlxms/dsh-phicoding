namespace Spine.Equip;

public sealed class Stats : IStatsMutable
{
    private readonly Dictionary<Type, Pool> pools = new();

    public void Reset(IReadOnlyList<KeyValuePair<IStat, float>> basis)
    {
        pools.Clear();
        foreach (var pair in basis) pools[pair.Key.GetType()] = new Pool(pair.Value);
    }

    public void Apply(IReadOnlyList<Mod> mods)
    {
        foreach (var mod in mods)
        {
            var key = mod.Stat;
            if (!pools.TryGetValue(key, out var pool)) pool = new Pool(0f);
            pool.Add(mod.Add);
            pool.Mul(mod.Mul);
            pools[key] = pool;
        }
    }

    public Pool Pool<T>() where T : IStat
    {
        if (pools.TryGetValue(typeof(T), out var pool)) return pool;
        return new Pool(0f);
    }

    public float Get<T>() where T : IStat => Pool<T>().Final;
}
