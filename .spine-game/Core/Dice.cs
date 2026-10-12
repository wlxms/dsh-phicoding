namespace Spine;

public abstract class Dice
{
    public abstract int Roll();
}

public sealed class Die(int faces, Random random) : Dice
{
    public override int Roll() => random.Next(1, faces + 1);
}

public sealed class Many(int count, int faces, Random random) : Dice
{
    public override int Roll()
    {
        var sum = 0;
        for (var i = 0; i < count; i++) sum += random.Next(1, faces + 1);
        return sum;
    }
}

public sealed class Fixed(params int[] rolls) : Dice
{
    private int at = -1;

    public override int Roll()
    {
        at = (at + 1) % rolls.Length;
        return rolls[at];
    }
}
