namespace Spine.Equip;

public sealed class World
{
    private readonly Dictionary<string, Item> items = new();
    private readonly Dictionary<string, Character> characters = new();
    private readonly List<string> diagnostics = new();

    public Scene Scene { get; } = new();

    public IReadOnlyList<string> Diagnostics => diagnostics;

    public Item Item(string id)
    {
        if (items.TryGetValue(id, out var item)) return item;
        throw new KeyNotFoundException("no such item: " + id);
    }

    public Character Character(string id)
    {
        if (characters.TryGetValue(id, out var character)) return character;
        throw new KeyNotFoundException("no such character: " + id);
    }

    public bool HasItem(string id) => items.ContainsKey(id);

    public bool HasCharacter(string id) => characters.ContainsKey(id);

    internal void Note(string message) => diagnostics.Add(message);

    internal void Add(string id, Item item) => items.Add(id, item);

    internal void Add(string id, Character character)
    {
        characters.Add(id, character);
        Scene.Add(character);
    }
}
