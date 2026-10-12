using Effects;

namespace Check;

internal static class Verify
{
    private const float Tolerance = 0.001f;

    private static int total;
    private static int failed;

    public static int Total => total;

    public static int Failed => failed;

    public static void That(string name, bool ok, string detail)
    {
        total++;
        if (!ok) failed++;
        Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {name,-46}  {detail}");
    }

    public static void Exact(string name, int expected, int actual) =>
        That(name, expected == actual, $"expected {expected}, got {actual}");

    public static void Near(string name, float expected, float actual) =>
        That(name, Math.Abs(expected - actual) < Tolerance, $"expected {expected}, got {actual:0.####}");

    public static void Same(string name, string expected, string actual) =>
        That(name, expected == actual, $"{expected} vs {actual}");
}
