namespace Spine;

public sealed class Check(Dice dice)
{
    public Trial Against(int bonus, int need) => new(dice.Roll(), bonus, need);
}

public readonly record struct Trial(int Drawn, int Bonus, int Need)
{
    public bool Passed => Drawn + Bonus >= Need;
}
