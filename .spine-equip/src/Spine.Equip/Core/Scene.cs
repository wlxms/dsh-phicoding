namespace Spine.Equip;

public sealed class Scene
{
    private readonly List<Character> characters = new();

    public IReadOnlyList<Character> Characters => characters;

    public void Add(Character character) => characters.Add(character);

    public void Unload()
    {
        foreach (var character in characters) character.Release();
    }
}
