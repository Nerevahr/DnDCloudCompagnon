import { computeMaxHitPoints } from "./hitPoints";
import { SKILL_KEYS } from "./skills";

export const ABILITIES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"] as const;
export const SPELL_LEVELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
export const HIT_POINT_FIELDS = ["Current", "Max", "Temporary"] as const;

export interface CharacterData {
    Name: string;
    Class: string;
    Subclass: string;
    Species: string;
    Background: string;
    Level: number;
    Abilities: Record<typeof ABILITIES[number], number>;
    HitPoints: Record<typeof HIT_POINT_FIELDS[number], number>;
    ArmorClass: number;
    Notes: string;
    // Pièces d'or, avec au plus 2 décimales (les centièmes sont des pièces d'argent et de cuivre)
    Gold: number;
    // Identifiants (slugs) de ressources du compendium : sorts, dons, objets
    // Compétences maîtrisées / avec expertise (clés de SKILL_ABILITIES, ex: "Survival")
    SkillProficiencies: string[];
    SkillExpertise: string[];
    Spells: string[];
    // Emplacements de sorts dépensés par niveau de sort ("1" à "9") ; absent = aucun dépensé
    SpellSlotsUsed: Partial<Record<typeof SPELL_LEVELS[number], number>>;
    Feats: string[];
    Items: string[];
}

// Mise à jour partielle : chaque champ est optionnel, y compris à l'intérieur de Abilities / HitPoints
export type CharacterPatch = {
    [K in keyof CharacterData]?: CharacterData[K] extends Record<string, number> ? Partial<CharacterData[K]> : CharacterData[K];
};

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const DEFAULT_CHARACTER: Omit<CharacterData, "Name" | "Class"> = {
    Subclass: "",
    Species: "",
    Background: "",
    Level: 1,
    Abilities: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 },
    HitPoints: { Current: 0, Max: 0, Temporary: 0 },
    ArmorClass: 10,
    Notes: "",
    Gold: 0,
    SkillProficiencies: [],
    SkillExpertise: [],
    Spells: [],
    SpellSlotsUsed: {},
    Feats: [],
    Items: []
};

const STRING_FIELDS = {
    Name: { min: 1, max: 100 },
    Class: { min: 1, max: 50 },
    Subclass: { min: 0, max: 50 },
    Species: { min: 0, max: 50 },
    Background: { min: 0, max: 50 },
    Notes: { min: 0, max: 5000 }
} as const;

const INTEGER_FIELDS = {
    Level: { min: 1, max: 20 },
    ArmorClass: { min: 0, max: 40 }
} as const;

const ABILITY_RANGE = { min: 1, max: 30 };
// Aucune classe n'a plus de 4 emplacements d'un même niveau
const MAX_GOLD = 999_999_999.99;
const SPELL_SLOTS_USED_RANGE = { min: 0, max: 4 };
const HIT_POINT_RANGE = { min: 0, max: 9999 };
const ID_LIST_FIELDS = ["Spells", "Feats", "Items"] as const;
const MAX_IDS = 500;
const MAX_ID_LENGTH = 100;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const checkInteger = (label: string, value: unknown, range: { min: number; max: number }, errors: string[]): value is number => {
    if (!Number.isInteger(value) || (value as number) < range.min || (value as number) > range.max) {
        errors.push(`"${label}" doit être un entier entre ${range.min} et ${range.max}`);
        return false;
    }
    return true;
};

// Valide les champs d'un objet de nombres (Abilities, HitPoints) : seuls les noms autorisés sont acceptés
const validateNumberGroup = <K extends string>(
    label: string,
    value: unknown,
    allowedKeys: readonly K[],
    range: { min: number; max: number },
    errors: string[]
): Partial<Record<K, number>> | undefined => {
    if (!isPlainObject(value)) {
        errors.push(`"${label}" doit être un objet`);
        return undefined;
    }

    const result: Partial<Record<K, number>> = {};
    for (const [key, fieldValue] of Object.entries(value)) {
        if (!(allowedKeys as readonly string[]).includes(key)) {
            errors.push(`Champ inconnu : "${label}.${key}"`);
        } else if (checkInteger(`${label}.${key}`, fieldValue, range, errors)) {
            result[key as K] = fieldValue;
        }
    }
    return result;
};

// Valide un corps de requête partiel : tout champ présent doit être valide, tout champ inconnu est refusé
export const validatePatch = (body: unknown): ValidationResult<CharacterPatch> => {
    if (!isPlainObject(body)) {
        return { ok: false, errors: ["Le corps de la requête doit être un objet JSON"] };
    }

    const errors: string[] = [];
    const patch: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
        if (key in STRING_FIELDS) {
            const { min, max } = STRING_FIELDS[key as keyof typeof STRING_FIELDS];
            const trimmed = typeof value === "string" ? value.trim() : undefined;
            if (trimmed === undefined || trimmed.length < min || trimmed.length > max) {
                errors.push(`"${key}" doit être une chaîne de ${min === 0 ? "" : `${min} à `}${max} caractères${min === 0 ? " maximum" : ""}`);
            } else {
                patch[key] = trimmed;
            }
        } else if (key in INTEGER_FIELDS) {
            if (checkInteger(key, value, INTEGER_FIELDS[key as keyof typeof INTEGER_FIELDS], errors)) {
                patch[key] = value;
            }
        } else if (key === "Abilities") {
            const abilities = validateNumberGroup(key, value, ABILITIES, ABILITY_RANGE, errors);
            if (abilities) patch[key] = abilities;
        } else if (key === "HitPoints") {
            const hitPoints = validateNumberGroup(key, value, HIT_POINT_FIELDS, HIT_POINT_RANGE, errors);
            if (hitPoints) patch[key] = hitPoints;
        } else if (key === "Gold") {
            // Tolérance aux erreurs de flottants (ex: 0.1 + 0.2) avant de vérifier qu'il n'y a pas plus de 2 décimales
            const cents = typeof value === "number" ? value * 100 : NaN;
            if (typeof value === "number" && Number.isFinite(cents) && value >= 0 && value <= MAX_GOLD
                && Math.abs(cents - Math.round(cents)) < 1e-6) {
                patch[key] = Math.round(cents) / 100;
            } else {
                errors.push(`"Gold" doit être un nombre entre 0 et ${MAX_GOLD} avec au plus 2 décimales`);
            }
        } else if (key === "SpellSlotsUsed") {
            const used = validateNumberGroup(key, value, SPELL_LEVELS, SPELL_SLOTS_USED_RANGE, errors);
            if (used) patch[key] = used;
        } else if (key === "SkillProficiencies" || key === "SkillExpertise") {
            const valid = Array.isArray(value) && value.every((skill) => (SKILL_KEYS as string[]).includes(skill));
            if (valid) {
                patch[key] = [...new Set(value as string[])];
            } else {
                errors.push(`"${key}" doit être une liste de compétences parmi : ${SKILL_KEYS.join(", ")}`);
            }
        } else if ((ID_LIST_FIELDS as readonly string[]).includes(key)) {
            const valid = Array.isArray(value)
                && value.length <= MAX_IDS
                && value.every((id) => typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH);
            if (valid) {
                patch[key] = [...new Set(value as string[])];
            } else {
                errors.push(`"${key}" doit être une liste d'au plus ${MAX_IDS} identifiants (chaînes non vides)`);
            }
        } else {
            errors.push(`Champ inconnu : "${key}"`);
        }
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true, value: patch as CharacterPatch };
};

// Valide la création d'un personnage : Name et Class sont obligatoires, le reste prend sa valeur par défaut
export const validateNewCharacter = (body: unknown): ValidationResult<CharacterData> => {
    const result = validatePatch(body);
    if (!result.ok) {
        return result;
    }

    const missing = (["Name", "Class"] as const).filter((field) => result.value[field] === undefined);
    if (missing.length > 0) {
        return { ok: false, errors: missing.map((field) => `"${field}" est obligatoire`) };
    }

    const { Abilities, HitPoints, ...rest } = result.value;
    const abilities = { ...DEFAULT_CHARACTER.Abilities, ...Abilities };
    const level = rest.Level ?? DEFAULT_CHARACTER.Level;

    // PV max calculés d'après la classe, le niveau et la Constitution, sauf si le client les fournit
    // explicitement (ex: PV obtenus par jets de dés). Les PV actuels démarrent au maximum.
    const maxHitPoints = HitPoints?.Max ?? computeMaxHitPoints(rest.Class!, level, abilities.Constitution) ?? 0;

    return {
        ok: true,
        value: {
            ...DEFAULT_CHARACTER,
            ...rest,
            Abilities: abilities,
            HitPoints: { Current: maxHitPoints, Temporary: 0, ...HitPoints, Max: maxHitPoints }
        } as CharacterData
    };
};
