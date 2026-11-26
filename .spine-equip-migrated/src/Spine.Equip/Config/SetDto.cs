namespace Spine.Equip.Config;

// [Administrator 2026-11-24] PureDTO：从 data/*.json 读入的套装配置，只承载数据，不承载领域行为。
public sealed class SetDto
{
    public SetDto(int pieces, IReadOnlyList<ModDto> mods)
    {
        Pieces = pieces;
        Mods = mods;
    }

    public int Pieces { get; }

    public IReadOnlyList<ModDto> Mods { get; }
}
