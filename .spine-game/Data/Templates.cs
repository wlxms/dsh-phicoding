namespace Spine.Data;

using Spine;

public sealed class Template(string name)
{
    public string Name { get; } = name;

    public Dictionary<string, int> Traits { get; init; } = [];

    public List<string> Marks { get; init; } = [];

    public List<string> Worn { get; init; } = [];

    public List<string> Bag { get; init; } = [];

    public Thing Spawn(Forge forge)
    {
        var thing = new Thing(Name);
        foreach (var (trait, origin) in Traits) thing.Open(trait, origin);
        foreach (var mark in Marks) thing.Tag(mark);
        foreach (var name in Worn) if (!thing.Wear(forge.Wearable(name))) throw new InvalidOperationException($"「{name}」穿不上 {Name}");
        foreach (var name in Bag) thing.Hold(forge.Usable(name));
        return thing;
    }
}

public static class Templates
{
    public static readonly Template Hero = new("少侠")
    {
        Traits = new() { ["根骨"] = 10, ["身法"] = 12, ["悟性"] = 11, ["等级"] = 3, ["气血"] = 30 },
        Marks = ["游侠"],
        Worn = ["青铜剑", "布衣", "道冠", "快靴"],
        Bag = ["金创药", "金创药"],
    };

    public static readonly Template Bandit = new("山贼")
    {
        Traits = new() { ["根骨"] = 8, ["身法"] = 10, ["悟性"] = 5, ["等级"] = 1, ["气血"] = 20 },
        Marks = ["贼寇"],
        Worn = ["木棍", "皮甲"],
        Bag = ["金创药"],
    };

    public static readonly Template Herbalist = new("药铺掌柜")
    {
        Traits = new() { ["根骨"] = 6, ["身法"] = 7, ["悟性"] = 14, ["等级"] = 2, ["气血"] = 14 },
        Marks = ["药王谷", "中毒"],
        Worn = ["道冠"],
        Bag = ["金创药", "解毒散"],
    };
}
