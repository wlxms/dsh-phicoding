namespace Spine.Equip;

public sealed class Scene : IScene
{
    private readonly List<ICharacter> characters = new();

    public IReadOnlyList<ICharacter> Characters => characters;

    public void Add(ICharacter character) => characters.Add(character);

    public void Unload()
    {
        foreach (var character in characters) character.Release();
    }
}
