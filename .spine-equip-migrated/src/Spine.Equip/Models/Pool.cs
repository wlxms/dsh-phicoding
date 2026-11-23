namespace Spine.Equip;

public struct Pool
{
    public float Flat;
    public float Ratio;

    public Pool(float basis)
    {
        Flat = basis;
        Ratio = 1f;
    }

    public void Add(float value) => Flat += value;

    public void Mul(float value) => Ratio *= value;

    public readonly float Final => Flat * Ratio;
}
