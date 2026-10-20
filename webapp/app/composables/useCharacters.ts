export const abilities = [
  { key: 'Strength', short: 'FOR', label: 'Force' },
  { key: 'Dexterity', short: 'DEX', label: 'Dextérité' },
  { key: 'Constitution', short: 'CON', label: 'Constitution' },
  { key: 'Intelligence', short: 'INT', label: 'Intelligence' },
  { key: 'Wisdom', short: 'SAG', label: 'Sagesse' },
  { key: 'Charisma', short: 'CHA', label: 'Charisme' }
] as const

// Libellés des compétences, par clé renvoyée par l'API (qui en calcule le bonus et la caractéristique associée)
export const skillLabels: Record<string, string> = {
  Acrobatics: 'Acrobaties',
  AnimalHandling: 'Dressage',
  Arcana: 'Arcanes',
  Athletics: 'Athlétisme',
  Deception: 'Tromperie',
  History: 'Histoire',
  Insight: 'Perspicacité',
  Intimidation: 'Intimidation',
  Investigation: 'Investigation',
  Medicine: 'Médecine',
  Nature: 'Nature',
  Perception: 'Perception',
  Performance: 'Représentation',
  Persuasion: 'Persuasion',
  Religion: 'Religion',
  SleightOfHand: 'Escamotage',
  Stealth: 'Discrétion',
  Survival: 'Survie'
}

// Compétences dans l'ordre alphabétique français, comme sur la feuille de personnage
export const skillKeysSorted = Object.keys(skillLabels).sort((a, b) => skillLabels[a]!.localeCompare(skillLabels[b]!, 'fr'))

export interface SkillStat {
  Key: string
  Ability: typeof abilities[number]['key']
  Bonus: number
  Proficiency: 'none' | 'proficient' | 'expertise'
}

export interface CharacterSummary {
  id: string
  Name: string
  Class: string
  Species?: string
  Level: number
  HitPoints: { Current: number, Max: number, Temporary: number }
}

export interface Character extends CharacterSummary {
  Subclass: string
  Background: string
  ArmorClass: number
  Abilities: Record<typeof abilities[number]['key'], number>
  Notes: string
  // Pièces d'or, avec 2 décimales (absent sur les personnages créés avant l'ajout du champ)
  Gold?: number
  // Calculé par l'API d'après le niveau (non stocké)
  ProficiencyBonus?: number
  // Calculé par l'API ; absent si la classe n'incante pas
  Spellcasting?: {
    Ability: typeof abilities[number]['key']
    Modifier: number
    SaveDC: number
    AttackBonus: number
    // Nombre total d'emplacements par niveau de sort (ex: { 1: 4, 2: 2 }), calculé par l'API
    SpellSlots: Record<string, number>
  }
  // Emplacements dépensés par niveau de sort (ex: { 1: 2 })
  SpellSlotsUsed?: Record<string, number>
  // Compétences maîtrisées / avec expertise (clés de skillLabels)
  SkillProficiencies?: string[]
  SkillExpertise?: string[]
  // Calculé par l'API d'après la classe : bonus de chaque jet de sauvegarde et maîtrise ou non
  SavingThrows?: Record<typeof abilities[number]['key'], { Bonus: number, Proficient: boolean }>
  // Calculées par l'API : bonus de chaque compétence
  Skills?: SkillStat[]
  // Identifiants (slugs) de sorts du compendium
  Spells: string[]
}

export interface SpellSummary {
  id: string
  Name: string
  Level: number
  School: string
}

// Liste des sorts du compendium (même clé et même requête que la page du compendium : cache partagé)
export function useSpellList() {
  const apiOptions = useApiFetchOptions()
  return useLazyFetch<{ spells: SpellSummary[] }>(
    `${useRuntimeConfig().public.apiBase}/api/v1/spells`,
    { ...apiOptions, query: { sort: 'level' }, key: 'compendium-spells' }
  )
}

// Montant d'or avec toujours 2 décimales et séparateur de milliers (ex: 1234.5 → « 1 234,50 »)
const goldFormat = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const formatGold = (amount: number) => goldFormat.format(amount)

// Nombre avec son signe (ex: 3 → +3, -1 → -1)
export const signed = (value: number) => (value >= 0 ? `+${value}` : String(value))

// Modificateur numérique d'un score de caractéristique (ex: 16 → 3)
export const abilityModifierValue = (score: number) => Math.floor((score - 10) / 2)

// Modificateur de caractéristique avec son signe (ex: 16 → +3)
export const abilityModifier = (score: number) => signed(abilityModifierValue(score))

// Appels d'écriture sur l'API des personnages (la lecture passe par useLazyFetch dans les pages)
export function useCharactersApi() {
  const base = `${useRuntimeConfig().public.apiBase}/api/v1/characters`
  const options = useApiFetchOptions()

  return {
    base,
    options,
    create: (body: Record<string, unknown>) => $fetch<Character>(base, { ...options, method: 'POST', body }),
    update: (id: string, body: Record<string, unknown>) => $fetch<Character>(`${base}/${id}`, { ...options, method: 'PATCH', body }),
    remove: (id: string) => $fetch(`${base}/${id}`, { ...options, method: 'DELETE' })
  }
}
