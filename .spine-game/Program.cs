using System.Text;
using Spine;
using Spine.Data;
using Spine.Spec;

Console.OutputEncoding = Encoding.UTF8;

if (args.Length > 0 && args[0] == "--check") return CasesSpec.RunAll(Plan());

string? Plan()
{
    var here = new DirectoryInfo(AppContext.BaseDirectory);
    for (var up = 0; up < 8 && here is not null; up++)
    {
        var candidate = Path.Combine(here.FullName, "PLAN.md");
        if (File.Exists(candidate)) return candidate;
        here = here.Parent;
    }
    return null;
}

var forge = Forge.Standard();
var hero = Templates.Hero.Spawn(forge);
var bandit = Templates.Bandit.Spawn(forge);
var keeper = Templates.Herbalist.Spawn(forge);

Console.WriteLine("【三张数据行造出的对象】同一个类型，同一套体系");
Console.WriteLine($"  {hero.Name,-8} 根骨 {hero.Value("根骨").Now,3}  身法 {hero.Value("身法").Now,3}  悟性 {hero.Value("悟性").Now,3}  气血 {hero.Value("气血").Now,3}  等级 {hero.Value("等级").Now}");
Console.WriteLine($"  {bandit.Name,-8} 根骨 {bandit.Value("根骨").Now,3}  身法 {bandit.Value("身法").Now,3}  悟性 {bandit.Value("悟性").Now,3}  气血 {bandit.Value("气血").Now,3}  等级 {bandit.Value("等级").Now}");
Console.WriteLine($"  {keeper.Name,-8} 根骨 {keeper.Value("根骨").Now,3}  身法 {keeper.Value("身法").Now,3}  悟性 {keeper.Value("悟性").Now,3}  气血 {keeper.Value("气血").Now,3}  等级 {keeper.Value("等级").Now}");
Console.WriteLine($"  三者 GetType() 全是 {hero.GetType().Name}");

Console.WriteLine();
Console.WriteLine("【换装：旧件的效果必须完全消失】");
Console.WriteLine($"  初始（青铜剑 +3 身法）        身法 {hero.Value("身法").Now}");
hero.Wear(forge.Wearable("精钢剑"));
Console.WriteLine($"  换上精钢剑（+6 身法）          身法 {hero.Value("身法").Now}");
hero.Wear(forge.Wearable("青铜剑"));
Console.WriteLine($"  换回青铜剑（+3 身法）          身法 {hero.Value("身法").Now}   ← 不是 12+6+3+2");

Console.WriteLine();
Console.WriteLine("【使用需求：等级门槛与门派门槛】");
Console.WriteLine($"  少侠等级 {hero.Value("等级").Now}，手部「{hero.At(Slots.Hand)!.Name}」");
var leveled = hero.Wear(forge.Wearable("铁剑"));
Console.WriteLine($"  试穿铁剑（需等级 5）           {(leveled ? "穿上" : "被挡下")}");
Console.WriteLine($"  手部仍是「{hero.At(Slots.Hand)!.Name}」，身法 {hero.Value("身法").Now}   ← 挡下时不摘旧件");
hero.Tag("少林");
var sect = hero.Wear(forge.Wearable("玄铁甲"));
Console.WriteLine($"  受戒入少林后试穿玄铁甲         {(sect ? "穿上" : "被挡下")}，根骨 {hero.Value("根骨").Now}");

Console.WriteLine();
Console.WriteLine("【套装：凑够件数才触发，掉下阈值立刻消失】");
var monk = Templates.Hero.Spawn(forge);
monk.Wear(forge.Wearable("云纹袍"));
Console.WriteLine($"  云纹套 1 件                   身法 {monk.Value("身法").Now}");
monk.Wear(forge.Wearable("云纹冠"));
Console.WriteLine($"  云纹套 2 件                   身法 {monk.Value("身法").Now}");
monk.Wear(forge.Wearable("云纹靴"));
Console.WriteLine($"  云纹套 3 件（身法 ×120%）     身法 {monk.Value("身法").Now}   ← 套装生效");
monk.Unwear(Slots.Feet);
Console.WriteLine($"  脱掉云纹靴                    身法 {monk.Value("身法").Now}   ← 完全消失");

Console.WriteLine();
Console.WriteLine("【道具：用了即消耗，效果落在持久层】");
Console.WriteLine($"  {keeper.Name} 中毒标记 {keeper.Tagged("中毒")}，气血 {keeper.Value("气血").Now}，背包 {keeper.Bag.Count} 件");
keeper.Use(forge.Usable("解毒散"));
Console.WriteLine($"  服下解毒散后                  中毒标记 {keeper.Tagged("中毒")}，气血 {keeper.Value("气血").Now}，背包 {keeper.Bag.Count} 件");

Console.WriteLine();
Console.WriteLine("【检定：骰子 + 修正 对抗 难度】");
var check = new Check(new Die(20, new Random(7)));
var trial = check.Against(bonus: 5, need: 18);
Console.WriteLine($"  掷出 {trial.Drawn}，修正 {trial.Bonus}，难度 {trial.Need} → {(trial.Passed ? "成" : "败")}");
var edge = new Check(new Fixed(15));
Console.WriteLine($"  掷出 15，修正 0，难度 15 → {(edge.Against(0, 15).Passed ? "成" : "败")}   ← 含等号");

Console.WriteLine();
Console.WriteLine("【战斗：轮流检定，打中扣血，血空了倒下】");
Console.WriteLine($"  {hero.Name} 气血 {hero.Value("气血").Now} 对阵 {bandit.Name} 气血 {bandit.Value("气血").Now}");
var winner = new Duel(hero, bandit, Clashes.Standard, new Screen()).Run();
Console.WriteLine(winner is null ? "  未分胜负" : $"  {winner.Name} 胜出");

return 0;
