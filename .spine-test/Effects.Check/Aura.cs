using Effects;

namespace Check;

internal sealed class Aura
{
    private readonly Dictionary<Buffs, Handle> affected = new();

    public void Enter(Buffs target, Func<Buff> granted) => affected[target] = target.Apply(granted);

    public void Leave(Buffs target)
    {
        if (!affected.Remove(target, out var handle)) return;
        handle.Release();
    }

    public void Unload()
    {
        foreach (var handle in affected.Values) handle.Release();
        affected.Clear();
    }
}
