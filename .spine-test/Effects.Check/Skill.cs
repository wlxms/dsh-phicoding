using Effects;

namespace Check;

internal sealed class Skill
{
    private readonly Buffs buffs;
    private readonly List<Handle> handles = new();

    public Skill(Buffs buffs) => this.buffs = buffs;

    public void Cast(Func<Buff> granted) => handles.Add(buffs.Apply(granted));

    public void End()
    {
        for (int i = 0; i < handles.Count; i++) handles[i].Release();
        handles.Clear();
    }
}
