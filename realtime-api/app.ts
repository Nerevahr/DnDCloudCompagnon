import type { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from "aws-lambda";
import { DeleteCommand, GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { connectionKey, connectionLookupKey, docClient, listConnections, notifyCampaign, presentPlayers, sendToConnection, tableName } from "@dndcloud/core";
import { auth } from "./lib/auth";

// API WebSocket de la partie en cours. Un client se connecte à wss://.../prod?campaignId=<id>&token=<jeton d'accès> :
// la connexion est refusée si le jeton est invalide ou si l'utilisateur n'est pas membre de la campagne. Il est alors
// ajouté aux joueurs présents, et tous les membres connectés en sont informés. Les ordres de jeu (combat lancé...)
// sont poussés par campaigns-api via notifyCampaign.
type Event = APIGatewayProxyWebsocketEventV2 & { queryStringParameters?: Record<string, string | undefined> };
type Result = APIGatewayProxyResultV2;

// Durée de vie d'une ligne de connexion (TTL DynamoDB) : au-delà de la limite de 2 h d'une connexion API Gateway
const CONNECTION_TTL_SECONDS = 3 * 60 * 60;

const ok: Result = { statusCode: 200 };

export const lambdaHandler = async (event: Event): Promise<Result> => {
    switch (event.requestContext.routeKey) {
        case "$connect": return connect(event);
        case "$disconnect": return disconnect(event);
        default: return message(event);
    }
};

const connect = async (event: Event): Promise<Result> => {
    const { campaignId, token } = event.queryStringParameters ?? {};
    if (!campaignId || !token) return { statusCode: 400, body: "campaignId et token sont obligatoires" };

    const userId = await auth.verify(token);
    if (!userId) return { statusCode: 401, body: "Jeton invalide" };

    try {
        const member = (await docClient.send(new GetCommand({
            TableName: tableName,
            Key: { PK: `CAMPAIGN#${campaignId}`, SK: `MEMBER#${userId}` }
        }))).Item;
        // Non-membre et campagne inexistante sont indiscernables
        if (!member) return { statusCode: 403, body: "Accès refusé" };

        const { connectionId } = event.requestContext;
        const now = Date.now();
        await docClient.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Put: {
                        TableName: tableName,
                        Item: {
                            ...connectionKey(campaignId, connectionId),
                            UserId: userId,
                            Role: member.Role,
                            ConnectedAt: new Date(now).toISOString(),
                            ExpiresAt: Math.floor(now / 1000) + CONNECTION_TTL_SECONDS
                        }
                    }
                },
                {
                    Put: {
                        TableName: tableName,
                        Item: { ...connectionLookupKey(connectionId), CampaignId: campaignId, ExpiresAt: Math.floor(now / 1000) + CONNECTION_TTL_SECONDS }
                    }
                }
            ]
        }));

        // La connexion n'est pas encore établie : on prévient les autres, le nouvel arrivant demandera la présence
        await broadcastPresence(campaignId, connectionId);
        return ok;
    } catch (error) {
        console.error("Erreur lors de la connexion:", error);
        return { statusCode: 500, body: "Connexion impossible" };
    }
};

const disconnect = async (event: Event): Promise<Result> => {
    const { connectionId } = event.requestContext;

    try {
        const campaignId = await campaignOf(connectionId);
        if (!campaignId) return ok;

        await Promise.all([
            docClient.send(new DeleteCommand({ TableName: tableName, Key: connectionKey(campaignId, connectionId) })),
            docClient.send(new DeleteCommand({ TableName: tableName, Key: connectionLookupKey(connectionId) }))
        ]);
        await broadcastPresence(campaignId, connectionId);
    } catch (error) {
        console.error("Erreur lors de la déconnexion:", error);
    }
    return ok;
};

// Messages du client : "presence" (liste des joueurs présents, demandée à l'ouverture) et "ping" (maintien de la
// connexion, qui expire après 10 minutes d'inactivité)
const message = async (event: Event): Promise<Result> => {
    let action: unknown;
    try {
        action = JSON.parse(event.body ?? "{}").action;
    } catch { /* message illisible : ignoré */ }

    if (action === "presence") {
        try {
            const campaignId = await campaignOf(event.requestContext.connectionId);
            if (campaignId) {
                await sendToConnection(event.requestContext.connectionId, { type: "presence", Present: presentPlayers(await listConnections(campaignId)) });
            }
        } catch (error) {
            console.error("Erreur lors de l'envoi de la présence:", error);
        }
    }
    return ok;
};

const campaignOf = async (connectionId: string) =>
    (await docClient.send(new GetCommand({ TableName: tableName, Key: connectionLookupKey(connectionId) }))).Item?.CampaignId as string | undefined;

// Informe les membres connectés (sauf `except`) de la liste à jour des joueurs présents
const broadcastPresence = async (campaignId: string, except: string) =>
    notifyCampaign(campaignId, { type: "presence", Present: presentPlayers(await listConnections(campaignId)) }, except);
