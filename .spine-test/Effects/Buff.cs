namespace Effects;

public abstract class Buff
{
    internal Layer layer;
    internal int claims;
    internal readonly Stacking stacking;

    protected Buff(float duration, Stacking stacking)
    {
        ArgumentNullException.ThrowIfNull(stacking);
        layer = new Layer(1, duration);
        this.stacking = stacking;
    }

    public int Layers => layer.Count;

    public float Remaining => layer.Remaining;

    public abstract void Modify(Stats stats, int layers);

    internal bool Tick(float delta)
    {
        layer = new Layer(layer.Count, layer.Remaining - delta);
        return layer.Remaining > 0f;
    }
}
