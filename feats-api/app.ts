import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { getFeatById, scanFeats } from "./lib/featRepository";
import { successResponse, errorResponse, notFoundResponse } from "./lib/httpResponse";
import { buildFeatSelfLink } from "./lib/links";

export const lambdaHandler = async (
    event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
    const featId = event.pathParameters?.id;

    return featId ? getFeat(event, featId) : listFeats(event);
};

const SORT_OPTIONS = ["name"] as const;
type SortOption = typeof SORT_OPTIONS[number];

// Trie une liste de dons par ordre alphabétique.
// Le tri se fait côté application car DynamoDB Scan ne garantit aucun ordre et ne supporte pas ORDER BY.
const sortFeats = (
    feats: Array<{ id: string } & Record<string, unknown>>,
    sort?: SortOption
) => {
    if (!sort) {
        return feats;
    }

    const sorted = [...feats];
    sorted.sort((a, b) => (a.Name as string).localeCompare(b.Name as string, "fr"));

    return sorted;
};

const listFeats = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
        // Récupération du paramètre "category" depuis l'URL (ex: ?category=general&category=origine)
        // Les HTTP API d'API Gateway fusionnent les valeurs dupliquées dans une seule chaîne séparée par des virgules
        const rawCategoryFilter = event.queryStringParameters?.category;
        const categoryFilters = rawCategoryFilter
            ? rawCategoryFilter.split(",").map((category) => category.trim()).filter(Boolean)
            : [];

        // Tri optionnel du résultat : ?sort=name (alphabétique)
        const rawSort = event.queryStringParameters?.sort;
        const sort = SORT_OPTIONS.includes(rawSort as SortOption) ? (rawSort as SortOption) : undefined;

        const { count, feats } = await scanFeats(categoryFilters);

        return successResponse({
            count,
            filterApplied: {
                category: categoryFilters.length > 0 ? categoryFilters : "none"
            },
            sortApplied: sort ?? "none",
            // Informations minimales uniquement (nom, catégorie, prérequis) pour garder le body léger ;
            // le lien "self" permet au client de retrouver le détail complet du don (auto-discovery)
            feats: sortFeats(feats, sort).map(({ id, ...feat }) => ({
                id,
                ...feat,
                _self: buildFeatSelfLink(event, id)
            }))
        });

    } catch (error) {
        console.error("Erreur lors de la lecture de DynamoDB:", error);
        return errorResponse("Impossible de récupérer les dons", error as Error);
    }
};

const getFeat = async (event: APIGatewayProxyEventV2, featId: string): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
        const feat = await getFeatById(featId);

        if (!feat) {
            return notFoundResponse(`Aucun don trouvé pour l'identifiant "${featId}"`);
        }

        return successResponse({
            ...feat,
            _self: buildFeatSelfLink(event, featId)
        });

    } catch (error) {
        console.error("Erreur lors de la lecture de DynamoDB:", error);
        return errorResponse("Impossible de récupérer le don", error as Error);
    }
};
