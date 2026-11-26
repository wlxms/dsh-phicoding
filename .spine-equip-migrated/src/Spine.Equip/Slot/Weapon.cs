namespace Spine.Equip;

public sealed class Weapon : ISlot
{
    public bool Takes(IItemKind kind) => kind is IWeaponKind;
}
