namespace Effects;

public sealed class Character
{
    public Stats Stats { get; } = new();

    public Buffs Buffs { get; }

    public Character() => Buffs = new Buffs(Stats);

    public void Tick(float delta) => Buffs.Tick(delta);

    public void Die() => Buffs.Clear();
}
