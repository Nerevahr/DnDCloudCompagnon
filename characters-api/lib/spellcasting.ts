import { normalizeForComparison } from "@dndcloud/core";
import { abilityModifier } from "./hitPoints";
import { proficiencyBonus } from "./proficiency";
import type { CharacterData } from "./validation";

type Ability = keyof CharacterData["Abilities"];

// Caractéristique d'incantation par classe (règles D&D 2024). Clés normalisées : sans accent, en minuscules.
// Barbare, Moine, Guerrier et Roublard n'incantent pas, sauf via certaines sous-classes (voir ci-dessous).
const SPELLCASTING_ABILITY_BY_CLASS: Record<string, Ability> = {
    barde: "Charisma",
    clerc: "Wisdom",
    druide: "Wisdom",
    ensorceleur: "Charisma",
    magicien: "Intelligence",
    occultiste: "Charisma",
    paladin: "Charisma",
    rodeur: "Wisdom"
};

// Sous-classes lanceuses de sorts de classes qui n'incantent pas autrement (Intelligence)
const SPELLCASTING_SUBCLASSES: Record<string, string> = {
    guerrier: "chevalier occulte",
    roublard: "escroc arcanique"
};


// Emplacements de sorts par niveau de personnage (règles D&D 2024) : tableau[niveau - 1][niveau de sort - 1].
const FULL_CASTER_SLOTS: number[][] = [
    [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
    [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 2, 1, 1]
];
// Paladin et Rôdeur (demi-lanceurs)
const HALF_CASTER_SLOTS: number[][] = [
    [2], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
    [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 1],
    [4, 3, 3, 3, 2], [4, 3, 3, 3, 2]
];
// Chevalier occulte et Escroc arcanique (tiers de lanceur) : l'incantation commence au niveau 3
const THIRD_CASTER_SLOTS: number[][] = [
    [], [], [2], [3], [3], [3], [4, 2], [4, 2], [4, 2], [4, 3],
    [4, 3], [4, 3], [4, 3, 2], [4, 3, 2], [4, 3, 2], [4, 3, 3], [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1]
];
// Occultiste (Magie de pacte) : [nombre d'emplacements, niveau de ces emplacements], tous du même niveau
const WARLOCK_PACT_SLOTS: [number, number][] = [
    [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
    [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]
];

const SLOTS_BY_CLASS: Record<string, number[][]> = {
    barde: FULL_CASTER_SLOTS,
    clerc: FULL_CASTER_SLOTS,
    druide: FULL_CASTER_SLOTS,
    ensorceleur: FULL_CASTER_SLOTS,
    magicien: FULL_CASTER_SLOTS,
    paladin: HALF_CASTER_SLOTS,
    rodeur: HALF_CASTER_SLOTS
};

// Nombre total d'emplacements par niveau de sort, ex: { 1: 4, 2: 2 } (niveaux sans emplacement omis)
const slotsFor = (classKey: string, level: number): Record<number, number> => {
    if (classKey === "occultiste") {
        const [count, slotLevel] = WARLOCK_PACT_SLOTS[level - 1] ?? [0, 1];
        return { [slotLevel]: count };
    }

    const row = (SLOTS_BY_CLASS[classKey] ?? THIRD_CASTER_SLOTS)[level - 1] ?? [];
    return Object.fromEntries(row.map((count, index) => [index + 1, count]));
};

export interface Spellcasting {
    Ability: Ability;
    Modifier: number;
    SaveDC: number;
    AttackBonus: number;
    SpellSlots: Record<number, number>;
}

// Statistiques d'incantation, ou undefined si la classe (et la sous-classe) n'incante pas.
// DD de sauvegarde des sorts = 8 + bonus de maîtrise + modificateur de la caractéristique d'incantation ;
// bonus d'attaque des sorts = bonus de maîtrise + ce modificateur.
export const computeSpellcasting = (
    className: string,
    subclass: string,
    abilities: CharacterData["Abilities"],
    level: number
): Spellcasting | undefined => {
    const classKey = normalizeForComparison(className);
    const ability: Ability | undefined = SPELLCASTING_ABILITY_BY_CLASS[classKey]
        ?? (normalizeForComparison(subclass).includes(SPELLCASTING_SUBCLASSES[classKey] ?? "\0") ? "Intelligence" : undefined);

    if (!ability) {
        return undefined;
    }

    const modifier = abilityModifier(abilities[ability]);
    const proficiency = proficiencyBonus(level);

    return {
        Ability: ability,
        Modifier: modifier,
        SaveDC: 8 + proficiency + modifier,
        AttackBonus: proficiency + modifier,
        SpellSlots: slotsFor(classKey, level)
    };
};
