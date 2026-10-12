namespace Spine.Data;

using Spine;

public static class Clashes
{
    public static readonly Clash Standard = new(
        new Die(20, new Random(20261011)),
        new Score("身法"),
        new Score("身法"),
        new Many(1, 6, new Random(20261012)),
        "气血",
        Need: 10,
        Rounds: 60);
}
