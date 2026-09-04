// Normalise une chaîne pour une comparaison insensible aux accents et à la casse
// (ex: "Armure Intermédiaire" et "armure intermediaire" sont considérés identiques).
const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizeForComparison(value: string): string {
    return value
        .normalize("NFD")
        .replace(COMBINING_DIACRITICS, "") // retire les accents
        .toLowerCase()
        .trim();
}
