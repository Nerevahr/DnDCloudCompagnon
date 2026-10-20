import { normalizeForComparison } from "@dndcloud/core";

// Dé de vie par classe (règles D&D 2024). Clés normalisées : sans accent, en minuscules.
const HIT_DIE_BY_CLASS: Record<string, number> = {
    barbare: 12,
    barde: 8,
    clerc: 8,
    druide: 8,
    ensorceleur: 6,
    guerrier: 10,
    magicien: 6,
    moine: 8,
    occultiste: 8,
    paladin: 10,
    rodeur: 10,
    roublard: 8
};

export const hitDieOf = (className: string): number | undefined => HIT_DIE_BY_CLASS[normalizeForComparison(className)];

export const abilityModifier = (score: number): number => Math.floor((score - 10) / 2);

// PV max d'un personnage : au niveau 1, le dé de vie au maximum + modificateur de Constitution ;
// à chaque niveau suivant, la valeur fixe du dé (moitié du dé + 1, soit la moyenne arrondie au supérieur)
// + modificateur de Constitution. Un niveau rapporte toujours au moins 1 PV.
// Retourne undefined si la classe est inconnue (classe libre / homebrew) : les PV ne peuvent alors pas être calculés.
export const computeMaxHitPoints = (className: string, level: number, constitution: number): number | undefined => {
    const hitDie = hitDieOf(className);
    if (hitDie === undefined) {
        return undefined;
    }

    const modifier = abilityModifier(constitution);
    const firstLevel = Math.max(1, hitDie + modifier);
    const otherLevel = Math.max(1, hitDie / 2 + 1 + modifier);

    return firstLevel + (level - 1) * otherLevel;
};
