import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import {
    successResponse,
    createdResponse,
    noContentResponse,
    badRequestResponse,
    unauthorizedResponse,
    notFoundResponse,
    errorResponse
} from "@dndcloud/core";
import { createCharacter, deleteCharacter, getCharacter, listCharacters, updateCharacter } from "./lib/characterRepository";
import { buildCharacterSelfLink } from "./lib/links";
import { proficiencyBonus } from "./lib/proficiency";
import { computeSavingThrows } from "./lib/savingThrows";
import { computeSkills } from "./lib/skills";
import { computeSpellcasting } from "./lib/spellcasting";
import type { CharacterData } from "./lib/validation";
import { validateNewCharacter, validatePatch } from "./lib/validation";

type Event = APIGatewayProxyEventV2WithJWTAuthorizer;
type Result = APIGatewayProxyStructuredResultV2;

export const lambdaHandler = async (event: Event): Promise<Result> => {
    // Identifiant Cognito de l'utilisateur, posé par l'authorizer JWT de l'API Gateway.
    // sam local n'exécute pas l'authorizer : en local uniquement, on utilise un utilisateur fictif.
    // AWS_SAM_LOCAL n'est jamais défini sur une Lambda déployée.
    const ownerId = process.env.AWS_SAM_LOCAL === "true"
        ? "local-user"
        : event.requestContext.authorizer?.jwt?.claims?.sub;
    if (typeof ownerId !== "string" || !ownerId) {
        return unauthorizedResponse("Utilisateur non identifié");
    }

    const characterId = event.pathParameters?.id;
    const method = event.requestContext.http.method;

    if (!characterId) {
        if (method === "GET") return list(event, ownerId);
        if (method === "POST") return create(event, ownerId);
    } else {
        if (method === "GET") return get(event, ownerId, characterId);
        if (method === "PATCH") return update(event, ownerId, characterId);
        if (method === "DELETE") return remove(ownerId, characterId);
    }

    return { statusCode: 405, body: JSON.stringify({ error: `Méthode ${method} non supportée` }) };
};

// Représentation d'un personnage dans les réponses : champs stockés + valeurs dérivées (bonus de maîtrise,
// statistiques d'incantation, bonus des compétences et des jets de sauvegarde) calculées à chaque lecture + lien self
const present = (event: Event, character: { id: string } & Record<string, unknown>) => {
    const { Level, Class, Subclass, Abilities, SkillProficiencies, SkillExpertise } = character as Partial<CharacterData>;
    const spellcasting = typeof Level === "number" && typeof Class === "string" && Abilities
        ? computeSpellcasting(Class, Subclass ?? "", Abilities, Level)
        : undefined;

    return {
        ...character,
        ...(typeof Level === "number" && { ProficiencyBonus: proficiencyBonus(Level) }),
        ...(typeof Level === "number" && typeof Class === "string" && Abilities && { SavingThrows: computeSavingThrows(Class, Abilities, Level) }),
        ...(spellcasting && { Spellcasting: spellcasting }),
        ...(typeof Level === "number" && Abilities && { Skills: computeSkills(Abilities, Level, SkillProficiencies ?? [], SkillExpertise ?? []) }),
        _self: buildCharacterSelfLink(event, character.id)
    };
};

// Retourne le corps JSON de la requête, ou undefined s'il est absent ou invalide
const parseBody = (event: Event): unknown => {
    if (!event.body) return undefined;
    try {
        return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body);
    } catch {
        return undefined;
    }
};

const list = async (event: Event, ownerId: string): Promise<Result> => {
    try {
        const { count, characters } = await listCharacters(ownerId);

        return successResponse({
            count,
            characters: characters.map((character) => ({
                ...character,
                _self: buildCharacterSelfLink(event, character.id)
            }))
        });
    } catch (error) {
        console.error("Erreur lors de la lecture de DynamoDB:", error);
        return errorResponse("Impossible de récupérer les personnages", error as Error);
    }
};

const get = async (event: Event, ownerId: string, characterId: string): Promise<Result> => {
    try {
        const character = await getCharacter(ownerId, characterId);

        if (!character) {
            return notFoundResponse(`Aucun personnage trouvé pour l'identifiant "${characterId}"`);
        }

        return successResponse(present(event, character));
    } catch (error) {
        console.error("Erreur lors de la lecture de DynamoDB:", error);
        return errorResponse("Impossible de récupérer le personnage", error as Error);
    }
};

const create = async (event: Event, ownerId: string): Promise<Result> => {
    const validation = validateNewCharacter(parseBody(event));
    if (!validation.ok) {
        return badRequestResponse("Personnage invalide", validation.errors);
    }

    try {
        const character = await createCharacter(ownerId, validation.value);
        const body = present(event, character);

        return createdResponse(body, body._self);
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible de créer le personnage", error as Error);
    }
};

const update = async (event: Event, ownerId: string, characterId: string): Promise<Result> => {
    const validation = validatePatch(parseBody(event));
    if (!validation.ok) {
        return badRequestResponse("Modification invalide", validation.errors);
    }
    if (Object.keys(validation.value).length === 0) {
        return badRequestResponse("Modification invalide", ["Aucun champ à modifier"]);
    }

    try {
        const character = await updateCharacter(ownerId, characterId, validation.value);

        if (!character) {
            return notFoundResponse(`Aucun personnage trouvé pour l'identifiant "${characterId}"`);
        }

        return successResponse(present(event, character));
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible de modifier le personnage", error as Error);
    }
};

const remove = async (ownerId: string, characterId: string): Promise<Result> => {
    try {
        const deleted = await deleteCharacter(ownerId, characterId);

        return deleted
            ? noContentResponse()
            : notFoundResponse(`Aucun personnage trouvé pour l'identifiant "${characterId}"`);
    } catch (error) {
        console.error("Erreur lors de la suppression dans DynamoDB:", error);
        return errorResponse("Impossible de supprimer le personnage", error as Error);
    }
};
