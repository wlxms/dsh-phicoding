namespace Spine;

public sealed class Thing(string name) : Sheet
{
    private readonly Dictionary<Slot, Equip> slots = [];
    private readonly List<Consumable> bag = [];

    public string Name { get; } = name;

    public IReadOnlyCollection<Equip> Worn => slots.Values;

    public IReadOnlyList<Consumable> Bag => bag;

    public Equip? At(Slot slot) => slots.GetValueOrDefault(slot);

    public bool Wear(Equip item)
    {
        if (!item.Need(this)) return false;
        slots[item.Slot] = item;
        Settle();
        return true;
    }

    public bool Unwear(Slot slot)
    {
        if (!slots.Remove(slot)) return false;
        Settle();
        return true;
    }

    public void Hold(Consumable item) => bag.Add(item);

    public bool Use(Consumable item)
    {
        if (!bag.Remove(item)) return false;
        item.Use(this);
        return true;
    }

    private void Settle()
    {
        Clear();
        var ordered = WornOrdered();
        foreach (var (_, item) in ordered) item.Affect(this);
        foreach (var suit in WornSuits(ordered)) if (Reach(ordered, suit) >= suit.Need) suit.Affect(this);
    }

    private List<KeyValuePair<Slot, Equip>> WornOrdered()
    {
        var ordered = new List<KeyValuePair<Slot, Equip>>(slots);
        ordered.Sort((left, right) => string.CompareOrdinal(left.Key.Name, right.Key.Name));
        return ordered;
    }

    private List<Suit> WornSuits(List<KeyValuePair<Slot, Equip>> ordered)
    {
        var found = new List<Suit>();
        foreach (var (_, item) in ordered)
        {
            if (item.Suit is null) continue;
            if (found.Contains(item.Suit)) continue;
            found.Add(item.Suit);
        }
        return found;
    }

    private int Reach(List<KeyValuePair<Slot, Equip>> ordered, Suit suit)
    {
        var count = 0;
        foreach (var (_, item) in ordered) if (item.Suit == suit) count++;
        return count;
    }
}
