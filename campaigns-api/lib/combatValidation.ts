import type { ValidationResult } from "./validation";

export interface EnemyData {
    Name: string;
    // Initiative fixée par le MJ (les ennemis ne lancent pas de dé)
    Initiative: number;
}

export interface CombatData {
    Name: string;
    Enemies: EnemyData[];
}

const MAX_NAME_LENGTH = 100;
const MAX_ENEMIES = 30;
const MIN_INITIATIVE = -10;
const MAX_INITIATIVE = 50;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const checkName = (label: string, value: unknown, errors: string[]): value is string => {
    if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > MAX_NAME_LENGTH) {
        errors.push(`${label} doit contenir entre 1 et ${MAX_NAME_LENGTH} caractères`);
        return false;
    }
    return true;
};

const checkInitiative = (label: string, value: unknown, errors: string[]): value is number => {
    if (!Number.isInteger(value) || (value as number) < MIN_INITIATIVE || (value as number) > MAX_INITIATIVE) {
        errors.push(`${label} doit être un entier entre ${MIN_INITIATIVE} et ${MAX_INITIATIVE}`);
        return false;
    }
    return true;
};

// Valide la définition d'un combat : un nom et au moins un ennemi, chacun avec son initiative
export const validateCombat = (body: unknown): ValidationResult<CombatData> => {
    if (!isPlainObject(body)) {
        return { ok: false, errors: ["Le corps de la requête doit être un objet JSON"] };
    }

    const errors: string[] = [];
    for (const field of Object.keys(body)) {
        if (field !== "Name" && field !== "Enemies") errors.push(`Champ inconnu : "${field}"`);
    }

    checkName('"Name"', body.Name, errors);

    const enemies: EnemyData[] = [];
    if (!Array.isArray(body.Enemies) || body.Enemies.length === 0 || body.Enemies.length > MAX_ENEMIES) {
        errors.push(`"Enemies" doit contenir entre 1 et ${MAX_ENEMIES} ennemis`);
    } else {
        body.Enemies.forEach((enemy: unknown, index: number) => {
            const label = `Ennemi ${index + 1}`;
            if (!isPlainObject(enemy)) {
                errors.push(`${label} doit être un objet`);
                return;
            }
            for (const field of Object.keys(enemy)) {
                if (field !== "Name" && field !== "Initiative") errors.push(`${label} : champ inconnu "${field}"`);
            }
            if (checkName(`${label} : "Name"`, enemy.Name, errors) && checkInitiative(`${label} : "Initiative"`, enemy.Initiative, errors)) {
                enemies.push({ Name: enemy.Name.trim(), Initiative: enemy.Initiative as number });
            }
        });
    }

    return errors.length > 0
        ? { ok: false, errors }
        : { ok: true, value: { Name: (body.Name as string).trim(), Enemies: enemies } };
};

// L'initiative d'un joueur est le total de son jet (d20 + bonus)
export const validateInitiative = (body: unknown): ValidationResult<{ Initiative: number }> => {
    if (!isPlainObject(body)) {
        return { ok: false, errors: ["Le corps de la requête doit être un objet JSON"] };
    }

    const errors: string[] = [];
    for (const field of Object.keys(body)) {
        if (field !== "Initiative") errors.push(`Champ inconnu : "${field}"`);
    }
    if (body.Initiative === undefined) {
        errors.push('"Initiative" est obligatoire');
    } else {
        checkInitiative('"Initiative"', body.Initiative, errors);
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { Initiative: body.Initiative as number } };
};

export interface NewEnemy extends EnemyData {
    // Identifiant provisoire choisi par le client pour placer le nouvel ennemi dans Order ; le serveur en attribue un définitif
    id: string;
}

const MAX_NEW_ENEMIES = 30;

// Nouvel ordre de jeu : la liste des identifiants des participants dans l'ordre voulu, éventuellement avec des
// ennemis ajoutés (NewEnemies), que Order désigne par leur identifiant provisoire
export const validateOrder = (body: unknown): ValidationResult<{ Order: string[]; NewEnemies: NewEnemy[] }> => {
    if (!isPlainObject(body)) {
        return { ok: false, errors: ["Le corps de la requête doit être un objet JSON"] };
    }

    const errors: string[] = [];
    for (const field of Object.keys(body)) {
        if (field !== "Order" && field !== "NewEnemies") errors.push(`Champ inconnu : "${field}"`);
    }
    const order = body.Order;
    if (!Array.isArray(order) || order.length === 0 || order.length > 100 || order.some((id) => typeof id !== "string" || !id || id.length > 100)) {
        errors.push('"Order" doit être une liste d\'identifiants');
    }

    const newEnemies: NewEnemy[] = [];
    if (body.NewEnemies !== undefined) {
        if (!Array.isArray(body.NewEnemies) || body.NewEnemies.length > MAX_NEW_ENEMIES) {
            errors.push(`"NewEnemies" doit contenir au plus ${MAX_NEW_ENEMIES} ennemis`);
        } else {
            body.NewEnemies.forEach((enemy: unknown, index: number) => {
                const label = `Nouvel ennemi ${index + 1}`;
                if (!isPlainObject(enemy)) {
                    errors.push(`${label} doit être un objet`);
                    return;
                }
                for (const field of Object.keys(enemy)) {
                    if (field !== "id" && field !== "Name" && field !== "Initiative") errors.push(`${label} : champ inconnu "${field}"`);
                }
                const idOk = typeof enemy.id === "string" && enemy.id.length > 0 && enemy.id.length <= 100;
                if (!idOk) errors.push(`${label} : "id" doit être un identifiant valide`);
                if (checkName(`${label} : "Name"`, enemy.Name, errors) && checkInitiative(`${label} : "Initiative"`, enemy.Initiative, errors) && idOk) {
                    newEnemies.push({ id: enemy.id as string, Name: enemy.Name.trim(), Initiative: enemy.Initiative as number });
                }
            });
        }
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { Order: order as string[], NewEnemies: newEnemies } };
};
