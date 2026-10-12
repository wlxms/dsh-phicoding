using System.Text.Json;
using Spine.Equip;

namespace Check;

internal static class Program
{
    private static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.WriteLine("usage: Spine.Equip.Check <equipment.json> <extension.json>");
            return 2;
        }
        Console.WriteLine("Spine.Equip behaviour check");
        Harness.Note("equipment data: " + args[0]);
        Harness.Note("extension data: " + args[1]);

        Diagnostics(args[0]);
        Accumulation(args[0]);
        Occupied(args[0]);
        Gated(args[0]);
        Sets(args[0]);
        Cleanup(args[0]);
        Destroyed(args[0]);
        Unload(args[0]);
        Extension(args[1]);
        Registration();
        OneWearer(args[0]);

        return Harness.Report();
    }

    private static World Load(string path) => new Loader(Catalogue.Default()).Load(path);

    private static bool Empty(Character character)
    {
        foreach (var pair in character.Slots)
        {
            if (pair.Value != null) return false;
        }
        return true;
    }

    private static void Diagnostics(string path)
    {
        Harness.Section("1. data kinds resolve through the catalogue; bad rows are named and dropped");
        var world = Load(path);
        foreach (var note in world.Diagnostics) Harness.Note(note);
        Harness.Check("exactly 9 diagnostics", world.Diagnostics.Count == 9);
        Harness.Check("unregistered kind: warning naming item and kind",
            world.Diagnostics.Contains("warning: item ghost-blade uses unregistered kind halberd"));
        Harness.Check("duplicate id: error naming the id",
            world.Diagnostics.Contains("error: duplicate item id steel-sword"));
        Harness.Check("dangling set id: error naming item and set",
            world.Diagnostics.Contains("error: item orphan-ring references unknown set mithril"));
        Harness.Check("unregistered requirement: warning naming item and key",
            world.Diagnostics.Contains("warning: item cursed-ring requires unregistered soul_bound"));
        Harness.Check("non numeric mod: error naming item and field",
            world.Diagnostics.Contains("error: item broken-ring: add is not a number"));
        Harness.Check("duplicate set id: error naming the set",
            world.Diagnostics.Contains("error: duplicate set id iron"));
        Harness.Check("set that is not a name: error naming the item",
            world.Diagnostics.Contains("error: item odd-ring has a set that is not a name"));
        Harness.Check("unregistered stat in mods: warning naming item and stat",
            world.Diagnostics.Contains("warning: item lucky-charm mods unregistered stat luck"));
        Harness.Check("unregistered stat in basis: warning naming character and stat",
            world.Diagnostics.Contains("warning: character ghost basis has unregistered stat luck"));

        Harness.Check("dropped rows produce no item at all",
            !world.HasItem("ghost-blade") && !world.HasItem("orphan-ring") && !world.HasItem("cursed-ring")
            && !world.HasItem("broken-ring") && !world.HasItem("odd-ring") && !world.HasItem("lucky-charm"));
        Harness.Throws<KeyNotFoundException>("looking up a dropped item throws", () => world.Item("ghost-blade"));
        Harness.Check("the duplicate set row did not replace the first", world.Item("iron-sword").Set!.Pieces == 3);
        Harness.Check("a character with an unregistered basis stat does not exist", !world.HasCharacter("ghost"));
        Harness.Near("first of two duplicate ids survives", 12f, world.Item("steel-sword").Mods[0].Add);
        Harness.Check("both characters loaded", world.HasCharacter("hero") && world.HasCharacter("mage"));
        Harness.Check("hero has three slots", world.Character("hero").Slots.Count == 3);
        Harness.Check("hero starts empty", Empty(world.Character("hero")));
        Harness.Throws<FileNotFoundException>("an unreadable data file throws", () => Load(Path.Combine(Path.GetDirectoryName(path)!, "no-such-file.json")));
        Harness.Throws<JsonException>("broken json throws instead of reporting a diagnostic", () => new Loader(Catalogue.Default()).LoadText("{ items: "));

        var wrongContainer = new Loader(Catalogue.Default()).LoadText("{\"items\":{}}");
        Harness.Check("a wrong container shape is reported, not thrown",
            wrongContainer.Diagnostics.Contains("error: items must be an array"));
        var wrongMods = new Loader(Catalogue.Default()).LoadText("{\"items\":[{\"id\":\"x\",\"kind\":\"sword\",\"mods\":5}]}");
        Harness.Check("a wrong mods shape names the item", wrongMods.Diagnostics.Contains("error: item x: mods must be an array"));
        var unknownJob = new Loader(Catalogue.Default()).LoadText("{\"items\":[{\"id\":\"x\",\"kind\":\"sword\",\"requires\":[{\"class\":\"paladin\"}]}]}");
        Harness.Check("a requirement value naming an unknown job warns and drops the row",
            unknownJob.Diagnostics.Count == 1 && unknownJob.Diagnostics[0].Contains("x requires class") && unknownJob.Diagnostics[0].Contains("paladin"));
    }

    private static void Accumulation(string path)
    {
        Harness.Section("2. additive and multiplicative contributions, order independent");
        var world = Load(path);
        var hero = world.Character("hero");
        Harness.Near("hero base attack", 10f, hero.Stats.Get<Attack>());
        Harness.Near("hero base defense", 5f, hero.Stats.Get<Defense>());
        var sword = world.Item("steel-sword");
        Harness.Check("steel-sword equips", hero.Equip(sword));
        Harness.Near("attack after +12", 22f, hero.Stats.Get<Attack>());
        Harness.Near("additive mod lands in Flat", 22f, hero.Stats.Pool<Attack>().Flat);
        Harness.Near("no ratio yet", 1f, hero.Stats.Pool<Attack>().Ratio);

        var mage = world.Character("mage");
        Harness.Check("level 9 mage wears a level_min 9 ring", mage.Equip(world.Item("grand-ring")));
        Harness.Near("attack after x1.1", 6.6f, mage.Stats.Get<Attack>());
        Harness.Near("multiplicative mod lands in Ratio", 1.1f, mage.Stats.Pool<Attack>().Ratio);

        var forward = Load(path);
        var first = forward.Character("hero");
        Harness.Check("order A equips sword, plate, ring",
            first.Equip(forward.Item("iron-sword")) && first.Equip(forward.Item("iron-plate")) && first.Equip(forward.Item("iron-ring")));
        var backward = Load(path);
        var second = backward.Character("hero");
        Harness.Check("order B equips ring, plate, sword",
            second.Equip(backward.Item("iron-ring")) && second.Equip(backward.Item("iron-plate")) && second.Equip(backward.Item("iron-sword")));
        Harness.Near("attack does not depend on equip order", first.Stats.Get<Attack>(), second.Stats.Get<Attack>());
        Harness.Near("defense does not depend on equip order", first.Stats.Get<Defense>(), second.Stats.Get<Defense>());
        Harness.Near("both orders reach the set bonus", 21.6f, first.Stats.Get<Attack>());
    }

    private static void Occupied(string path)
    {
        Harness.Section("3. equipping into an occupied slot revokes the old item completely");
        var world = Load(path);
        var hero = world.Character("hero");
        var steel = world.Item("steel-sword");
        var iron = world.Item("iron-sword");
        Harness.Check("steel-sword equips", hero.Equip(steel));
        Harness.Near("attack with steel-sword", 22f, hero.Stats.Get<Attack>());
        Harness.Check("iron-sword takes the occupied weapon slot", hero.Equip(iron));
        Harness.Check("weapon slot holds iron-sword", ReferenceEquals(hero.Worn<Weapon>(), iron));
        Harness.Check("steel-sword is out", !steel.Held);
        Harness.Near("attack is iron-sword only", 18f, hero.Stats.Get<Attack>());
        Harness.Check("displaced item can be equipped again", hero.Equip(steel));
        Harness.Check("weapon slot holds steel-sword again", ReferenceEquals(hero.Worn<Weapon>(), steel));
        Harness.Near("attack is steel-sword only", 22f, hero.Stats.Get<Attack>());
        iron.Destroy();
        Harness.Check("the displaced item stayed out", !iron.Held);
        Harness.Near("the destroyed displaced item adds nothing", 22f, hero.Stats.Get<Attack>());
    }

    private static void Gated(string path)
    {
        Harness.Section("4. requirements gate equipping");
        var world = Load(path);
        var hero = world.Character("hero");
        var mage = world.Character("mage");
        Harness.Check("level 7 cannot wear level_min 9", !hero.Equip(world.Item("grand-ring")));
        Harness.Check("trinket slot stays empty", hero.Worn<Trinket>() == null);
        Harness.Near("refused equip leaves attack alone", 10f, hero.Stats.Get<Attack>());
        Harness.Check("warrior cannot wear mage-only armor", !hero.Equip(world.Item("mage-robe")));
        Harness.Check("armor slot stays empty", hero.Worn<Armor>() == null);
        Harness.Check("mage wears the mage-only armor", mage.Equip(world.Item("mage-robe")));
        Harness.Near("mage defense after +3", 7f, mage.Stats.Get<Defense>());
        var blade = world.Item("iron-sword");
        Harness.Check("hero wears a blade first", hero.Equip(blade));
        Harness.Check("refusal does not disturb another slot", !hero.Equip(world.Item("grand-ring")) && ReferenceEquals(hero.Worn<Weapon>(), blade));
    }

    private static void Sets(string path)
    {
        Harness.Section("5. set effect activates at the threshold and dies with any single piece");
        var world = Load(path);
        var hero = world.Character("hero");
        var iron = world.Item("iron-sword").Set!;
        Harness.Check("one piece: inactive", hero.Equip(world.Item("iron-sword")) && !hero.Active(iron));
        Harness.Near("attack with one piece", 18f, hero.Stats.Get<Attack>());
        Harness.Near("defense with one piece", 5f, hero.Stats.Get<Defense>());
        Harness.Check("two pieces: still inactive", hero.Equip(world.Item("iron-plate")) && !hero.Active(iron));
        Harness.Near("defense with two pieces", 15f, hero.Stats.Get<Defense>());
        Harness.Check("three pieces: active", hero.Equip(world.Item("iron-ring")) && hero.Active(iron));
        Harness.Near("attack with the set ratio", 21.6f, hero.Stats.Get<Attack>());
        Harness.Near("defense with the set bonus applied once", 25f, hero.Stats.Get<Defense>());
        Harness.Check("replacing one piece deactivates immediately", hero.Equip(world.Item("steel-sword")) && !hero.Active(iron));
        Harness.Near("attack without the set", 22f, hero.Stats.Get<Attack>());
        Harness.Near("defense without the set (plate and ring only)", 17f, hero.Stats.Get<Defense>());
        Harness.Check("set returns when the piece returns", hero.Equip(world.Item("iron-sword")) && hero.Active(iron));
        Harness.Near("attack with the set again", 21.6f, hero.Stats.Get<Attack>());
        Harness.Check("unequipping one piece deactivates immediately", hero.Unequip<Trinket>() && !hero.Active(iron));
        Harness.Near("attack back to pieces only", 18f, hero.Stats.Get<Attack>());
        Harness.Near("defense back to pieces only", 15f, hero.Stats.Get<Defense>());
        Harness.Check("trinket slot empty", hero.Worn<Trinket>() == null);
    }

    private static void Cleanup(string path)
    {
        Harness.Section("6. the four cleanup paths in all 24 orders");
        var orders = new[] { 0, 1, 2, 3 };
        var seen = 0;
        var wrong = 0;
        EachOrder(orders, 0, order =>
        {
            seen++;
            var world = Load(path);
            var hero = world.Character("hero");
            var iron = world.Item("iron-sword").Set!;
            var dressed = hero.Equip(world.Item("iron-sword")) && hero.Equip(world.Item("iron-plate")) && hero.Equip(world.Item("iron-ring"));
            if (!dressed) wrong++;
            foreach (var step in order)
            {
                Act(step, hero, world);
                if (!Empty(hero)) wrong++;
            }
            if (!Empty(hero)) wrong++;
            if (Math.Abs(hero.Stats.Get<Attack>() - 10f) > 0.001f) wrong++;
            if (Math.Abs(hero.Stats.Get<Defense>() - 5f) > 0.001f) wrong++;
            if (hero.Active(iron)) wrong++;
        });
        Harness.Check("24 orders were exercised", seen == 24);
        Harness.Check("every order left no equipment, base stats and an inactive set", wrong == 0);
        Harness.Note("orders: unequip / destroy / death / scene unload, applied in every sequence");
        var dead = Load(path);
        var corpse = dead.Character("hero");
        corpse.Die();
        Harness.Check("death blocks further equipping", !corpse.Equip(dead.Item("steel-sword")));
        Harness.Check("the dead character stayed empty", Empty(corpse));
    }

    private static void Act(int step, Character character, World world)
    {
        if (step == 0) UnequipAll(character);
        if (step == 1) DestroyAll(character);
        if (step == 2) character.Die();
        if (step == 3) world.Scene.Unload();
    }

    private static void UnequipAll(Character character)
    {
        foreach (var slot in character.Slots.Keys) character.Unequip(slot);
    }

    private static void DestroyAll(Character character)
    {
        foreach (var pair in character.Slots) pair.Value?.Destroy();
    }

    private static void EachOrder(int[] values, int at, Action<int[]> visit)
    {
        if (at == values.Length)
        {
            visit(values);
            return;
        }
        for (var i = at; i < values.Length; i++)
        {
            Swap(values, at, i);
            EachOrder(values, at + 1, visit);
            Swap(values, at, i);
        }
    }

    private static void Swap(int[] values, int left, int right)
    {
        var hold = values[left];
        values[left] = values[right];
        values[right] = hold;
    }

    private static void Destroyed(string path)
    {
        Harness.Section("7. destroying equipment revokes it, and destroying is idempotent");
        var world = Load(path);
        var hero = world.Character("hero");
        var blade = world.Item("steel-sword");
        Harness.Check("steel-sword equips", hero.Equip(blade));
        Harness.Near("attack before destroy", 22f, hero.Stats.Get<Attack>());
        blade.Destroy();
        Harness.Check("destroyed flag is set", blade.Destroyed);
        Harness.Check("weapon slot is empty", hero.Worn<Weapon>() == null);
        Harness.Near("attack after destroy", 10f, hero.Stats.Get<Attack>());
        blade.Destroy();
        Harness.Near("second destroy changes nothing", 10f, hero.Stats.Get<Attack>());
        Harness.Check("destroyed item cannot be equipped again", !hero.Equip(blade) && hero.Worn<Weapon>() == null);
        Harness.Check("armor equips", hero.Equip(world.Item("iron-plate")));
        Harness.Near("defense with armor", 15f, hero.Stats.Get<Defense>());
        world.Item("iron-ring").Destroy();
        Harness.Near("destroying an unworn item changes nothing", 15f, hero.Stats.Get<Defense>());
    }

    private static void Unload(string path)
    {
        Harness.Section("8. scene unload clears every character of the scene");
        var world = Load(path);
        var hero = world.Character("hero");
        var mage = world.Character("mage");
        Harness.Check("hero dressed", hero.Equip(world.Item("iron-sword")) && hero.Equip(world.Item("iron-plate")));
        Harness.Check("mage dressed", mage.Equip(world.Item("mage-robe")));
        Harness.Check("scene knows two characters", world.Scene.Characters.Count == 2);
        world.Scene.Unload();
        Harness.Check("hero left empty", Empty(hero));
        Harness.Check("mage left empty", Empty(mage));
        Harness.Near("hero attack back to base", 10f, hero.Stats.Get<Attack>());
        Harness.Near("mage defense back to base", 4f, mage.Stats.Get<Defense>());
        Harness.Check("unload releases, it does not kill", !hero.Dead && !mage.Dead);
        Harness.Check("an unloaded character can be dressed again", hero.Equip(world.Item("iron-sword")));
        Harness.Near("and its contribution comes back", 18f, hero.Stats.Get<Attack>());
    }

    private static void Extension(string path)
    {
        Harness.Section("9. new slot kinds, item kind, stat and requirement, with zero core change");
        var plain = new Loader(Catalogue.Default()).Load(path);
        Harness.Check("without the extension the new data is only warned about", plain.Diagnostics.Count == 4);
        Harness.Check("unknown kind", plain.Diagnostics.Contains("warning: item oak-wand uses unregistered kind wand"));
        Harness.Check("unknown requirement", plain.Diagnostics.Contains("warning: item novice-blade requires unregistered level_max"));
        Harness.Check("unknown slot", plain.Diagnostics.Contains("warning: character scout uses unregistered slot offhand"));
        Harness.Check("unknown slot reusing an existing kind family", plain.Diagnostics.Contains("warning: character keeper uses unregistered slot relic"));
        Harness.Check("neither character exists without its slot kind", !plain.HasCharacter("scout") && !plain.HasCharacter("keeper"));
        Harness.Check("a row with a known kind still loads", plain.HasItem("plain-blade"));
        Harness.Check("a row with an unknown requirement is dropped", !plain.HasItem("novice-blade"));

        var catalogue = Catalogue.Default();
        catalogue.Slots.Add("offhand", new OffHand());
        catalogue.Slots.Add("relic", new Relic());
        catalogue.Kinds.Add("wand", new Wand());
        catalogue.Stats.Add("focus", new Focus());
        catalogue.Requires.Add("level_max", element => new MaxLevel(element.GetInt32()));
        var world = new Loader(catalogue).Load(path);
        Harness.Check("with the extension there are no diagnostics", world.Diagnostics.Count == 0);
        var scout = world.Character("scout");
        Harness.Check("scout has weapon and the new offhand slot", scout.Slots.Count == 2);
        Harness.Check("new kind equips into the new slot", scout.Equip(world.Item("oak-wand")));
        Harness.Near("new stat accumulates", 7f, scout.Stats.Get<Focus>());
        Harness.Check("plain blade equips", scout.Equip(world.Item("plain-blade")));
        Harness.Near("attack with plain blade", 8f, scout.Stats.Get<Attack>());
        Harness.Check("new requirement admits the novice blade", scout.Equip(world.Item("novice-blade")));
        Harness.Check("novice blade replaced the plain blade", ReferenceEquals(scout.Worn<Weapon>(), world.Item("novice-blade")));
        Harness.Near("attack with novice blade", 6f, scout.Stats.Get<Attack>());
        Harness.Check("new requirement rejects level 7", !new MaxLevel(5).Met(new Wearer(7, new Mage())));
        Harness.Check("new requirement accepts level 5", new MaxLevel(5).Met(new Wearer(5, new Mage())));
        Harness.Check("an item whose slot the character lacks is refused", !scout.Equip(world.Item("scout-vest")));
        Harness.Check("the weapon slot kept working meanwhile", ReferenceEquals(scout.Worn<Weapon>(), world.Item("novice-blade")));

        var keeper = world.Character("keeper");
        Harness.Check("keeper has a trinket and a slot reusing the trinket kind family", keeper.Slots.Count == 2);
        Harness.Check("first ring fills the free trinket slot", keeper.Equip(world.Item("jade-ring")));
        Harness.Check("second ring fills the other free slot", keeper.Equip(world.Item("bone-ring")));
        Harness.Check("the two rings did not displace each other",
            ReferenceEquals(keeper.Worn<Trinket>(), world.Item("jade-ring")) && ReferenceEquals(keeper.Worn<Relic>(), world.Item("bone-ring")));
        Harness.Near("both rings contribute", 7f, keeper.Stats.Get<Defense>());
    }

    private static void Registration()
    {
        Harness.Section("10. duplicate registration fails loudly instead of overwriting");
        var catalogue = Catalogue.Default();
        Harness.Throws<InvalidOperationException>("re-registering a name throws", () => catalogue.Slots.Add("weapon", new Weapon()));
        Harness.Throws<KeyNotFoundException>("looking up an unknown name throws", () => catalogue.Kinds.Get("halberd"));
        Harness.Check("the original registration is intact",
            catalogue.Slots.Get("weapon").Takes(catalogue.Kinds.Get("sword")));
    }

    private static void OneWearer(string path)
    {
        Harness.Section("11. one item instance is worn by at most one character, and state is per character");
        var world = Load(path);
        var hero = world.Character("hero");
        var mage = world.Character("mage");
        var blade = world.Item("steel-sword");
        Harness.Check("hero wears the blade", hero.Equip(blade));
        Harness.Check("mage cannot wear the same instance", !mage.Equip(blade));
        Harness.Check("mage stays empty", Empty(mage));
        Harness.Near("hero keeps the contribution", 22f, hero.Stats.Get<Attack>());
        Harness.Check("mage wears its own trinket", mage.Equip(world.Item("grand-ring")));
        Harness.Check("hero wears another trinket of the same kind", hero.Equip(world.Item("iron-ring")));
        Harness.Near("hero defense sees only its own ring", 7f, hero.Stats.Get<Defense>());
        Harness.Near("mage defense sees only its own ring", 4f, mage.Stats.Get<Defense>());
        Harness.Near("mage attack sees only its own ring", 6.6f, mage.Stats.Get<Attack>());
        Harness.Near("hero attack is untouched by the mage ring", 22f, hero.Stats.Get<Attack>());
    }
}
