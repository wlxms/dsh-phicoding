namespace Spine.Equip;

public sealed class Armor : ISlot
{
    public bool Takes(IItemKind kind) => kind is IArmorKind;
}
