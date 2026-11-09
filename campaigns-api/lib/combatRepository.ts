import { randomUUID } from "node:crypto";
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, tableName } from "@dndcloud/core";
import type { CombatData } from "./combatValidation";

// Une campagne a plusieurs combats : PK = CAMPAIGN#<id>, SK = COMBAT#<combatId>. Un seul combat à la fois peut
// être lancé (statut autre que PREPARING) : c'est celui que voient les joueurs.
//   Status "PREPARING" : le MJ définit les ennemis, les joueurs ne voient rien
//   Status "INITIATIVE" : combat lancé, chaque joueur envoie son initiative (Initiatives[userId])
export const PREPARING = "PREPARING";
export const INITIATIVE = "INITIATIVE";
//   Status "ORDER" : toutes les initiatives sont connues, Order donne l'ordre de jeu (modifiable par le MJ)
//   Status "RUNNING" : le MJ a démarré le combat, l'ordre de jeu devient visible des joueurs
export const ORDER = "ORDER";
export const RUNNING = "RUNNING";
export type CombatStatus = typeof PREPARING | typeof INITIATIVE | typeof ORDER | typeof RUNNING;

export interface Enemy {
    id: string;
    Name: string;
    Initiative: number;
}

// Un participant dans l'ordre de jeu : id = UserId pour un joueur, id de l'ennemi sinon
export interface OrderEntry {
    id: string;
    Name: string;
    Initiative: number;
    Bonus: number;
    Enemy: boolean;
}

export interface Combat {
    id: string;
    Name: string;
    Status: CombatStatus;
    Enemies: Enemy[];
    // Initiative de chaque joueur, indexée par UserId
    Initiatives: Record<string, number>;
    // Bonus d'initiative de chaque joueur au moment de son jet, pour départager les égalités
    Bonuses: Record<string, number>;
    Order?: OrderEntry[];
    CreatedAt: string;
    UpdatedAt: string;
}

export const COMBAT_PREFIX = "COMBAT#";
const combatKey = (campaignId: string, combatId: string) => ({ PK: `CAMPAIGN#${campaignId}`, SK: `${COMBAT_PREFIX}${combatId}` });

const isConditionalCheckFailed = (error: unknown) => (error as Error)?.name === "ConditionalCheckFailedException";

const toCombat = (item: Record<string, unknown>) => {
    const { PK, SK, ...combat } = item;
    return { id: (SK as string).slice(COMBAT_PREFIX.length), ...combat } as unknown as Combat;
};

export const getCombat = async (campaignId: string, combatId: string) => {
    const data = await docClient.send(new GetCommand({ TableName: tableName, Key: combatKey(campaignId, combatId) }));
    return data.Item ? toCombat(data.Item) : undefined;
};

// Query paginée sur le préfixe COMBAT# de la campagne ; les clés seules suffisent à supprimer
const queryCombats = async (campaignId: string, keysOnly: boolean) => {
    const items: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
        const data = await docClient.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues: { ":pk": `CAMPAIGN#${campaignId}`, ":prefix": COMBAT_PREFIX },
            ...(keysOnly && { ProjectionExpression: "PK, SK" }),
            ExclusiveStartKey: lastKey
        }));
        items.push(...(data.Items ?? []));
        lastKey = data.LastEvaluatedKey;
    } while (lastKey);

    return items;
};

// Tous les combats de la campagne, du plus ancien au plus récent
export const listCombats = async (campaignId: string) =>
    (await queryCombats(campaignId, false)).map(toCombat).sort((a, b) => a.CreatedAt.localeCompare(b.CreatedAt));

export const listCombatKeys = async (campaignId: string) =>
    (await queryCombats(campaignId, true)).map(({ PK, SK }) => ({ PK, SK }));

export const isActive = (combat: Combat) => combat.Status !== PREPARING;

const newEnemies = (data: CombatData) => data.Enemies.map((enemy) => ({ id: randomUUID(), ...enemy }));

// Crée un combat en préparation
export const createCombat = async (campaignId: string, data: CombatData) => {
    const now = new Date().toISOString();
    const item = {
        ...combatKey(campaignId, randomUUID()),
        Name: data.Name,
        Status: PREPARING,
        Enemies: newEnemies(data),
        Initiatives: {},
        Bonuses: {},
        CreatedAt: now,
        UpdatedAt: now
    };

    await docClient.send(new PutCommand({ TableName: tableName, Item: item, ConditionExpression: "attribute_not_exists(PK)" }));
    return toCombat(item);
};

// Modifie un combat en préparation. Retourne undefined s'il n'existe plus ou s'il est déjà lancé.
export const updateCombat = async (campaignId: string, combatId: string, data: CombatData) => {
    try {
        const result = await docClient.send(new UpdateCommand({
            TableName: tableName,
            Key: combatKey(campaignId, combatId),
            UpdateExpression: "SET #name = :name, Enemies = :enemies, UpdatedAt = :now",
            ConditionExpression: "attribute_exists(PK) AND #status = :preparing",
            ExpressionAttributeNames: { "#name": "Name", "#status": "Status" },
            ExpressionAttributeValues: { ":name": data.Name, ":enemies": newEnemies(data), ":preparing": PREPARING, ":now": new Date().toISOString() },
            ReturnValues: "ALL_NEW"
        }));
        return toCombat(result.Attributes!);
    } catch (error) {
        if (isConditionalCheckFailed(error)) return undefined;
        throw error;
    }
};

// Lance le combat : les joueurs peuvent désormais envoyer leur initiative. Retourne undefined s'il n'y a pas de
// combat en préparation.
export const startCombat = async (campaignId: string, combatId: string) => {
    try {
        const data = await docClient.send(new UpdateCommand({
            TableName: tableName,
            Key: combatKey(campaignId, combatId),
            UpdateExpression: "SET #status = :initiative, UpdatedAt = :now",
            ConditionExpression: "attribute_exists(PK) AND #status = :preparing",
            ExpressionAttributeNames: { "#status": "Status" },
            ExpressionAttributeValues: { ":initiative": INITIATIVE, ":preparing": PREPARING, ":now": new Date().toISOString() },
            ReturnValues: "ALL_NEW"
        }));
        return toCombat(data.Attributes!);
    } catch (error) {
        if (isConditionalCheckFailed(error)) return undefined;
        throw error;
    }
};

// Enregistre l'initiative d'un joueur. Retourne undefined si aucun combat n'attend les initiatives.
export const setInitiative = async (campaignId: string, combatId: string, userId: string, initiative: number, bonus: number) => {
    try {
        const data = await docClient.send(new UpdateCommand({
            TableName: tableName,
            Key: combatKey(campaignId, combatId),
            UpdateExpression: "SET Initiatives.#user = :initiative, Bonuses.#user = :bonus, UpdatedAt = :now",
            ConditionExpression: "attribute_exists(PK) AND #status = :initiative_status",
            ExpressionAttributeNames: { "#user": userId, "#status": "Status" },
            ExpressionAttributeValues: { ":initiative": initiative, ":initiative_status": INITIATIVE, ":bonus": bonus, ":now": new Date().toISOString() },
            ReturnValues: "ALL_NEW"
        }));
        return toCombat(data.Attributes!);
    } catch (error) {
        if (isConditionalCheckFailed(error)) return undefined;
        throw error;
    }
};

export const deleteCombat = async (campaignId: string, combatId: string) => {
    await docClient.send(new DeleteCommand({ TableName: tableName, Key: combatKey(campaignId, combatId) }));
};

// Modificateur de Dextérité du personnage, utilisé comme bonus d'initiative (0 si le personnage est introuvable)
export const getDexterityModifier = async (userId: string, characterId: string) => {
    const data = await docClient.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `USER#${userId}`, SK: `CHARACTER#${characterId}` },
        ProjectionExpression: "Abilities"
    }));
    const dexterity = data.Item?.Abilities?.Dexterity;
    return typeof dexterity === "number" ? Math.floor((dexterity - 10) / 2) : 0;
};

// Fixe l'ordre de jeu et passe le combat en phase ORDER. Retourne undefined si le combat n'attend plus d'ordre
// (déjà calculé par un autre joueur, ou terminé).
export const publishOrder = async (campaignId: string, combatId: string, order: OrderEntry[]) => {
    try {
        const data = await docClient.send(new UpdateCommand({
            TableName: tableName,
            Key: combatKey(campaignId, combatId),
            UpdateExpression: "SET #status = :order, #order = :entries, UpdatedAt = :now",
            ConditionExpression: "attribute_exists(PK) AND #status = :initiative",
            ExpressionAttributeNames: { "#status": "Status", "#order": "Order" },
            ExpressionAttributeValues: { ":order": ORDER, ":initiative": INITIATIVE, ":entries": order, ":now": new Date().toISOString() },
            ReturnValues: "ALL_NEW"
        }));
        return toCombat(data.Attributes!);
    } catch (error) {
        if (isConditionalCheckFailed(error)) return undefined;
        throw error;
    }
};

// Le MJ réordonne les participants (même ensemble, autre ordre), avant ou après le démarrage du combat.
// Retourne undefined hors phases ORDER et RUNNING.
// `enemies` remplace la liste des ennemis quand des ennemis ont été ajoutés.
export const reorder = async (campaignId: string, combatId: string, order: OrderEntry[], enemies?: Enemy[]) => {
    try {
        const data = await docClient.send(new UpdateCommand({
            TableName: tableName,
            Key: combatKey(campaignId, combatId),
            UpdateExpression: `SET #order = :entries, UpdatedAt = :now${enemies ? ", Enemies = :enemies" : ""}`,
            ConditionExpression: "attribute_exists(PK) AND (#status = :order OR #status = :running)",
            ExpressionAttributeNames: { "#status": "Status", "#order": "Order" },
            ExpressionAttributeValues: { ":order": ORDER, ":running": RUNNING, ":entries": order, ":now": new Date().toISOString(), ...(enemies && { ":enemies": enemies }) },
            ReturnValues: "ALL_NEW"
        }));
        return toCombat(data.Attributes!);
    } catch (error) {
        if (isConditionalCheckFailed(error)) return undefined;
        throw error;
    }
};

// Le MJ démarre le combat : l'ordre de jeu devient visible des joueurs. Retourne undefined si le combat n'est pas en
// phase ORDER (initiatives encore attendues, ou déjà démarré).
export const beginCombat = async (campaignId: string, combatId: string) => {
    try {
        const data = await docClient.send(new UpdateCommand({
            TableName: tableName,
            Key: combatKey(campaignId, combatId),
            UpdateExpression: "SET #status = :running, UpdatedAt = :now",
            ConditionExpression: "attribute_exists(PK) AND #status = :order",
            ExpressionAttributeNames: { "#status": "Status" },
            ExpressionAttributeValues: { ":order": ORDER, ":running": RUNNING, ":now": new Date().toISOString() },
            ReturnValues: "ALL_NEW"
        }));
        return toCombat(data.Attributes!);
    } catch (error) {
        if (isConditionalCheckFailed(error)) return undefined;
        throw error;
    }
};
