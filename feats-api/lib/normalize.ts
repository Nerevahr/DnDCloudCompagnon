import { normalizeForComparison } from "@dndcloud/core";

export { normalizeForComparison };

// Retire le préfixe "don"/"don de"/"don d'" d'une catégorie déjà normalisée,
// pour permettre de filtrer avec juste le mot-clé (ex: "general" au lieu de "don général").
const DON_PREFIX = /^don\s+(de\s+|d['’]\s*)?/;

export function normalizeCategory(value: string): string {
    return normalizeForComparison(value).replace(DON_PREFIX, "");
}
