namespace Effects;

public sealed class Handle
{
    private Action? release;

    internal Handle(Action release) => this.release = release;

    public void Release()
    {
        var once = release;
        release = null;
        once?.Invoke();
    }
}

