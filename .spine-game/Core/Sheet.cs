namespace Spine;

public class Sheet
{
    private readonly Dictionary<string, Value> values = [];
    private readonly HashSet<string> marks = [];

    public Value Value(string trait) => values.TryGetValue(trait, out var found)
        ? found
        : throw new KeyNotFoundException($"未登记的属性：{trait}");

    public void Open(string trait, int origin) => values.Add(trait, new Value(origin));

    public void Tag(string mark) => marks.Add(mark);

    public void Untag(string mark) => marks.Remove(mark);

    public bool Tagged(string mark) => marks.Contains(mark);

    protected void Clear()
    {
        foreach (var one in values.Values) one.Clear();
    }
}
