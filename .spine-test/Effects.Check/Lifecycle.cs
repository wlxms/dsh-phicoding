using Effects;

namespace Check;

internal static class Lifecycle
{
    public static void Run()
    {
        Modification();
        Stacking();
        Sources();
        Cleanup();
    }

    private static void Modification()
    {
        Console.WriteLine("-- stat modification (flat / ratio) --");
        var character = Fight();
        Verify.Near("attack basis", 100f, character.Stats.Value<Attack>());

        var skill = new Skill(character.Buffs);
        skill.Cast(() => new Rage());
        Verify.Near("flat +5 on basis 100", 105f, character.Stats.Value<Attack>());

        var equipment = new Equipment(character.Buffs);
        equipment.Wear(() => new Blade());
        Verify.Near("(100 + 5) * 1.2", 126f, character.Stats.Value<Attack>());

        var mirrored = Fight();
        new Equipment(mirrored.Buffs).Wear(() => new Blade());
        new Skill(mirrored.Buffs).Cast(() => new Rage());
        Verify.Near("ratio first equals flat first", character.Stats.Value<Attack>(), mirrored.Stats.Value<Attack>());
    }

    private static void Stacking()
    {
        Console.WriteLine("-- stacking rules --");
        var character = Fight();
        var skill = new Skill(character.Buffs);

        skill.Cast(() => new Rage());
        skill.Cast(() => new Rage());
        skill.Cast(() => new Rage());
        Verify.Exact("Rage stacks to 3 layers", 3, Of<Rage>(character.Buffs)!.Layers);
        Verify.Near("3 layers of +5 on basis 100", 115f, character.Stats.Value<Attack>());

        for (int i = 0; i < 4; i++) skill.Cast(() => new Rage());
        Verify.Exact("Rage caps at Stacking.Add(5)", 5, Of<Rage>(character.Buffs)!.Layers);
        Verify.Near("cap holds attack at 125", 125f, character.Stats.Value<Attack>());

        var equipment = new Equipment(character.Buffs);
        equipment.Wear(() => new Haste());
        character.Tick(3f);
        Verify.Near("Haste burned 3 of 5 seconds", 2f, Of<Haste>(character.Buffs)!.Remaining);
        equipment.Wear(() => new Haste());
        Verify.Near("Refresh resets the clock", 5f, Of<Haste>(character.Buffs)!.Remaining);
        Verify.Exact("Refresh keeps a single layer", 1, Of<Haste>(character.Buffs)!.Layers);

        equipment.Wear(() => new Charge());
        character.Tick(1f);
        Verify.Near("Charge burned 1 of 3 seconds", 2f, Of<Charge>(character.Buffs)!.Remaining);
        equipment.Wear(() => new Charge());
        Verify.Near("Extend piles time up to its cap", 5f, Of<Charge>(character.Buffs)!.Remaining);
        Verify.Exact("Extend keeps a single layer", 1, Of<Charge>(character.Buffs)!.Layers);
    }

    private static void Sources()
    {
        Console.WriteLine("-- three sources that do not know each other --");
        var character = Fight();
        var skill = new Skill(character.Buffs);
        var equipment = new Equipment(character.Buffs);
        var aura = new Aura();

        skill.Cast(() => new Rage());
        equipment.Wear(() => new Blade());
        aura.Enter(character.Buffs, () => new Haste());

        Verify.Exact("three sources hold three buffs", 3, character.Buffs.Held.Count);
        Verify.Near("Rage and Blade compose", 126f, character.Stats.Value<Attack>());
        Verify.Near("Aura raises move speed", 6.5f, character.Stats.Value<MoveSpeed>());

        skill.End();
        Verify.Exact("skill end drops only its own buff", 2, character.Buffs.Held.Count);
        Verify.Near("attack without Rage", 120f, character.Stats.Value<Attack>());
        Verify.Near("move speed untouched by skill end", 6.5f, character.Stats.Value<MoveSpeed>());

        var shared = Fight();
        var sharedSkill = new Skill(shared.Buffs);
        var sharedEquipment = new Equipment(shared.Buffs);
        sharedSkill.Cast(() => new Rage());
        sharedEquipment.Wear(() => new Rage());
        Verify.Exact("two sources share one instance", 1, shared.Buffs.Held.Count);
        Verify.Exact("shared layers add up", 2, Of<Rage>(shared.Buffs)!.Layers);
        Verify.Near("shared attack", 110f, shared.Stats.Value<Attack>());

        sharedSkill.End();
        Verify.Near("one claimant left keeps the buff", 110f, shared.Stats.Value<Attack>());
        sharedEquipment.TakeOff();
        Verify.Exact("last claimant clears it", 0, shared.Buffs.Held.Count);
        Verify.Near("attack back to basis", 100f, shared.Stats.Value<Attack>());
    }

    private static void Cleanup()
    {
        Console.WriteLine("-- cleanup on death and scene unload --");
        var first = Scene();
        first.character.Die();
        Verify.Exact("death alone clears every buff", 0, first.character.Buffs.Held.Count);
        Verify.Near("death alone restores attack", 100f, first.character.Stats.Value<Attack>());
        Verify.Near("death alone restores move speed", 5f, first.character.Stats.Value<MoveSpeed>());
        first.skill.End();
        first.equipment.TakeOff();
        first.aura.Unload();
        Verify.Exact("death first: late releases change nothing", 0, first.character.Buffs.Held.Count);
        Verify.Near("death first: attack stays restored", 100f, first.character.Stats.Value<Attack>());
        Verify.Near("death first: move speed stays restored", 5f, first.character.Stats.Value<MoveSpeed>());

        var second = Scene();
        second.aura.Unload();
        Verify.Exact("unload first: aura buff gone", 2, second.character.Buffs.Held.Count);
        Verify.Near("unload first: other sources untouched", 126f, second.character.Stats.Value<Attack>());
        Verify.Near("unload first: move speed restored", 5f, second.character.Stats.Value<MoveSpeed>());
        second.equipment.TakeOff();
        second.character.Die();
        second.skill.End();
        Verify.Exact("unload first: no buffs left", 0, second.character.Buffs.Held.Count);
        Verify.Same("both orders land on the same state", State(first.character), State(second.character));

        var one = Fight();
        var other = Fight();
        var scene = new Aura();
        scene.Enter(one.Buffs, () => new Haste());
        scene.Enter(other.Buffs, () => new Haste());
        scene.Leave(other.Buffs);
        Verify.Exact("aura drops the one that left", 0, other.Buffs.Held.Count);
        Verify.Exact("aura keeps the one in range", 1, one.Buffs.Held.Count);
        scene.Unload();
        Verify.Exact("aura unload clears the rest", 0, one.Buffs.Held.Count);

        var expiring = Fight();
        var expiringSkill = new Skill(expiring.Buffs);
        expiringSkill.Cast(() => new Rage());
        expiring.Tick(9.9f);
        Verify.Exact("still held before the clock runs out", 1, expiring.Buffs.Held.Count);
        expiring.Tick(0.2f);
        Verify.Exact("removed on the frame it expires", 0, expiring.Buffs.Held.Count);
        Verify.Near("stat restored on expiry", 100f, expiring.Stats.Value<Attack>());
        expiringSkill.End();

        var idempotent = Fight();
        var handle = idempotent.Buffs.Apply(() => new Blade());
        handle.Release();
        handle.Release();
        idempotent.Die();
        handle.Release();
        Verify.Exact("release after release and death is a no-op", 0, idempotent.Buffs.Held.Count);
        Verify.Near("attack after repeated release", 100f, idempotent.Stats.Value<Attack>());
    }

    private static Character Fight()
    {
        var character = new Character();
        character.Stats.Basis<Attack>(100f);
        character.Stats.Basis<MoveSpeed>(5f);
        return character;
    }

    private static (Character character, Skill skill, Equipment equipment, Aura aura) Scene()
    {
        var character = Fight();
        var skill = new Skill(character.Buffs);
        var equipment = new Equipment(character.Buffs);
        var aura = new Aura();
        skill.Cast(() => new Rage());
        equipment.Wear(() => new Blade());
        aura.Enter(character.Buffs, () => new Haste());
        return (character, skill, equipment, aura);
    }

    private static T? Of<T>(Buffs carrier) where T : Buff => carrier.Held.OfType<T>().FirstOrDefault();

    private static string State(Character character) =>
        $"{character.Buffs.Held.Count} buffs, attack {character.Stats.Value<Attack>():0.####}, speed {character.Stats.Value<MoveSpeed>():0.####}";
}
