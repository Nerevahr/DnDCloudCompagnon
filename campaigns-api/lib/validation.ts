export interface CampaignData {
    Name: string;
    Description: string;
}

export type CampaignPatch = Partial<CampaignData>;

export interface JoinData {
    InviteCode: string;
    // Personnage choisi dès l'arrivée ; sinon le joueur le choisit à sa première visite (PUT /campaigns/{id}/character)
    CharacterId?: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const STRING_FIELDS = {
    Name: { min: 1, max: 100 },
    Description: { min: 0, max: 2000 }
} as const;

const MAX_ID_LENGTH = 100;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const checkId = (label: string, value: unknown, errors: string[]): value is string => {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_ID_LENGTH) {
        errors.push(`"${label}" doit être un identifiant valide`);
        return false;
    }
    return true;
};

// Valide un corps de requête partiel : tout champ présent doit être valide, tout champ inconnu est refusé
export const validatePatch = (body: unknown): ValidationResult<CampaignPatch> => {
    if (!isPlainObject(body)) {
        return { ok: false, errors: ["Le corps de la requête doit être un objet JSON"] };
    }

    const errors: string[] = [];
    const patch: CampaignPatch = {};

    for (const [field, value] of Object.entries(body)) {
        const range = STRING_FIELDS[field as keyof typeof STRING_FIELDS];
        if (!range) {
            errors.push(`Champ inconnu : "${field}"`);
        } else if (typeof value !== "string") {
            errors.push(`"${field}" doit être une chaîne de caractères`);
        } else {
            const trimmed = value.trim();
            if (trimmed.length < range.min || trimmed.length > range.max) {
                errors.push(`"${field}" doit contenir entre ${range.min} et ${range.max} caractères`);
            } else {
                patch[field as keyof CampaignData] = trimmed;
            }
        }
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true, value: patch };
};

// Valide la création d'une campagne : Name est obligatoire
export const validateNewCampaign = (body: unknown): ValidationResult<CampaignData> => {
    const result = validatePatch(body);
    if (!result.ok) return result;
    if (result.value.Name === undefined) return { ok: false, errors: ['"Name" est obligatoire'] };

    return { ok: true, value: { Description: "", ...result.value } as CampaignData };
};

export const validateJoin = (body: unknown): ValidationResult<JoinData> => {
    if (!isPlainObject(body)) {
        return { ok: false, errors: ["Le corps de la requête doit être un objet JSON"] };
    }

    const errors: string[] = [];
    let inviteCode: string | undefined;
    let characterId: string | undefined;

    for (const [field, value] of Object.entries(body)) {
        if (field === "InviteCode") {
            if (checkId(field, value, errors)) inviteCode = value;
        } else if (field === "CharacterId") {
            if (checkId(field, value, errors)) characterId = value;
        } else {
            errors.push(`Champ inconnu : "${field}"`);
        }
    }
    if (body.InviteCode === undefined) errors.push('"InviteCode" est obligatoire');

    return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { InviteCode: inviteCode!, CharacterId: characterId } };
};

export const validateCharacterChoice = (body: unknown): ValidationResult<{ CharacterId: string }> => {
    if (!isPlainObject(body)) {
        return { ok: false, errors: ["Le corps de la requête doit être un objet JSON"] };
    }

    const errors: string[] = [];
    for (const field of Object.keys(body)) {
        if (field !== "CharacterId") errors.push(`Champ inconnu : "${field}"`);
    }
    if (body.CharacterId === undefined) {
        errors.push('"CharacterId" est obligatoire');
    } else {
        checkId("CharacterId", body.CharacterId, errors);
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { CharacterId: body.CharacterId as string } };
};
