import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { scanSpells } from "./lib/spellRepository";
import { successResponse, errorResponse } from "./lib/httpResponse";

export const lambdaHandler = async (
    event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
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
            spells
        });

    } catch (error) {
        console.error("Erreur lors de la lecture de DynamoDB:", error);
        return errorResponse("Impossible de récupérer les sorts", error as Error);
    }
};
