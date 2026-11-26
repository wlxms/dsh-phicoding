// Naming policy shared by the universal naming rules.
//
// Categories are structural facts: an interface is an interface because the
// declaration says so, never because its name starts with I. The project
// adaptation layer may change the surface patterns, but not the category.

export const DEFAULT_NAMING = {
  interface: { prefix: 'I' },
  enum: { prefix: 'E' },
  attribute: { suffix: 'Attribute' },
  exception: { suffix: 'Exception' },
  extension: { suffixes: ['Extension', 'Extensions'], singleTargetMustLead: true },
  family: {
    enabled: true,
    roots: [
      'AActor', 'ACharacter', 'APawn', 'AController', 'APlayerController', 'APlayerState',
      'AGameModeBase', 'AGameStateBase', 'AInfo', 'AHUD', 'AVolume', 'ATriggerBase',
      'UObject', 'UActorComponent', 'USceneComponent', 'UUserWidget', 'UWidget',
      'UBlueprintFunctionLibrary', 'UInterface', 'UWorld', 'UGameInstance',
      'UDataAsset', 'USaveGame', 'UPrimaryDataAsset',
      'FTableRowBase',
      'SWidget', 'SCompoundWidget', 'SLeafWidget', 'SPanel'
    ],
    prefixes: ['A', 'U', 'F', 'S', 'T'],
    terminalPattern: '^[AUFST][A-Z]'
  }
}

const merge = (base, override) => ({
  ...base,
  ...override,
  interface: { ...base.interface, ...(override?.interface ?? {}) },
  enum: { ...base.enum, ...(override?.enum ?? {}) },
  attribute: { ...base.attribute, ...(override?.attribute ?? {}) },
  exception: { ...base.exception, ...(override?.exception ?? {}) },
  extension: { ...base.extension, ...(override?.extension ?? {}) },
  family: { ...base.family, ...(override?.family ?? {}) }
})

export function namingPolicy(config, language = 'cs') {
  const profile = config?.profiles?.[language]?.naming
  return merge(DEFAULT_NAMING, { ...(config?.naming ?? {}), ...(profile ?? {}) })
}

export const hasPrefix = (name, prefix) => {
  if (!prefix) return true
  if (!String(name).startsWith(prefix)) return false
  const next = String(name).slice(String(prefix).length, String(prefix).length + 1)
  return next === '' || /[A-Z]/.test(next)
}
export const hasSuffix = (name, suffix) => Boolean(suffix) && String(name).endsWith(suffix)
export const extensionNamed = (name, suffixes) => suffixes.some((suffix) => hasSuffix(name, suffix))
