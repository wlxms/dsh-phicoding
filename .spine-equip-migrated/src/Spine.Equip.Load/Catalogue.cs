using System.Text.Json;

namespace Spine.Equip;

public sealed class Catalogue
{
    // [Administrator 2026-11-18 waive=0750 why=plumbing] 装载边界：它必须同时认识接口与全部具体实现
    public Registry<ISlot> Slots { get; } = new();

    public Registry<IItemKind> Kinds { get; } = new();

    public Registry<IStat> Stats { get; } = new();

    public Registry<IJob> Jobs { get; } = new();

    public Registry<Func<JsonElement, IRequirement?>> Requires { get; } = new();

    public static Catalogue Default()
    {
        var catalogue = new Catalogue();

        catalogue.Slots.Add("weapon", new Weapon());
        catalogue.Slots.Add("armor", new Armor());
        catalogue.Slots.Add("trinket", new Trinket());
        catalogue.Kinds.Add("sword", new Sword());
        catalogue.Kinds.Add("plate", new Plate());
        catalogue.Kinds.Add("robe", new Robe());
        catalogue.Kinds.Add("ring", new Ring());
        catalogue.Stats.Add("attack", new Attack());
        catalogue.Stats.Add("defense", new Defense());
        catalogue.Jobs.Add("warrior", new Warrior());
        catalogue.Jobs.Add("mage", new Mage());
        catalogue.Requires.Add("level_min", element => new MinLevel(element.GetInt32()));
        catalogue.Requires.Add("class", element =>
        {
            if (element.ValueKind != JsonValueKind.String) return null;
            var name = element.GetString()!;
            if (!catalogue.Jobs.Has(name)) return null;
            return new ClassOnly(catalogue.Jobs.Get(name));
        });
        return catalogue;
    }
}
