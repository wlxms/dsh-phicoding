namespace Spine.Equip;

public sealed class Registry<T>
{
    private readonly Dictionary<string, T> map = new();

    public void Add(string name, T value)
    {
        if (map.ContainsKey(name)) throw new InvalidOperationException("already registered: " + name);
        map[name] = value;
    }

    public bool Has(string name) => map.ContainsKey(name);

    public T Get(string name)
    {
        if (map.TryGetValue(name, out var value)) return value;
        throw new KeyNotFoundException("not registered: " + name);
    }
}
