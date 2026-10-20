import { randomUUID } from "node:crypto";
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, tableName } from "@dndcloud/core";
import type { CharacterData, CharacterPatch } from "./validation";

// Un personnage appartient à un utilisateur Cognito (claim "sub") : PK = USER#<sub>, SK = CHARACTER#<id>.
// Toutes les opérations sont scopées par PK, donc un utilisateur ne peut jamais lire ni modifier le
// personnage d'un autre, même en devinant son identifiant.
const USER_PREFIX = "USER#";
const CHARACTER_PREFIX = "CHARACTER#";

const keyOf = (ownerId: string, id: string) => ({ PK: `${USER_PREFIX}${ownerId}`, SK: `${CHARACTER_PREFIX}${id}` });

const toCharacter = ({ PK, SK, ...character }: Record<string, unknown>) => ({
    id: (SK as string).slice(CHARACTER_PREFIX.length),
    ...character
});

const isConditionalCheckFailed = (error: unknown) => (error as Error)?.name === "ConditionalCheckFailedException";

// Liste les personnages d'un utilisateur. Seules les informations de résumé sont remontées pour garder
// le body léger : le détail complet est disponible via getCharacter.
export const listCharacters = async (ownerId: string) => {
    const items: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
        const data = await docClient.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
            ProjectionExpression: "SK, #pName, #pClass, #pSpecies, #pLevel, #pHitPoints, #pUpdatedAt",
            ExpressionAttributeNames: {
                "#pName": "Name",
                "#pClass": "Class",
                "#pSpecies": "Species",
                "#pLevel": "Level",
                "#pHitPoints": "HitPoints",
                "#pUpdatedAt": "UpdatedAt"
            },
            ExpressionAttributeValues: { ":pk": `${USER_PREFIX}${ownerId}`, ":prefix": CHARACTER_PREFIX },
            ExclusiveStartKey: lastKey
        }));
        items.push(...(data.Items ?? []));
        lastKey = data.LastEvaluatedKey;
    } while (lastKey);

    return { count: items.length, characters: items.map(toCharacter) };
};

export const getCharacter = async (ownerId: string, id: string) => {
    const data = await docClient.send(new GetCommand({ TableName: tableName, Key: keyOf(ownerId, id) }));
    return data.Item ? toCharacter(data.Item) : undefined;
};

export const createCharacter = async (ownerId: string, character: CharacterData) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const item = { ...keyOf(ownerId, id), ...character, CreatedAt: now, UpdatedAt: now };

    await docClient.send(new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)"
    }));

    return toCharacter(item);
};

// Mise à jour partielle : seuls les champs fournis sont modifiés, y compris à l'intérieur de
// Abilities / HitPoints (ex: { HitPoints: { Current: 5 } } ne touche ni Max ni Temporary).
// Retourne undefined si le personnage n'existe pas.
export const updateCharacter = async (ownerId: string, id: string, patch: CharacterPatch) => {
    const names: Record<string, string> = { "#UpdatedAt": "UpdatedAt" };
    const values: Record<string, unknown> = { ":UpdatedAt": new Date().toISOString() };
    const assignments = ["#UpdatedAt = :UpdatedAt"];

    // Les noms de champs viennent de la liste blanche de validatePatch : pas d'injection possible
    const assign = (path: string[], value: unknown) => {
        path.forEach((segment) => { names[`#${segment}`] = segment; });
        const placeholder = `:${path.join("_")}`;
        values[placeholder] = value;
        assignments.push(`${path.map((segment) => `#${segment}`).join(".")} = ${placeholder}`);
    };

    for (const [field, value] of Object.entries(patch)) {
        if (field === "Abilities" || field === "HitPoints") {
            for (const [key, number] of Object.entries(value as Record<string, number>)) {
                assign([field, key], number);
            }
        } else {
            assign([field], value);
        }
    }

    try {
        const data = await docClient.send(new UpdateCommand({
            TableName: tableName,
            Key: keyOf(ownerId, id),
            UpdateExpression: `SET ${assignments.join(", ")}`,
            ConditionExpression: "attribute_exists(PK)",
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
            ReturnValues: "ALL_NEW"
        }));
        return toCharacter(data.Attributes!);
    } catch (error) {
        if (isConditionalCheckFailed(error)) return undefined;
        throw error;
    }
};

// Retourne false si le personnage n'existe pas
export const deleteCharacter = async (ownerId: string, id: string) => {
    try {
        await docClient.send(new DeleteCommand({
            TableName: tableName,
            Key: keyOf(ownerId, id),
            ConditionExpression: "attribute_exists(PK)"
        }));
        return true;
    } catch (error) {
        if (isConditionalCheckFailed(error)) return false;
        throw error;
    }
};
