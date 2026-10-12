namespace Spine;

public abstract class Consumable(string name) : Item(name)
{
    public abstract void Use(Sheet sheet);
}
