using Spine.Equip.Config;

namespace Spine.Equip;

public interface IItem
{
    IItemKind Kind { get; }

    IReadOnlyList<Mod> Mods { get; }

    IReadOnlyList<IRequirement> Requires { get; }

    SetDto? Set { get; }

    bool Destroyed { get; }

    bool Held { get; }

    void Bind(Action onDestroy);

    void Unbind();

    void Destroy();
}
