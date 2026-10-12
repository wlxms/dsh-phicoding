namespace Spine.Data;

using Spine;

public static class Suits
{
    public static readonly Suit Iron = new("铁甲套", 3, new Plus("根骨", 2));

    public static readonly Suit Cloud = new("云纹套", 3, new Times("身法", 120));
}
