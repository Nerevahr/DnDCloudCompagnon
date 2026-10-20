import { normalizeForComparison } from "@dndcloud/core";
import { abilityModifier } from "./hitPoints";
import { proficiencyBonus } from "./proficiency";
import { ABILITIES, type CharacterData } from "./validation";

type Ability = typeof ABILITIES[number];

// Jets de sauvegarde maîtrisés par classe (règles D&D 2024). Clés normalisées : sans accent, en minuscules.
const SAVING_THROW_PROFICIENCIES: Record<string, readonly Ability[]> = {
    barbare: ["Strength", "Constitution"],
    barde: ["Dexterity", "Charisma"],
    clerc: ["Wisdom", "Charisma"],
    druide: ["Intelligence", "Wisdom"],
    ensorceleur: ["Constitution", "Charisma"],
    guerrier: ["Strength", "Constitution"],
    magicien: ["Intelligence", "Wisdom"],
    moine: ["Strength", "Dexterity"],
    occultiste: ["Wisdom", "Charisma"],
    paladin: ["Wisdom", "Charisma"],
    rodeur: ["Strength", "Dexterity"],
    roublard: ["Dexterity", "Intelligence"]
};

export type SavingThrows = Record<Ability, { Bonus: number; Proficient: boolean }>;

// Bonus de chaque jet de sauvegarde : modificateur de la caractéristique, + bonus de maîtrise si la classe
// donne la maîtrise de ce jet. Une classe inconnue (homebrew) n'en maîtrise aucun.
export const computeSavingThrows = (className: string, abilities: CharacterData["Abilities"], level: number): SavingThrows => {
    const proficient = SAVING_THROW_PROFICIENCIES[normalizeForComparison(className)] ?? [];
    const bonus = proficiencyBonus(level);

    return Object.fromEntries(ABILITIES.map((ability) => {
        const isProficient = proficient.includes(ability);
        return [ability, { Bonus: abilityModifier(abilities[ability]) + (isProficient ? bonus : 0), Proficient: isProficient }];
    })) as SavingThrows;
};
