namespace Spine.Spec;

using Spine;
using Spine.Data;

// [Administrator 2026-10-28 waive=0750 why=plumbing] 用例构造器：它必须把具体的 Thing 摆出来
public static class CasesSpec
{
    public static int RunAll(string? planPath)
    {
        Console.WriteLine("=== 核心行为检查 ===");
        var spec = new Spec();
        Aggregate(spec);
        Wearing(spec);
        Guarded(spec);
        Suited(spec);
        Drugs(spec);
        Judging(spec);
        Fighting(spec);
        Shared(spec);
        return spec.Summary(planPath);
    }

    private static void Aggregate(Spec spec)
    {
        var one = new Sheet();
        one.Open("试", 10);
        one.Value("试").Add(5);
        one.Value("试").Scale(150);
        spec.That("A1 先加后乘：(10+5)×150% = 22", one.Value("试").Now == 22);

        var two = new Sheet();
        two.Open("试", 10);
        two.Value("试").Scale(55);
        two.Value("试").Scale(150);
        spec.That("A1b 乘算乘积先算完：10×55%×150% = 8", two.Value("试").Now == 8);

        var three = new Sheet();
        three.Open("试", 10);
        three.Value("试").Scale(150);
        three.Value("试").Scale(55);
        spec.That("A1b 乘算与施加顺序无关", three.Value("试").Now == two.Value("试").Now);
    }

    private static void Wearing(Spec spec)
    {
        var wearer = new Thing("试者");
        wearer.Open("根骨", 10);
        wearer.Open("等级", 1);

        var low = new GearSpec("甲件", Slots.Hand, [new Plus("根骨", 3)]);
        var high = new GearSpec("乙件", Slots.Hand, [new Plus("根骨", 5)]);
        var gate = new GearSpec("丙件", Slots.Hand, [new Plus("根骨", 7)], null, new AtLeast("等级", 9));

        spec.That("A2 穿上 +3 后为 13", wearer.Wear(low) && wearer.Value("根骨").Now == 13);
        spec.That("A2 换装后旧件完全消失：+5 得 15 而非 +8 得 18", wearer.Wear(high) && wearer.Value("根骨").Now == 15);
        spec.That("A3 等级需求不足时穿不上", wearer.Wear(gate) == false);
        spec.That("A3 穿不上时旧件仍在槽里、数值不变", wearer.At(Slots.Hand) == high && wearer.Value("根骨").Now == 15);
        spec.That("A5 同一件连穿两次不叠加", wearer.Wear(high) && wearer.Value("根骨").Now == 15);

        var blade = new HeavyBlade("重剑", 4, 14);
        var boost = new GearSpec("垫根骨", Slots.Head, [new Plus("根骨", 3)]);
        var oneWay = new Thing("甲");
        oneWay.Open("根骨", 12);
        oneWay.Open("身法", 10);
        oneWay.Wear(blade);
        oneWay.Wear(boost);
        var twoWay = new Thing("乙");
        twoWay.Open("根骨", 12);
        twoWay.Open("身法", 10);
        twoWay.Wear(boost);
        twoWay.Wear(blade);
        spec.That("A2b 条件效果读 Origin：基础根骨 12 不足 14 ⇒ 重剑拖慢身法，得 8（读 Now 会得 10）", oneWay.Value("身法").Now == 8);
        spec.That("A2b 加算照常叠加：根骨 12+3+4 = 19", oneWay.Value("根骨").Now == 19);
        spec.That(
            "A2b 同一穿戴集合、穿戴顺序不同，结果必须相同",
            oneWay.Value("身法").Now == twoWay.Value("身法").Now && oneWay.Value("根骨").Now == twoWay.Value("根骨").Now);
    }

    private static void Guarded(Spec spec)
    {
        var blank = new Thing("试者");
        spec.That("A13 读未登记的属性直接抛 KeyNotFoundException", Throws(() => blank.Value("不存在")));
        blank.Open("根骨", 7);
        spec.That("A13 登记之后读到其值且不抛", blank.Value("根骨").Now == 7);

        var forge = Forge.Standard();
        spec.That("A19 工厂重复登记同名种类直接抛", Throws(() => forge.Add(new Sword("木棍", 9))));
        spec.That("A19 未登记的种类查找期抛", Throws(() => forge.Wearable("子虚乌有")));
    }

    private static void Suited(Spec spec)
    {
        var wearer = new Thing("试者");
        wearer.Open("身法", 10);
        wearer.Open("悟性", 10);

        var half = new GearSpec("加半", Slots.Head, [new Times("身法", 150)]);
        spec.That("A16 装备的乘算真的生效：10×150% = 15", wearer.Wear(half) && wearer.Value("身法").Now == 15);

        var add = new GearSpec("加五", Slots.Hand, [new Plus("身法", 5)]);
        spec.That("A16b 加算与乘算同时来自装备：(10+5)×150% = 22", wearer.Wear(add) && wearer.Value("身法").Now == 22);

        var probe = new Thing("试者");
        probe.Open("身法", 10);
        var small = new GearSpec("半", Slots.Head, [new Times("身法", 55)]);
        var big = new GearSpec("倍", Slots.Body, [new Times("身法", 150)]);
        probe.Wear(small);
        probe.Wear(big);
        var first = probe.Value("身法").Now;
        probe.Unwear(Slots.Head);
        probe.Unwear(Slots.Body);
        probe.Wear(big);
        probe.Wear(small);
        spec.That("A1b 聚合与穿戴历史无关", first == probe.Value("身法").Now && first == 8);

        var suit = new Suit("试套", 3, new Plus("悟性", 100));
        var piece = new[]
        {
            new GearSpec("套甲", Slots.Body, [], suit),
            new GearSpec("套冠", Slots.Head, [], suit),
            new GearSpec("套靴", Slots.Feet, [], suit),
        };
        var bearer = new Thing("试者");
        bearer.Open("悟性", 10);
        bearer.Wear(piece[0]);
        bearer.Wear(piece[1]);
        spec.That("A4 两件不达阈值，套装无效", bearer.Value("悟性").Now == 10);
        bearer.Wear(piece[2]);
        spec.That("A4 三件达阈值，套装生效", bearer.Value("悟性").Now == 110);
        bearer.Unwear(Slots.Feet);
        spec.That("A4 掉到阈值下，套装效果完全消失", bearer.Value("悟性").Now == 10);

        var monk = new Thing("试者");
        monk.Open("根骨", 10);
        var robe = new GearSpec("僧袍", Slots.Body, [new Plus("根骨", 4)], null, new Brand("少林"));
        spec.That("A17 无门派标记穿不上", monk.Wear(robe) == false);
        monk.Tag("少林");
        spec.That("A17 有门派标记穿得上", monk.Wear(robe) && monk.Value("根骨").Now == 14);
    }

    private static void Drugs(Spec spec)
    {
        var user = new Thing("试者");
        user.Open("气血", 10);
        user.Open("根骨", 10);
        var pill = new PillSpec("试药", "气血", 8);

        user.Hold(pill);
        spec.That("A15 用后离开背包", user.Use(pill) && user.Bag.Count == 0);
        spec.That("A14 效果立即生效：10+8 = 18", user.Value("气血").Now == 18);

        user.Wear(new GearSpec("换件", Slots.Hand, [new Plus("根骨", 1)]));
        spec.That("A14 道具效果落在持久层，换装重建修正层后仍是 18", user.Value("气血").Now == 18);

        user.Tag("护体");
        user.Unwear(Slots.Hand);
        spec.That("A14b 标记不受重建修正层影响", user.Tagged("护体"));
    }

    private static void Judging(Spec spec)
    {
        var check = new Check(new Fixed(12));
        spec.That("A6 12+3 == 15 判定成功（含等号）", check.Against(bonus: 3, need: 15).Passed);
        spec.That("A6 12+2 < 15 判定失败", check.Against(bonus: 2, need: 15).Passed == false);
    }

    private static void Fighting(Spec spec)
    {
        var left = Fighter("甲", 20);
        var right = Fighter("乙", 20);
        var clash = new Clash(new Fixed(20), new Flat(0), new Flat(0), new Fixed(5), "气血", Need: 10, Rounds: 60);

        var winner = new Duel(left, right, clash, new Mute()).Run();
        spec.That("A7a 定骰下由 left 胜出", winner == left);
        spec.That("A7a 败者气血已空", right.Value("气血").Now <= 0);
        spec.That("A7a 胜者仍有气血", left.Value("气血").Now > 0);

        var notes = new Notes();
        var short3 = new Clash(new Fixed(20), new Flat(0), new Flat(0), new Fixed(1), "气血", Need: 10, Rounds: 3);
        var one = Fighter("甲", 100);
        var other = Fighter("乙", 100);
        var draw = new Duel(one, other, short3, notes).Run();
        spec.That("A18 三回合交手 + 一行收场 = 4 行战报", notes.Lines.Count == 4);
        spec.That(
            "A18 双方交替出手：甲乙甲",
            notes.Lines.Count == 4 && notes.Lines[0].StartsWith("甲") && notes.Lines[1].StartsWith("乙") && notes.Lines[2].StartsWith("甲"));
        spec.That("A18 双方都被削过气血", one.Value("气血").Now < 100 && other.Value("气血").Now < 100);
        spec.That("A7b 超时返回 null 且双方未倒", draw is null && one.Value("气血").Now > 0 && other.Value("气血").Now > 0);
    }

    private static void Shared(Spec spec)
    {
        var forge = Forge.Standard();
        var monster = Templates.Bandit.Spawn(forge);
        var npc = Templates.Herbalist.Spawn(forge);

        spec.That(
            "A8 怪物/NPC/角色是同一个 CLR 类型",
            monster.GetType() == typeof(Thing) && npc.GetType() == typeof(Thing) && Templates.Hero.Spawn(forge).GetType() == typeof(Thing));

        spec.That("A8 怪物也能换装备：山贼身法 10 换精钢剑 +6 = 16", monster.Wear(forge.Wearable("精钢剑")) && monster.Value("身法").Now == 16);

        var pill = forge.Usable("金创药");
        npc.Hold(pill);
        spec.That("A8 NPC 也能用道具：气血 14 吃药 +8 = 22", npc.Use(pill) && npc.Value("气血").Now == 22);

        var hero = Templates.Hero.Spawn(forge);
        var heavy = new Clash(new Fixed(20), new Flat(0), new Flat(0), new Fixed(50), "气血", Need: 10, Rounds: 10);
        var beater = new Duel(Templates.Bandit.Spawn(forge), hero, heavy, new Mute()).Run();
        spec.That("A8 角色也能被打倒", beater is not null && hero.Value("气血").Now <= 0);
    }

    private static Thing Fighter(string name, int hp)
    {
        var one = new Thing(name);
        one.Open("气血", hp);
        return one;
    }

    private static bool Throws(Action act)
    {
        try
        {
            act();
            return false;
        }
        catch
        {
            return true;
        }
    }
}
