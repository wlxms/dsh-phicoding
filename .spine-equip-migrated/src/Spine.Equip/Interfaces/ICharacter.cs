using Spine.Equip.Config;

namespace Spine.Equip;

public interface ICharacter
{
    int Level { get; }

    IJob Job { get; }

    bool Dead { get; }

    IStats Stats { get; }

    IReadOnlyDictionary<ISlot, IItem?> Slots { get; }

    bool Equip(IItem item);

    bool Unequip(ISlot slot);

    bool Unequip<T>()
        where T : ISlot;

    IItem? Worn<T>()
        where T : ISlot;

    bool Active(SetDto set);

    void Die();

    void Release();
}
