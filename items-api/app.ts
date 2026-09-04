import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { getItemById, scanItems } from "./lib/itemRepository";
import { successResponse, errorResponse, notFoundResponse } from "./lib/httpResponse";
import { buildItemSelfLink } from "./lib/links";

export const lambdaHandler = async (
    event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
    const itemId = event.pathParameters?.id;

    return itemId ? getItem(event, itemId) : listItems(event);
};

const SORT_OPTIONS = ["name"] as const;
type SortOption = typeof SORT_OPTIONS[number];

// Trie une liste d'objets par ordre alphabétique.
// Le tri se fait côté application car DynamoDB Scan ne garantit aucun ordre et ne supporte pas ORDER BY.
const sortItems = (
    items: Array<{ id: string } & Record<string, unknown>>,
    sort?: SortOption
) => {
    if (!sort) {
        return items;
    }

    const sorted = [...items];
    sorted.sort((a, b) => (a.Name as string).localeCompare(b.Name as string, "fr"));

    return sorted;
};

const listItems = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
        // Récupération du paramètre "type" depuis l'URL (ex: ?type=arme&type=armure)
        // Les HTTP API d'API Gateway fusionnent les valeurs dupliquées dans une seule chaîne séparée par des virgules
        const rawTypeFilter = event.queryStringParameters?.type;
        const typeFilters = rawTypeFilter
            ? rawTypeFilter.split(",").map((type) => type.trim()).filter(Boolean)
            : [];

        // Tri optionnel du résultat : ?sort=name (alphabétique)
        const rawSort = event.queryStringParameters?.sort;
        const sort = SORT_OPTIONS.includes(rawSort as SortOption) ? (rawSort as SortOption) : undefined;

        const { count, items } = await scanItems(typeFilters);

        return successResponse({
            count,
            filterApplied: {
                type: typeFilters.length > 0 ? typeFilters : "none"
            },
            sortApplied: sort ?? "none",
            // Informations minimales uniquement (nom, type, caractéristiques d'arme / d'armure) pour garder
            // le body léger ; le lien "self" permet au client de retrouver le détail complet de l'objet
            items: sortItems(items, sort).map(({ id, ...item }) => ({
                id,
                ...item,
                _self: buildItemSelfLink(event, id)
            }))
        });

    } catch (error) {
        console.error("Erreur lors de la lecture de DynamoDB:", error);
        return errorResponse("Impossible de récupérer les objets", error as Error);
    }
};

const getItem = async (event: APIGatewayProxyEventV2, itemId: string): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
        const item = await getItemById(itemId);

        if (!item) {
            return notFoundResponse(`Aucun objet trouvé pour l'identifiant "${itemId}"`);
        }

        return successResponse({
            ...item,
            _self: buildItemSelfLink(event, itemId)
        });

    } catch (error) {
        console.error("Erreur lors de la lecture de DynamoDB:", error);
        return errorResponse("Impossible de récupérer l'objet", error as Error);
    }
};
