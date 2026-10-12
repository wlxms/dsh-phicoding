namespace Effects;

public readonly struct Layer
{
    public readonly int Count;
    public readonly float Remaining;

    public Layer(int count, float remaining)
    {
        Count = count;
        Remaining = remaining;
    }
}
