namespace Spine.Data;

using Spine;

public sealed class Salve(string name, int heal) : Consumable(name)
{
    public override void Use(Sheet sheet) => sheet.Value("气血").Origin += heal;
}

public sealed class Antidote(string name, int heal, string cure) : Consumable(name)
{
    public override void Use(Sheet sheet)
    {
        sheet.Value("气血").Origin += heal;
        sheet.Untag(cure);
    }
}
