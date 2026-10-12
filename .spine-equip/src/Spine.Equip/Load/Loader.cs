using System.Text.Json;

namespace Spine.Equip;

public sealed class Loader
{
    private readonly Catalogue catalogue;

    public Loader(Catalogue catalogue) => this.catalogue = catalogue;

    public World Load(string path) => LoadText(File.ReadAllText(path));

    public World LoadText(string json)
    {
        var world = new World();
        var root = JsonDocument.Parse(json).RootElement;
        var sets = ReadSets(root, world);
        ReadItems(root, world, sets);
        ReadCharacters(root, world);
        return world;
    }

    private Dictionary<string, Set> ReadSets(JsonElement root, World world)
    {
        var sets = new Dictionary<string, Set>();
        foreach (var row in Rows(root, "sets", world))
        {
            var id = Text(row, "id");
            if (id == null)
            {
                world.Note("error: set row has no id");
                continue;
            }
            if (sets.ContainsKey(id))
            {
                world.Note("error: duplicate set id " + id);
                continue;
            }
            try
            {
                var pieces = (int)Number(row, "pieces", 0f, "set " + id);
                if (pieces <= 0)
                {
                    world.Note("error: set " + id + " has no valid pieces");
                    continue;
                }
                var mods = ReadMods(row, world, "set " + id);
                if (mods == null) continue;
                sets.Add(id, new Set(pieces, mods));
            }
            catch (Exception error) when (Expected(error))
            {
                world.Note("error: " + error.Message);
            }
        }
        return sets;
    }

    private void ReadItems(JsonElement root, World world, Dictionary<string, Set> sets)
    {
        foreach (var row in Rows(root, "items", world))
        {
            try
            {
                ReadItem(row, world, sets);
            }
            catch (Exception error) when (Expected(error))
            {
                world.Note("error: " + error.Message);
            }
        }
    }

    private void ReadItem(JsonElement row, World world, Dictionary<string, Set> sets)
    {
        var id = Text(row, "id");
        if (id == null)
        {
            world.Note("error: item row has no id");
            return;
        }
        if (world.HasItem(id))
        {
            world.Note("error: duplicate item id " + id);
            return;
        }
        var name = Text(row, "kind");
        if (name == null)
        {
            world.Note("error: item " + id + " has no kind");
            return;
        }
        if (!catalogue.Kinds.Has(name))
        {
            world.Note("warning: item " + id + " uses unregistered kind " + name);
            return;
        }
        var mods = ReadMods(row, world, "item " + id);
        if (mods == null) return;
        var requires = ReadRequires(row, world, "item " + id);
        if (requires == null) return;
        if (!ReadSet(row, world, sets, id, out var set)) return;
        world.Add(id, new Item(catalogue.Kinds.Get(name), mods, requires, set));
    }

    private void ReadCharacters(JsonElement root, World world)
    {
        foreach (var row in Rows(root, "characters", world))
        {
            try
            {
                ReadCharacter(row, world);
            }
            catch (Exception error) when (Expected(error))
            {
                world.Note("error: " + error.Message);
            }
        }
    }

    private void ReadCharacter(JsonElement row, World world)
    {
        var id = Text(row, "id");
        if (id == null)
        {
            world.Note("error: character row has no id");
            return;
        }
        if (world.HasCharacter(id))
        {
            world.Note("error: duplicate character id " + id);
            return;
        }
        var name = Text(row, "job");
        if (name == null)
        {
            world.Note("error: character " + id + " has no job");
            return;
        }
        if (!catalogue.Jobs.Has(name))
        {
            world.Note("warning: character " + id + " uses unregistered job " + name);
            return;
        }
        var level = (int)Number(row, "level", 0f, "character " + id);
        if (level < 1)
        {
            world.Note("error: character " + id + " has no valid level");
            return;
        }
        var slots = ReadSlots(row, world, id);
        if (slots == null) return;
        var basis = ReadBasis(row, world, id);
        if (basis == null) return;
        world.Add(id, new Character(level, catalogue.Jobs.Get(name), slots, basis));
    }

    private List<Slot>? ReadSlots(JsonElement row, World world, string id)
    {
        var slots = new List<Slot>();
        if (!row.TryGetProperty("slots", out var value)) return slots;
        if (value.ValueKind != JsonValueKind.Array)
        {
            world.Note("error: character " + id + " has slots that are not an array");
            return null;
        }
        foreach (var entry in value.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.String)
            {
                world.Note("error: character " + id + " has a slot that is not a name");
                return null;
            }
            var name = entry.GetString()!;
            if (!catalogue.Slots.Has(name))
            {
                world.Note("warning: character " + id + " uses unregistered slot " + name);
                return null;
            }
            var slot = catalogue.Slots.Get(name);
            if (slots.Contains(slot))
            {
                world.Note("error: character " + id + " lists slot " + name + " twice");
                return null;
            }
            slots.Add(slot);
        }
        return slots;
    }

    private List<KeyValuePair<Stat, float>>? ReadBasis(JsonElement row, World world, string id)
    {
        var basis = new List<KeyValuePair<Stat, float>>();
        if (!row.TryGetProperty("basis", out var value)) return basis;
        if (value.ValueKind != JsonValueKind.Object)
        {
            world.Note("error: character " + id + " has a basis that is not an object");
            return null;
        }
        foreach (var property in value.EnumerateObject())
        {
            if (!catalogue.Stats.Has(property.Name))
            {
                world.Note("warning: character " + id + " basis has unregistered stat " + property.Name);
                return null;
            }
            basis.Add(KeyValuePair.Create(catalogue.Stats.Get(property.Name), Value(property.Value, property.Name, "character " + id)));
        }
        return basis;
    }

    private List<Mod>? ReadMods(JsonElement row, World world, string owner)
    {
        var mods = new List<Mod>();
        if (!row.TryGetProperty("mods", out var value)) return mods;
        if (value.ValueKind != JsonValueKind.Array)
        {
            world.Note("error: " + owner + ": mods must be an array");
            return null;
        }
        foreach (var entry in value.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object)
            {
                world.Note("error: " + owner + " has a mod that is not an object");
                return null;
            }
            var name = Text(entry, "stat");
            if (name == null)
            {
                world.Note("error: " + owner + " has a mod without stat");
                return null;
            }
            if (!catalogue.Stats.Has(name))
            {
                world.Note("warning: " + owner + " mods unregistered stat " + name);
                return null;
            }
            mods.Add(new Mod(
                catalogue.Stats.Get(name),
                Number(entry, "add", 0f, owner),
                Number(entry, "mul", 1f, owner)));
        }
        return mods;
    }

    private List<Requirement>? ReadRequires(JsonElement row, World world, string owner)
    {
        var requires = new List<Requirement>();
        if (!row.TryGetProperty("requires", out var value)) return requires;
        if (value.ValueKind != JsonValueKind.Array)
        {
            world.Note("error: " + owner + ": requires must be an array");
            return null;
        }
        foreach (var entry in value.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object)
            {
                world.Note("error: " + owner + " has a requirement that is not an object");
                return null;
            }
            foreach (var property in entry.EnumerateObject())
            {
                if (!catalogue.Requires.Has(property.Name))
                {
                    world.Note("warning: " + owner + " requires unregistered " + property.Name);
                    return null;
                }
                var requirement = catalogue.Requires.Get(property.Name).Invoke(property.Value);
                if (requirement == null)
                {
                    world.Note("warning: " + owner + " requires " + property.Name + " " + property.Value + ", which is not registered");
                    return null;
                }
                requires.Add(requirement);
            }
        }
        return requires;
    }

    private static bool ReadSet(JsonElement row, World world, Dictionary<string, Set> sets, string id, out Set? set)
    {
        set = null;
        if (!row.TryGetProperty("set", out var value)) return true;
        if (value.ValueKind != JsonValueKind.String)
        {
            world.Note("error: item " + id + " has a set that is not a name");
            return false;
        }
        var name = value.GetString()!;
        if (!sets.TryGetValue(name, out var found))
        {
            world.Note("error: item " + id + " references unknown set " + name);
            return false;
        }
        set = found;
        return true;
    }

    private static List<JsonElement> Rows(JsonElement root, string name, World world)
    {
        var rows = new List<JsonElement>();
        if (!root.TryGetProperty(name, out var value)) return rows;
        if (value.ValueKind != JsonValueKind.Array)
        {
            world.Note("error: " + name + " must be an array");
            return rows;
        }
        foreach (var row in value.EnumerateArray()) rows.Add(row);
        return rows;
    }

    private static string? Text(JsonElement row, string name)
    {
        if (!row.TryGetProperty(name, out var value)) return null;
        if (value.ValueKind != JsonValueKind.String) return null;
        return value.GetString();
    }

    private static float Number(JsonElement row, string name, float fallback, string owner)
    {
        if (!row.TryGetProperty(name, out var value)) return fallback;
        return Value(value, name, owner);
    }

    private static float Value(JsonElement value, string name, string owner)
    {
        if (value.ValueKind != JsonValueKind.Number) throw new FormatException(owner + ": " + name + " is not a number");
        return value.GetSingle();
    }

    private static bool Expected(Exception error) =>
        error is FormatException or InvalidOperationException or ArgumentException or KeyNotFoundException;
}
