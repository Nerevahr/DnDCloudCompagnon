// Normalise une chaîne pour une comparaison insensible aux accents et à la casse
// (ex: "Don Général" et "don general" sont considérés identiques).
const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizeForComparison(value: string): string {
    return value
        .normalize("NFD")
        .replace(COMBINING_DIACRITICS, "") // retire les accents
        .toLowerCase()
        .trim();
}

// Retire le préfixe "don"/"don de"/"don d'" d'une catégorie déjà normalisée,
// pour permettre de filtrer avec juste le mot-clé (ex: "general" au lieu de "don général").
const DON_PREFIX = /^don\s+(de\s+|d['’]\s*)?/;

export function normalizeCategory(value: string): string {
    return normalizeForComparison(value).replace(DON_PREFIX, "");
}
