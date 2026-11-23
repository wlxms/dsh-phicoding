namespace Spine.Equip;

public sealed class Weapon : ISlot
{
    // [Administrator 2026-11-18 waive=0750 why=plumbing] 槽位要按自己的 kind 族做类型判断
    public bool Takes(IItemKind kind) => kind is WeaponKind;
}
