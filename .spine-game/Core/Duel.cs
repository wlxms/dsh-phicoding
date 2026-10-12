namespace Spine;

public sealed class Duel(Thing left, Thing right, Clash clash, Report report)
{
    private readonly Check check = new(clash.Dice);

    public Thing? Run()
    {
        var attacker = left;
        var defender = right;
        for (var round = 0; round < clash.Rounds; round++)
        {
            Strike(attacker, defender);
            if (Down(defender)) return attacker;
            (attacker, defender) = (defender, attacker);
        }
        report.Write("未分胜负，双方各自罢手");
        return null;
    }

    private bool Down(Thing one) => one.Value(clash.Health).Now <= 0;

    private void Strike(Thing attacker, Thing defender)
    {
        var trial = check.Against(clash.Attack.Of(attacker), clash.Need + clash.Guard.Of(defender));
        if (!trial.Passed)
        {
            report.Write($"{attacker.Name}出手未中（{trial.Drawn} 加 {trial.Bonus} 不敌 {trial.Need}）");
            return;
        }
        var harm = clash.Harm.Roll();
        defender.Value(clash.Health).Origin -= harm;
        report.Write($"{attacker.Name}击中{defender.Name}，{defender.Name}的{clash.Health}减 {harm}");
    }
}
