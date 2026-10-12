namespace Spine;

public abstract class Report
{
    public abstract void Write(string line);
}

public sealed class Screen : Report
{
    public override void Write(string line) => Console.WriteLine(line);
}

public sealed class Mute : Report
{
    public override void Write(string line) { }
}

public sealed class Notes : Report
{
    private readonly List<string> lines = [];

    public IReadOnlyList<string> Lines => lines;

    public override void Write(string line) => lines.Add(line);
}
