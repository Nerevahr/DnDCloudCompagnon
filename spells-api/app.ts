import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { getSpellById, scanSpells } from "./lib/spellRepository";
import { successResponse, errorResponse, notFoundResponse } from "./lib/httpResponse";
import { buildSpellSelfLink } from "./lib/links";

export const lambdaHandler = async (
    event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
    const spellId = event.pathParameters?.id;

    return spellId ? getSpell(event, spellId) : listSpells(event);
};

const listSpells = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
        // Récupération des paramètres "school", "level" et "class" depuis l'URL
        // (ex: ?school=Illusion&school=Conjuration ou ?level=1&level=2 ou ?class=Clerc&class=Druide)
        // Les HTTP API d'API Gateway fusionnent les valeurs dupliquées dans une seule chaîne séparée par des virgules
        const rawSchoolFilter = event.queryStringParameters?.school;
        const schoolFilters = rawSchoolFilter
            ? rawSchoolFilter.split(",").map((school) => school.trim()).filter(Boolean)
            : [];

        const rawLevelFilter = event.queryStringParameters?.level;
        const levelFilters = rawLevelFilter
            ? rawLevelFilter.split(",").map((level) => level.trim()).filter(Boolean).map(Number).filter((level) => !Number.isNaN(level))
            : [];

        const rawClassFilter = event.queryStringParameters?.class;
        const classFilters = rawClassFilter
            ? rawClassFilter.split(",").map((classe) => classe.trim()).filter(Boolean)
            : [];

        const { count, spells } = await scanSpells(schoolFilters, levelFilters, classFilters);

        return successResponse({
            count,
            filterApplied: {
                school: schoolFilters.length > 0 ? schoolFilters : "none",
                level: levelFilters.length > 0 ? levelFilters : "none",
                class: classFilters.length > 0 ? classFilters : "none"
            },
            // Informations minimales uniquement (nom, niveau, école, classes) pour garder le body léger ;
            // le lien "self" permet au client de retrouver le détail complet du sort (auto-discovery)
            spells: spells.map(({ id, ...spell }) => ({
                id,
                ...spell,
                self: buildSpellSelfLink(event, id)
            }))
        });

    } catch (error) {
        console.error("Erreur lors de la lecture de DynamoDB:", error);
        return errorResponse("Impossible de récupérer les sorts", error as Error);
    }
};

const getSpell = async (event: APIGatewayProxyEventV2, spellId: string): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
        const spell = await getSpellById(spellId);

        if (!spell) {
            return notFoundResponse(`Aucun sort trouvé pour l'identifiant "${spellId}"`);
        }

        return successResponse({
            ...spell,
            self: buildSpellSelfLink(event, spellId)
        });

    } catch (error) {
        console.error("Erreur lors de la lecture de DynamoDB:", error);
        return errorResponse("Impossible de récupérer le sort", error as Error);
    }
};
