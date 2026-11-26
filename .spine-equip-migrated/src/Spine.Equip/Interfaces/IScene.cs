namespace Spine.Equip;

public interface IScene
{
    IReadOnlyList<ICharacter> Characters { get; }

    void Add(ICharacter character);

    void Unload();
}
