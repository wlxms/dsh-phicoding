namespace Check;

internal static class Harness
{
    private static int total;
    private static int failures;

    public static void Section(string title)
    {
        Console.WriteLine();
        Console.WriteLine("== " + title);
    }

    public static void Note(string message) => Console.WriteLine("     " + message);

    public static void Check(string what, bool ok)
    {
        total++;
        var mark = "FAIL";
        if (ok) mark = "PASS";
        if (!ok) failures++;
        Console.WriteLine("  " + mark + "  " + what);
    }

    public static void Near(string what, float expected, float actual)
    {
        Check(what + " [" + expected + "] (actual " + actual + ")", Math.Abs(expected - actual) < 0.001f);
    }

    public static void Throws<T>(string what, Action action) where T : Exception
    {
        var thrown = false;
        try
        {
            action();
        }
        catch (Exception error)
        {
            thrown = error is T;
        }
        Check(what, thrown);
    }

    public static int Report()
    {
        Console.WriteLine();
        Console.WriteLine("checks run: " + total + ", failed: " + failures);
        if (failures == 0)
        {
            Console.WriteLine("RESULT: ALL PASS");
            return 0;
        }
        Console.WriteLine("RESULT: FAILED");
        return 1;
    }
}
