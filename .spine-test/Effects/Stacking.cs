namespace Effects;

public abstract class Stacking
{
    public abstract Layer Merge(Layer held, Layer added);

    public sealed class Add : Stacking
    {
        private readonly int max;

        public Add(int max) => this.max = max;

        public override Layer Merge(Layer held, Layer added) =>
            new(Math.Min(held.Count + added.Count, max), Math.Max(held.Remaining, added.Remaining));
    }

    public sealed class Refresh : Stacking
    {
        public override Layer Merge(Layer held, Layer added) => new(held.Count, added.Remaining);
    }
}
