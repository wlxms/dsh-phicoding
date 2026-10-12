using Effects;

namespace Check;

internal sealed class Extend : Stacking
{
    private readonly float max;

    public Extend(float max) => this.max = max;

    public override Layer Merge(Layer held, Layer added) =>
        new(held.Count, Math.Min(held.Remaining + added.Remaining, max));
}
