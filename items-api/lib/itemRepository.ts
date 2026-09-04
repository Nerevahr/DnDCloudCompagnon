import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, tableName, normalizeForComparison } from "@dndcloud/core";

const ITEM_ID_PREFIX = "ITEM#";

// Récupère la liste des objets (ITEM#), éventuellement filtrés par type.
// Le filtre type est appliqué côté application (et non via DynamoDB FilterExpression) :
// le mot-clé fourni (ex: "arme", "armure") est recherché dans le type de l'objet,
// insensible aux accents et à la casse, en correspondance partielle
// (ex: "arm" matche à la fois "Arme" et "Armure").
// Ne remonte que les informations utiles à l'affichage d'une liste (nom, type et
// caractéristiques d'arme / d'armure) afin de garder le body léger : la description
// complète d'un objet est disponible via getItemById.
export const scanItems = async (typeFilters: string[]) => {
    const command = new ScanCommand({
        TableName: tableName,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :metadata",
        ProjectionExpression:
            "PK, #pName, #pType, WeaponType, DamageDice, DamageType, ArmorCategory, BaseArmorClass",
        ExpressionAttributeValues: {
            ":prefix": ITEM_ID_PREFIX,
            ":metadata": "METADATA"
        },
        ExpressionAttributeNames: {
            "#pName": "Name",
            "#pType": "Type"
        }
    });

    const data = await docClient.send(command);
    let items = data.Items ?? [];

    if (typeFilters.length > 0) {
        const normalizedFilters = typeFilters.map(normalizeForComparison);
        items = items.filter((item) => {
            const normalizedType = normalizeForComparison(item.Type as string);
            return normalizedFilters.some((filter) => normalizedType.includes(filter));
        });
    }

    return {
        count: items.length,
        items: items.map(({ PK, SK, ...item }) => ({
            id: (PK as string).slice(ITEM_ID_PREFIX.length),
            ...item
        }))
    };
};

// Récupère le détail complet d'un objet à partir de son identifiant (slug), ou undefined s'il n'existe pas
export const getItemById = async (id: string) => {
    const command = new GetCommand({
        TableName: tableName,
        Key: {
            PK: `${ITEM_ID_PREFIX}${id}`,
            SK: "METADATA"
        }
    });

    const data = await docClient.send(command);

    if (!data.Item) {
        return undefined;
    }

    const { PK, SK, ...item } = data.Item;

    return { id, ...item };
};
