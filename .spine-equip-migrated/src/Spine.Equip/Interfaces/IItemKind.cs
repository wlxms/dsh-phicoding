namespace Spine.Equip;

public interface IItemKind
{
}

/// <summary>武器类物品的种类契约；槽位只依赖这个接口，不依赖具体种类。</summary>
public interface IWeaponKind : IItemKind
{
}

/// <summary>护甲类物品的种类契约。</summary>
public interface IArmorKind : IItemKind
{
}

/// <summary>饰品类的物品的种类契约。</summary>
public interface ITrinketKind : IItemKind
{
}
