namespace Spine.Data;

using Spine;

// [Administrator 2026-10-28 waive=0750 why=plumbing] 工厂：它必须认识全部具现，这是职责不是泄漏
public sealed class Forge
{
    private readonly Dictionary<string, Item> kinds = [];

    public Forge Add(Item item)
    {
        kinds.Add(item.Name, item);
        return this;
    }

    public Equip Wearable(string name) => Found(name) as Equip ?? throw new KeyNotFoundException($"「{name}」不是装备");

    public Consumable Usable(string name) => Found(name) as Consumable ?? throw new KeyNotFoundException($"「{name}」不是消耗品");

    private Item Found(string name) => kinds.TryGetValue(name, out var found)
        ? found
        : throw new KeyNotFoundException($"未登记的种类：{name}");

    public static Forge Standard() => new Forge()
        .Add(new Sword("木棍", 1))
        .Add(new Sword("青铜剑", 3))
        .Add(new Sword("精钢剑", 6))
        .Add(new Sword("铁剑", 5, null, new AtLeast("等级", 5)))
        .Add(new Blade("铁刀", 2))
        .Add(new HeavyBlade("重剑", 4, 14))
        .Add(new Robe("布衣", 1))
        .Add(new Robe("皮甲", 2, Suits.Iron))
        .Add(new Robe("铁甲", 3, Suits.Iron))
        .Add(new Robe("玄铁甲", 4, null, new Brand("少林")))
        .Add(new Robe("云纹袍", 1, Suits.Cloud))
        .Add(new Crown("道冠", 2))
        .Add(new Crown("铁盔", 1, Suits.Iron))
        .Add(new Crown("云纹冠", 2, Suits.Cloud))
        .Add(new Boots("快靴", 2))
        .Add(new Boots("铁靴", 1, Suits.Iron))
        .Add(new Boots("云纹靴", 2, Suits.Cloud))
        .Add(new Salve("金创药", 8))
        .Add(new Salve("大还丹", 20))
        .Add(new Antidote("解毒散", 3, "中毒"));
}
