namespace Spine.Spec;

public sealed class Spec
{
    private static readonly string[] Structural = ["A9a", "A9b", "A10", "A11", "A12"];

    private readonly List<string> claims = [];
    private int bad;

    public void That(string claim, bool truth)
    {
        claims.Add(claim);
        if (truth) return;
        bad++;
        Console.WriteLine($"  不成立  {claim}");
    }

    public int Summary(string? planPath)
    {
        var executed = Executed();
        Console.WriteLine($"断言 {claims.Count} 条，不成立 {bad} 条");
        Console.WriteLine($"执行锚点：{string.Join(" ", executed)}");
        if (planPath is null)
        {
            Console.WriteLine("  找不到 PLAN.md，锚点覆盖无法核对");
            return bad + 1;
        }
        var missing = Declared(planPath).Where(one => !executed.Contains(one) && !Structural.Contains(one)).ToList();
        foreach (var one in missing) Console.WriteLine($"  锚点在规划里、却没有任何断言被执行：{one}");
        return bad + missing.Count;
    }

    private List<string> Executed()
    {
        var found = new List<string>();
        foreach (var claim in claims)
        {
            var hit = Anchor(claim);
            if (hit.Length == 0) continue;
            if (found.Contains(hit)) continue;
            found.Add(hit);
        }
        found.Sort(StringComparer.Ordinal);
        return found;
    }

    private static List<string> Declared(string planPath)
    {
        var found = new List<string>();
        foreach (var line in File.ReadAllLines(planPath))
        {
            if (!line.StartsWith("| A", StringComparison.Ordinal)) continue;
            var cell = line.Split('|');
            if (cell.Length < 3) continue;
            var one = cell[1].Trim();
            if (Anchor(one) != one) continue;
            if (found.Contains(one)) continue;
            found.Add(one);
        }
        found.Sort(StringComparer.Ordinal);
        return found;
    }

    private static string Anchor(string claim)
    {
        if (claim.Length < 2 || claim[0] != 'A') return "";
        if (!char.IsDigit(claim[1])) return "";
        var at = 1;
        while (at < claim.Length && char.IsDigit(claim[at])) at++;
        if (at < claim.Length && char.IsLower(claim[at])) at++;
        return claim[..at];
    }
}
