namespace Spine.Equip;

public sealed class Trinket : ISlot
{
    public bool Takes(IItemKind kind) => kind is ITrinketKind;
}
