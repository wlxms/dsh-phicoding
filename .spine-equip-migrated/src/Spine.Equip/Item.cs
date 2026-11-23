namespace Spine.Equip;

public sealed class Item
{
    internal Action? unbind;

    public Item(IItemKind kind, IReadOnlyList<Mod> mods, IReadOnlyList<IRequirement> requires, Set? set)
    {
        Kind = kind;
        Mods = mods;
        Requires = requires;
        Set = set;
    }

    public IItemKind Kind { get; }

    public IReadOnlyList<Mod> Mods { get; }

    public IReadOnlyList<IRequirement> Requires { get; }

    public Set? Set { get; }

    public bool Destroyed { get; private set; }

    public bool Held => unbind != null;

    public void Destroy()
    {
        Destroyed = true;
        var notify = unbind;
        unbind = null;
        notify?.Invoke();
    }
}
