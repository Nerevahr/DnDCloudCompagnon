import { abilityModifier } from "./hitPoints";
import { proficiencyBonus } from "./proficiency";
import type { CharacterData } from "./validation";

type Ability = keyof CharacterData["Abilities"];

// Les 18 compétences et la caractéristique dont chacune dépend (règles D&D 2024)
export const SKILL_ABILITIES = {
    Acrobatics: "Dexterity",
    AnimalHandling: "Wisdom",
    Arcana: "Intelligence",
    Athletics: "Strength",
    Deception: "Charisma",
    History: "Intelligence",
    Insight: "Wisdom",
    Intimidation: "Charisma",
    Investigation: "Intelligence",
    Medicine: "Wisdom",
    Nature: "Intelligence",
    Perception: "Wisdom",
    Performance: "Charisma",
    Persuasion: "Charisma",
    Religion: "Intelligence",
    SleightOfHand: "Dexterity",
    Stealth: "Dexterity",
    Survival: "Wisdom"
} as const satisfies Record<string, Ability>;

export type SkillKey = keyof typeof SKILL_ABILITIES;
export const SKILL_KEYS = Object.keys(SKILL_ABILITIES) as SkillKey[];

export interface SkillStat {
    Key: SkillKey;
    Ability: Ability;
    Bonus: number;
    Proficiency: "none" | "proficient" | "expertise";
}

// Bonus de chaque compétence : modificateur de la caractéristique, + bonus de maîtrise si le personnage maîtrise
// la compétence, ou le double (expertise). L'expertise vaut maîtrise même si la compétence n'est pas dans la
// liste des maîtrises.
export const computeSkills = (
    abilities: CharacterData["Abilities"],
    level: number,
    proficiencies: readonly string[],
    expertise: readonly string[]
): SkillStat[] => {
    const bonus = proficiencyBonus(level);

    return SKILL_KEYS.map((key) => {
        const ability = SKILL_ABILITIES[key];
        const proficiency = expertise.includes(key) ? "expertise" : proficiencies.includes(key) ? "proficient" : "none";
        const multiplier = proficiency === "expertise" ? 2 : proficiency === "proficient" ? 1 : 0;

        return { Key: key, Ability: ability, Bonus: abilityModifier(abilities[ability]) + multiplier * bonus, Proficiency: proficiency };
    });
};
