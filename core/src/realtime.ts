import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { BatchWriteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, tableName } from "./dynamoClient";

// Connexions WebSocket des membres d'une campagne en cours de partie (modèle single-table) :
//   PK = CAMPAIGN#<id>,       SK = CONN#<connectionId>   UserId, Role, ConnectedAt, ExpiresAt (TTL)
//   PK = CONN#<connectionId>, SK = CONN                  CampaignId (pour retrouver la campagne à la déconnexion)
export const CAMPAIGN_PREFIX = "CAMPAIGN#";
export const CONNECTION_PREFIX = "CONN#";

export interface Connection {
    connectionId: string;
    UserId: string;
    Role: string;
}

// Messages poussés aux clients ; ils ne portent aucune donnée de jeu : le client relit l'API REST (source de vérité)
export type RealtimeMessage =
    // Joueurs actuellement connectés à la partie
    | { type: "presence"; Present: string[] }
    // Un combat a changé (créé, lancé, initiative reçue, ordre modifié, terminé...)
    | { type: "combat" };

export const connectionKey = (campaignId: string, connectionId: string) => ({ PK: `${CAMPAIGN_PREFIX}${campaignId}`, SK: `${CONNECTION_PREFIX}${connectionId}` });
export const connectionLookupKey = (connectionId: string) => ({ PK: `${CONNECTION_PREFIX}${connectionId}`, SK: "CONN" });

export const listConnections = async (campaignId: string): Promise<Connection[]> => {
    const connections: Connection[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
        const data = await docClient.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues: { ":pk": `${CAMPAIGN_PREFIX}${campaignId}`, ":prefix": CONNECTION_PREFIX },
            ExclusiveStartKey: lastKey
        }));
        for (const item of data.Items ?? []) {
            connections.push({ connectionId: (item.SK as string).slice(CONNECTION_PREFIX.length), UserId: item.UserId, Role: item.Role });
        }
        lastKey = data.LastEvaluatedKey;
    } while (lastKey);

    return connections;
};

// Identifiants (dédoublonnés : plusieurs onglets) des joueurs connectés. Le MJ n'est pas « présent » à la table.
export const presentPlayers = (connections: Connection[]) =>
    [...new Set(connections.filter((connection) => connection.Role === "PLAYER").map((connection) => connection.UserId))];

let management: ApiGatewayManagementApiClient | undefined;
const managementClient = (endpoint: string) =>
    management ??= new ApiGatewayManagementApiClient({ endpoint, region: process.env.AWS_REGION || "eu-west-3" });

// Envoie un message à une connexion. Retourne false si elle n'existe plus (déconnexion non vue).
const post = async (endpoint: string, connectionId: string, message: RealtimeMessage) => {
    try {
        await managementClient(endpoint).send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: Buffer.from(JSON.stringify(message)) }));
        return true;
    } catch (error) {
        if ((error as Error)?.name === "GoneException") return false;
        throw error;
    }
};

export const sendToConnection = async (connectionId: string, message: RealtimeMessage) => {
    const endpoint = process.env.WEBSOCKET_ENDPOINT;
    return endpoint ? post(endpoint, connectionId, message) : false;
};

// Pousse un message à toutes les connexions de la campagne (sauf `except`). Sans WEBSOCKET_ENDPOINT (tests, sam local)
// c'est un no-op, et une erreur d'envoi ne fait jamais échouer l'appelant : le temps réel n'est qu'un confort,
// les clients retombent sur la relecture périodique de l'API.
export const notifyCampaign = async (campaignId: string, message: RealtimeMessage, except?: string) => {
    const endpoint = process.env.WEBSOCKET_ENDPOINT;
    if (!endpoint) return;

    try {
        const targets = (await listConnections(campaignId)).filter((connection) => connection.connectionId !== except);
        const results = await Promise.allSettled(targets.map((connection) => post(endpoint, connection.connectionId, message)));

        // Connexions disparues sans $disconnect : on les retire pour ne plus les compter comme présentes
        const gone = targets.filter((_, index) => {
            const result = results[index]!;
            return result.status === "fulfilled" && !result.value;
        });
        for (let i = 0; i < gone.length; i += 12) {
            await docClient.send(new BatchWriteCommand({
                RequestItems: {
                    [tableName]: gone.slice(i, i + 12).flatMap((connection) => [
                        { DeleteRequest: { Key: connectionKey(campaignId, connection.connectionId) } },
                        { DeleteRequest: { Key: connectionLookupKey(connection.connectionId) } }
                    ])
                }
            }));
        }
    } catch (error) {
        console.error("Notification temps réel impossible:", error);
    }
};
