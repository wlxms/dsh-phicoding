namespace Effects;

public sealed class Handle
{
    private readonly Buffs owner;
    private readonly Buff buff;
    private bool released;

    internal Handle(Buffs owner, Buff buff)
    {
        this.owner = owner;
        this.buff = buff;
    }

    public void Release()
    {
        if (released) return;
        released = true;
        owner.Drop(buff);
    }
}
