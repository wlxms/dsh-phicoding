namespace Spine.Equip.Config;

// [Administrator 2026-11-24] PureDTO：从 data/*.json 读入，永不拥有领域行为，也不引用模块内类型。
public sealed class ModDto
{
    public ModDto(Type stat, float add, float mul)
    {
        Stat = stat;
        Add = add;
        Mul = mul;
    }

    public Type Stat { get; }

    public float Add { get; }

    public float Mul { get; }
}
