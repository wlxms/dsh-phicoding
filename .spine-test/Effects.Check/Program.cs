using Check;

if (args.Length == 0)
{
    Console.WriteLine("usage: Effects.Check <root-directory>");
    return 1;
}

Console.WriteLine("== buff system check ==");
Lifecycle.Run();
Console.WriteLine();
Structure.Run(args[0]);
Console.WriteLine();
Console.WriteLine($"{(Verify.Failed == 0 ? "OK" : "FAILED")}  {Verify.Total - Verify.Failed}/{Verify.Total} assertions passed");
return Verify.Failed == 0 ? 0 : 1;
