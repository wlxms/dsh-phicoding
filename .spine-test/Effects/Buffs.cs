namespace Effects;

public sealed class Buffs
{
    private readonly Stats stats;
    private readonly List<Buff> held = new();

    public Buffs(Stats stats) => this.stats = stats;

    public IReadOnlyList<Buff> Held => held;

    public Handle Apply(Func<Buff> create)
    {
        var added = create();
        var existing = Find(added);
        if (existing == null) return Attach(added);
        return Merge(existing, added);
    }

    public void Tick(float delta)
    {
        bool expired = false;
        for (int i = held.Count - 1; i >= 0; i--)
        {
            if (held[i].Tick(delta)) continue;
            held.RemoveAt(i);
            expired = true;
        }
        if (expired) Rebuild();
    }

    public void Clear()
    {
        if (held.Count == 0) return;
        held.Clear();
        Rebuild();
    }

    internal void Drop(Buff buff)
    {
        buff.claims--;
        if (buff.claims > 0) return;
        if (!held.Remove(buff)) return;
        Rebuild();
    }

    private Handle Attach(Buff added)
    {
        added.claims = 1;
        held.Add(added);
        Rebuild();
        return new Handle(() => Drop(added));
    }

    private Handle Merge(Buff existing, Buff added)
    {
        existing.claims++;
        existing.layer = existing.stacking.Merge(existing.layer, added.layer);
        Rebuild();
        return new Handle(() => Drop(existing));
    }

    private Buff? Find(Buff added)
    {
        for (int i = 0; i < held.Count; i++)
        {
            if (held[i].GetType() == added.GetType()) return held[i];
        }
        return null;
    }

    private void Rebuild()
    {
        stats.Reset();
        for (int i = 0; i < held.Count; i++) held[i].Modify(stats, held[i].Layers);
    }
}

