import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, tableName } from "./dynamoClient";
import { normalizeCategory, normalizeForComparison } from "./normalize";

const FEAT_ID_PREFIX = "FEAT#";

// Récupère la liste des dons (FEAT#), éventuellement filtrés par catégorie.
// Le filtre catégorie est appliqué côté application (et non via DynamoDB FilterExpression) :
// le mot-clé fourni (ex: "general", "combat") est recherché dans le nom de catégorie une fois
// le préfixe "don"/"don de"/"don d'" retiré, insensible aux accents et à la casse
// (ex: "combat" matche la catégorie "don de style de combat").
// Ne remonte que les informations minimales (nom, catégorie, prérequis) afin de garder le body léger :
// le détail complet d'un don est disponible via getFeatById.
export const scanFeats = async (categoryFilters: string[]) => {
    const command = new ScanCommand({
        TableName: tableName,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :metadata",
        ProjectionExpression: "PK, #pName, #pCategory, #pPrerequisites",
        ExpressionAttributeValues: {
            ":prefix": FEAT_ID_PREFIX,
            ":metadata": "METADATA"
        },
        ExpressionAttributeNames: {
            "#pName": "Name",
            "#pCategory": "Category",
            "#pPrerequisites": "Prerequisites"
        }
    });

    const data = await docClient.send(command);
    let items = data.Items ?? [];

    if (categoryFilters.length > 0) {
        const normalizedFilters = categoryFilters.map(normalizeForComparison);
        items = items.filter((item) => {
            const normalizedCategory = normalizeCategory(item.Category as string);
            return normalizedFilters.some((filter) => normalizedCategory.includes(filter));
        });
    }

    return {
        count: items.length,
        feats: items.map(({ PK, SK, ...feat }) => ({
            id: (PK as string).slice(FEAT_ID_PREFIX.length),
            ...feat
        }))
    };
};

// Récupère le détail complet d'un don à partir de son identifiant (slug), ou undefined s'il n'existe pas
export const getFeatById = async (id: string) => {
    const command = new GetCommand({
        TableName: tableName,
        Key: {
            PK: `${FEAT_ID_PREFIX}${id}`,
            SK: "METADATA"
        }
    });

    const data = await docClient.send(command);

    if (!data.Item) {
        return undefined;
    }

    const { PK, SK, ...feat } = data.Item;

    return { id, ...feat };
};
