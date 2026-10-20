// Bonus de maîtrise (règles D&D) : +2 aux niveaux 1-4, +3 aux niveaux 5-8, ... +6 aux niveaux 17-20.
// Il découle uniquement du niveau : il n'est donc pas stocké mais calculé à chaque lecture,
// pour ne jamais être périmé après un changement de niveau.
export const proficiencyBonus = (level: number): number => Math.ceil(level / 4) + 1;
