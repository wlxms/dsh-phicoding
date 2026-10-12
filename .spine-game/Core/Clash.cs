namespace Spine;

public sealed record Clash(
    Dice Dice,
    Adjust Attack,
    Adjust Guard,
    Dice Harm,
    string Health,
    int Need = 10,
    int Rounds = 100);
