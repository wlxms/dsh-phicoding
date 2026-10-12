namespace Effects;

public sealed class Stats
{
    private sealed class Accumulator
    {
        public float Basis;
        public float Flat;
        public float Ratio = 1f;

        public float Final => (Basis + Flat) * Ratio;

        public void Reset()
        {
            Flat = 0f;
            Ratio = 1f;
        }
    }

    private readonly Dictionary<Type, Accumulator> accumulators = new();

    public void Basis<T>(float value) => For<T>().Basis = value;

    // dsh - 2026-10-10 : 这里对用户面公开写入，因为 Buff 子类在框架外定义，无法走 internal 通道
    public void Flat<T>(float value) => For<T>().Flat += value;

    public void Ratio<T>(float value) => For<T>().Ratio *= value;

    public float Value<T>() => For<T>().Final;

    internal void Reset()
    {
        foreach (var accumulator in accumulators.Values) accumulator.Reset();
    }

    private Accumulator For<T>()
    {
        if (accumulators.TryGetValue(typeof(T), out var found)) return found;
        found = new Accumulator();
        accumulators[typeof(T)] = found;
        return found;
    }
}
