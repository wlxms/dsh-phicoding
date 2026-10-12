namespace Spine.Equip;

public struct Pool
{
    public float Flat;
    public float Ratio;

    public Pool(float basis)
    {
        Flat = basis;
        Ratio = 1f;
    }

    public void Add(float value) => Flat += value;

    public void Mul(float value) => Ratio *= value;

    public readonly float Final => Flat * Ratio;
}

public sealed class Stats
{
    private readonly Dictionary<Type, Pool> pools = new();

    internal void Reset(IReadOnlyList<KeyValuePair<Stat, float>> basis)
    {
        pools.Clear();
        foreach (var pair in basis) pools[pair.Key.GetType()] = new Pool(pair.Value);
    }

    internal void Apply(IReadOnlyList<Mod> mods)
    {
        foreach (var mod in mods)
        {
            var key = mod.Stat.GetType();
            if (!pools.TryGetValue(key, out var pool)) pool = new Pool(0f);
            pool.Add(mod.Add);
            pool.Mul(mod.Mul);
            pools[key] = pool;
        }
    }

    public Pool Pool<T>() where T : Stat
    {
        if (pools.TryGetValue(typeof(T), out var pool)) return pool;
        return new Pool(0f);
    }

    public float Get<T>() where T : Stat => Pool<T>().Final;
}
