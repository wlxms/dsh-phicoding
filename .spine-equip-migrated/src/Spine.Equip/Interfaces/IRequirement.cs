namespace Spine.Equip;

public interface IRequirement
{
    bool Met(Wearer wearer);
}
