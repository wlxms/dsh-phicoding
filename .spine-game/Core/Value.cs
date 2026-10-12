namespace Spine;

public sealed class Value(int origin)
{
    private readonly List<int> adds = [];
    private readonly List<int> times = [];

    public int Origin { get; set; } = origin;

    public int Now
    {
        get
        {
            var sum = Origin;
            foreach (var one in adds) sum += one;
            var scale = 1;
            var divide = 1;
            foreach (var one in times)
            {
                scale *= one;
                divide *= 100;
            }
            return sum * scale / divide;
        }
    }

    public void Add(int amount) => adds.Add(amount);

    public void Scale(int percent) => times.Add(percent);

    public void Clear()
    {
        adds.Clear();
        times.Clear();
    }
}
