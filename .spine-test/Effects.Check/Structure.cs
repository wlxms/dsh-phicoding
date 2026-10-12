using System.Text.RegularExpressions;

namespace Check;

internal static class Structure
{
    private static readonly string[] Ignorant = { "Skill", "Equipment", "Aura" };

    public static void Run(string root)
    {
        Console.WriteLine("-- structural red lines --");
        var framework = Directory.GetFiles(Path.Combine(root, "Effects"), "*.cs");
        var sources = Ignorant.Select(name => Path.Combine(root, "Effects.Check", name + ".cs")).ToArray();

        Rule(framework, @"\belse\b", "No Else in the trunk");
        Rule(framework, @"\bswitch\b", "No Switch in the trunk");
        Rule(framework, @"\benum\b", "types replace enums in the trunk");
        Rule(framework, @"\b(Manager|Service|Helper|Util|Impl)\b", "no filler-word names");
        Rule(framework, @"\b(Skill|Equipment|Aura|Rage|Blade|Haste|Charge|Attack|MoveSpeed)\b", "trunk names no implementation");
        Traceable(framework);
        Ignorance(sources);
    }

    private static void Rule(string[] files, string pattern, string name)
    {
        var regex = new Regex(pattern);
        var hits = new List<string>();
        foreach (var file in files)
        {
            var lines = File.ReadAllLines(file);
            for (int i = 0; i < lines.Length; i++)
            {
                if (regex.IsMatch(lines[i])) hits.Add($"{Path.GetFileName(file)}:{i + 1}");
            }
        }
        Verify.That(name, hits.Count == 0, hits.Count == 0 ? $"{files.Length} files clean" : string.Join(' ', hits));
    }

    private static void Traceable(string[] files)
    {
        var regex = new Regex(@"^//\s*\S+\s+-\s+\d{4}-\d{2}-\d{2}\s*:");
        var seen = 0;
        var hits = new List<string>();
        foreach (var file in files)
        {
            var lines = File.ReadAllLines(file);
            for (int i = 0; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (!line.Contains("//", StringComparison.Ordinal)) continue;
                seen++;
                if (!regex.IsMatch(line)) hits.Add($"{Path.GetFileName(file)}:{i + 1}");
            }
        }
        Verify.That("every comment is traceable", hits.Count == 0, $"{seen} comment(s), {hits.Count} violating {string.Join(' ', hits)}");
    }

    private static void Ignorance(string[] sources)
    {
        foreach (var file in sources)
        {
            var own = Path.GetFileNameWithoutExtension(file);
            var text = File.ReadAllText(file);
            var leaked = Ignorant.Where(other => other != own && text.Contains(other, StringComparison.Ordinal)).ToArray();
            Verify.That($"source {own} names no other source", leaked.Length == 0, leaked.Length == 0 ? "isolated" : string.Join(',', leaked));
        }
    }
}
