// UnrealSharp facts adapter.
//
// The C# base sees `partial class` and treats the type as concrete. UnrealSharp
// expresses abstractness as `[UClass(ClassFlags.Abstract)]`, which is engine
// metadata, not a C# modifier. This adapter adds the missing semantic fact and
// keeps the physical syntax fact untouched.

export const id = 'unreal'
export const label = 'UnrealSharp'

const isAbstractClass = (attribute) =>
  /^UClass\b/.test(attribute) && /ClassFlags\.Abstract/.test(attribute)

export function enrich(facts) {
  for (const type of facts.types ?? []) {
    const evidence = (type.attributes ?? []).find(isAbstractClass)
    if (!evidence) continue

    type.semantics = {
      ...(type.semantics ?? {}),
      abstractness: 'abstract'
    }
    type.semanticsProvenance = [
      ...(type.semanticsProvenance ?? []),
      {
        trait: 'abstractness',
        source: id,
        file: type.file,
        line: type.line,
        evidence
      }
    ]
  }
  return facts
}
