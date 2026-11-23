using System.Collections.ObjectModel;

namespace Spine.Equip;

public sealed class Character
{
    private readonly Dictionary<ISlot, Item?> worn = new();
    private readonly List<KeyValuePair<IStat, float>> basis = new();
    private readonly ReadOnlyDictionary<ISlot, Item?> view;

    public Character(int level, IJob job, IEnumerable<ISlot> slots, IEnumerable<KeyValuePair<IStat, float>> basis)
    {
        Level = level;
        Job = job;
        this.basis.AddRange(basis);
        foreach (var slot in slots) worn.Add(slot, null);
        view = new ReadOnlyDictionary<ISlot, Item?>(worn);
        Stats = new Stats();
        Rebuild();
    }

    public int Level { get; }

    public IJob Job { get; }

    public bool Dead { get; private set; }

    public Stats Stats { get; }

    public IReadOnlyDictionary<ISlot, Item?> Slots => view;

    public bool Equip(Item item)
    {
        if (Dead) return false;
        if (item.Destroyed) return false;
        if (item.Held) return false;
        var wearer = new Wearer(Level, Job);
        foreach (var requirement in item.Requires)
        {
            if (!requirement.Met(wearer)) return false;
        }
        var slot = Find(item.Kind);
        if (slot == null) return false;
        Clear(slot);
        worn[slot] = item;
        item.unbind = () => Remove(item);
        Rebuild();
        return true;
    }

    public bool Unequip(ISlot slot)
    {
        if (!worn.TryGetValue(slot, out var item)) return false;
        if (item == null) return false;
        Clear(slot);
        Rebuild();
        return true;
    }

    public bool Unequip<T>() where T : ISlot
    {
        var slot = FindSlot<T>();
        if (slot == null) return false;
        return Unequip(slot);
    }

    public Item? Worn<T>() where T : ISlot
    {
        var slot = FindSlot<T>();
        if (slot == null) return null;
        return worn[slot];
    }

    public bool Active(Set set) => Count(set) >= set.Pieces;

    public void Die()
    {
        Dead = true;
        Release();
    }

    public void Release()
    {
        foreach (var slot in worn.Keys) Clear(slot);
        Rebuild();
    }

    private void Clear(ISlot slot)
    {
        var item = worn[slot];
        if (item == null) return;
        item.unbind = null;
        worn[slot] = null;
    }

    private void Remove(Item item)
    {
        foreach (var slot in worn.Keys)
        {
            if (!ReferenceEquals(worn[slot], item)) continue;
            worn[slot] = null;
            Rebuild();
            return;
        }
    }

    private ISlot? Find(IItemKind kind)
    {
        ISlot? occupied = null;
        foreach (var slot in worn.Keys)
        {
            if (!slot.Takes(kind)) continue;
            if (worn[slot] == null) return slot;
            if (occupied == null) occupied = slot;
        }
        return occupied;
    }

    private ISlot? FindSlot<T>() where T : ISlot
    {
        foreach (var slot in worn.Keys)
        {
            if (slot is T) return slot;
        }
        return null;
    }

    private int Count(Set set)
    {
        var count = 0;
        foreach (var item in worn.Values)
        {
            if (item?.Set == set) count++;
        }
        return count;
    }

    private void Rebuild()
    {
        Stats.Reset(basis);
        foreach (var item in worn.Values)
        {
            if (item == null) continue;
            Stats.Apply(item.Mods);
        }
        foreach (var set in WornSets())
        {
            if (!Active(set)) continue;
            Stats.Apply(set.Mods);
        }
    }

    private List<Set> WornSets()
    {
        var sets = new List<Set>();
        foreach (var item in worn.Values)
        {
            var set = item?.Set;
            if (set == null) continue;
            if (sets.Contains(set)) continue;
            sets.Add(set);
        }
        return sets;
    }
}
