using Effects;

namespace Check;

internal sealed class Equipment
{
    private readonly Buffs buffs;
    private readonly List<Handle> handles = new();

    public Equipment(Buffs buffs) => this.buffs = buffs;

    public void Wear(Func<Buff> granted) => handles.Add(buffs.Apply(granted));

    public void TakeOff()
    {
        for (int i = 0; i < handles.Count; i++) handles[i].Release();
        handles.Clear();
    }
}
