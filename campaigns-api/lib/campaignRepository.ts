import { randomBytes, randomUUID } from "node:crypto";
import type { BatchGetCommandOutput } from "@aws-sdk/lib-dynamodb";
import { BatchGetCommand, BatchWriteCommand, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, tableName } from "@dndcloud/core";
import type { CampaignData, CampaignPatch } from "./validation";

// Modèle single-table. Une campagne regroupe plusieurs items :
//   PK = CAMPAIGN#<id>, SK = METADATA          les données de la campagne (+ InviteCode courant)
//   PK = CAMPAIGN#<id>, SK = MEMBER#<userId>   un membre : Role ("GM" | "PLAYER"), CharacterId, JoinedAt
//   PK = USER#<sub>,    SK = CAMPAIGN#<id>     index inverse pour lister les campagnes d'un utilisateur
//   PK = INVITE#<code>, SK = INVITE            résolution d'un lien d'invitation vers sa campagne
// L'accès à une campagne passe toujours par le membership de l'appelant (getMember) : un non-membre
// ne peut ni lire ni modifier une campagne, même en devinant son identifiant.
export const GM = "GM";
export const PLAYER = "PLAYER";
export type Role = typeof GM | typeof PLAYER;

const USER_PREFIX = "USER#";
const CHARACTER_PREFIX = "CHARACTER#";
const CAMPAIGN_PREFIX = "CAMPAIGN#";
const MEMBER_PREFIX = "MEMBER#";
const INVITE_PREFIX = "INVITE#";
const METADATA = "METADATA";

const campaignKey = (id: string) => ({ PK: `${CAMPAIGN_PREFIX}${id}`, SK: METADATA });
const memberKey = (id: string, userId: string) => ({ PK: `${CAMPAIGN_PREFIX}${id}`, SK: `${MEMBER_PREFIX}${userId}` });
const userCampaignKey = (userId: string, id: string) => ({ PK: `${USER_PREFIX}${userId}`, SK: `${CAMPAIGN_PREFIX}${id}` });
const inviteKey = (code: string) => ({ PK: `${INVITE_PREFIX}${code}`, SK: "INVITE" });

export interface Campaign extends CampaignData {
    id: string;
    GameMasterId: string;
    InviteCode: string;
    CreatedAt: string;
    UpdatedAt: string;
}

export interface Member {
    UserId: string;
    Role: Role;
    CharacterId?: string;
    JoinedAt: string;
}

const toCampaign = (item: Record<string, unknown>) => {
    const { PK, SK, ...campaign } = item;
    return { id: (PK as string).slice(CAMPAIGN_PREFIX.length), ...campaign } as unknown as Campaign;
};

const toMember = ({ SK, Role, CharacterId, JoinedAt }: Record<string, unknown>) => ({
    UserId: (SK as string).slice(MEMBER_PREFIX.length),
    Role,
    JoinedAt,
    ...(CharacterId !== undefined && { CharacterId })
}) as Member;

const isConditionalCheckFailed = (error: unknown) => (error as Error)?.name === "ConditionalCheckFailedException";
const isTransactionCanceled = (error: unknown) => (error as Error)?.name === "TransactionCanceledException";

const chunk = <T>(items: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
};

// Code secret et non devinable (128 bits) embarqué dans le lien d'invitation
const newInviteCode = () => randomBytes(16).toString("base64url");

// Query paginée de tous les items d'une partition dont la SK commence par un préfixe
const queryAll = async (pk: string, prefix: string, projection?: Partial<{ ProjectionExpression: string; ExpressionAttributeNames: Record<string, string> }>) => {
    const items: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
        const data = await docClient.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues: { ":pk": pk, ":prefix": prefix },
            ...projection,
            ExclusiveStartKey: lastKey
        }));
        items.push(...(data.Items ?? []));
        lastKey = data.LastEvaluatedKey;
    } while (lastKey);

    return items;
};

// BatchGet par paquets de 100 (limite DynamoDB), en rejouant les clés non traitées
const batchGet = async (keys: Record<string, unknown>[]) => {
    const items: Record<string, unknown>[] = [];

    for (const group of chunk(keys, 100)) {
        let pending: Record<string, unknown>[] | undefined = group;
        while (pending && pending.length > 0) {
            const data: BatchGetCommandOutput = await docClient.send(new BatchGetCommand({ RequestItems: { [tableName]: { Keys: pending } } }));
            items.push(...(data.Responses?.[tableName] ?? []));
            pending = data.UnprocessedKeys?.[tableName]?.Keys;
        }
    }

    return items;
};

// L'utilisateur qui crée la campagne en devient le Maître du jeu (MJ)
export const createCampaign = async (userId: string, data: CampaignData) => {
    const id = randomUUID();
    const inviteCode = newInviteCode();
    const now = new Date().toISOString();
    const item = { ...campaignKey(id), ...data, GameMasterId: userId, InviteCode: inviteCode, CreatedAt: now, UpdatedAt: now };
    const notExists = "attribute_not_exists(PK)";

    await docClient.send(new TransactWriteCommand({
        TransactItems: [
            { Put: { TableName: tableName, Item: item, ConditionExpression: notExists } },
            { Put: { TableName: tableName, Item: { ...memberKey(id, userId), Role: GM, JoinedAt: now }, ConditionExpression: notExists } },
            { Put: { TableName: tableName, Item: { ...userCampaignKey(userId, id), Role: GM }, ConditionExpression: notExists } },
            { Put: { TableName: tableName, Item: { ...inviteKey(inviteCode), CampaignId: id }, ConditionExpression: notExists } }
        ]
    }));

    return toCampaign(item);
};

export const getCampaign = async (id: string) => {
    const data = await docClient.send(new GetCommand({ TableName: tableName, Key: campaignKey(id) }));
    return data.Item ? toCampaign(data.Item) : undefined;
};

export const getMember = async (id: string, userId: string) => {
    const data = await docClient.send(new GetCommand({ TableName: tableName, Key: memberKey(id, userId) }));
    return data.Item ? toMember(data.Item) : undefined;
};

export const listMembers = async (id: string) =>
    (await queryAll(`${CAMPAIGN_PREFIX}${id}`, MEMBER_PREFIX)).map(toMember);

// Campagnes d'un utilisateur (MJ ou joueur), avec son rôle dans chacune
export const listCampaigns = async (userId: string) => {
    const pointers = await queryAll(`${USER_PREFIX}${userId}`, CAMPAIGN_PREFIX);
    const roles = new Map(pointers.map((pointer) => [(pointer.SK as string).slice(CAMPAIGN_PREFIX.length), pointer.Role as Role]));

    const campaigns = await batchGet([...roles.keys()].map(campaignKey));

    return campaigns.map((item) => {
        const { id, Name, Description, GameMasterId, UpdatedAt } = toCampaign(item);
        return { id, Name, Description, GameMasterId, UpdatedAt, Role: roles.get(id)! };
    });
};

// Résumés (nom, classe, espèce, niveau) des personnages choisis par les membres, indexés par CharacterId.
// Un personnage supprimé depuis son choix est simplement absent du résultat.
export const getCharacterSummaries = async (members: Member[]) => {
    const withCharacter = members.filter((member) => member.CharacterId);
    const items = await batchGet(withCharacter.map((member) => ({
        PK: `${USER_PREFIX}${member.UserId}`,
        SK: `${CHARACTER_PREFIX}${member.CharacterId}`
    })));

    return new Map(items.map(({ PK, SK, Name, Class, Species, Level }) => [
        `${(PK as string).slice(USER_PREFIX.length)}/${(SK as string).slice(CHARACTER_PREFIX.length)}`,
        { id: (SK as string).slice(CHARACTER_PREFIX.length), Name, Class, Species, Level }
    ]));
};

// Vrai si le personnage existe et appartient bien à l'utilisateur
export const ownsCharacter = async (userId: string, characterId: string) => {
    const data = await docClient.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `${USER_PREFIX}${userId}`, SK: `${CHARACTER_PREFIX}${characterId}` },
        ProjectionExpression: "SK"
    }));
    return Boolean(data.Item);
};

// Retourne undefined si la campagne n'existe pas
export const updateCampaign = async (id: string, patch: CampaignPatch) => {
    const names: Record<string, string> = { "#UpdatedAt": "UpdatedAt" };
    const values: Record<string, unknown> = { ":UpdatedAt": new Date().toISOString() };
    const assignments = ["#UpdatedAt = :UpdatedAt"];

    // Les noms de champs viennent de la liste blanche de validatePatch : pas d'injection possible
    for (const [field, value] of Object.entries(patch)) {
        names[`#${field}`] = field;
        values[`:${field}`] = value;
        assignments.push(`#${field} = :${field}`);
    }

    try {
        const data = await docClient.send(new UpdateCommand({
            TableName: tableName,
            Key: campaignKey(id),
            UpdateExpression: `SET ${assignments.join(", ")}`,
            ConditionExpression: "attribute_exists(PK)",
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
            ReturnValues: "ALL_NEW"
        }));
        return toCampaign(data.Attributes!);
    } catch (error) {
        if (isConditionalCheckFailed(error)) return undefined;
        throw error;
    }
};

// Supprime la campagne, ses membres, leurs entrées d'index et son lien d'invitation. Pas atomique (plus de
// 100 items possibles) : on supprime d'abord les entrées annexes et la fiche METADATA en dernier, pour
// qu'une suppression interrompue reste rejouable par le MJ.
export const deleteCampaign = async (campaign: Campaign) => {
    const members = await listMembers(campaign.id);
    const remove = async (keys: Record<string, unknown>[]) => {
        for (const group of chunk(keys, 25)) {
            let pending: Record<string, unknown>[] = group;
            while (pending.length > 0) {
                const data = await docClient.send(new BatchWriteCommand({
                    RequestItems: { [tableName]: pending.map((Key) => ({ DeleteRequest: { Key } })) }
                }));
                pending = (data.UnprocessedItems?.[tableName] ?? []).map((request) => request.DeleteRequest!.Key!);
            }
        }
    };

    await remove([...members.map((member) => userCampaignKey(member.UserId, campaign.id)), inviteKey(campaign.InviteCode)]);
    await remove(members.map((member) => memberKey(campaign.id, member.UserId)));
    await remove([campaignKey(campaign.id)]);
};

// Remplace le lien d'invitation : l'ancien code cesse immédiatement de fonctionner
export const regenerateInvite = async (campaign: Campaign) => {
    const inviteCode = newInviteCode();
    const now = new Date().toISOString();

    await docClient.send(new TransactWriteCommand({
        TransactItems: [
            { Delete: { TableName: tableName, Key: inviteKey(campaign.InviteCode) } },
            { Put: { TableName: tableName, Item: { ...inviteKey(inviteCode), CampaignId: campaign.id }, ConditionExpression: "attribute_not_exists(PK)" } },
            {
                Update: {
                    TableName: tableName,
                    Key: campaignKey(campaign.id),
                    UpdateExpression: "SET InviteCode = :code, UpdatedAt = :now",
                    ConditionExpression: "attribute_exists(PK)",
                    ExpressionAttributeValues: { ":code": inviteCode, ":now": now }
                }
            }
        ]
    }));

    return { ...campaign, InviteCode: inviteCode, UpdatedAt: now };
};

// Id de la campagne désignée par un code d'invitation, ou undefined si le code est inconnu ou périmé
export const findCampaignIdByInvite = async (code: string) => {
    const data = await docClient.send(new GetCommand({ TableName: tableName, Key: inviteKey(code) }));
    return data.Item?.CampaignId as string | undefined;
};

// Ajoute un joueur à la campagne. Retourne false s'il en est déjà membre.
export const addPlayer = async (id: string, userId: string, characterId?: string) => {
    const now = new Date().toISOString();

    try {
        await docClient.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Put: {
                        TableName: tableName,
                        Item: { ...memberKey(id, userId), Role: PLAYER, JoinedAt: now, ...(characterId && { CharacterId: characterId }) },
                        ConditionExpression: "attribute_not_exists(PK)"
                    }
                },
                { Put: { TableName: tableName, Item: { ...userCampaignKey(userId, id), Role: PLAYER } } },
                // Garde-fou : la campagne a pu être supprimée entre la résolution du code et l'ajout
                { ConditionCheck: { TableName: tableName, Key: campaignKey(id), ConditionExpression: "attribute_exists(PK)" } }
            ]
        }));
        return true;
    } catch (error) {
        if (isTransactionCanceled(error)) return false;
        throw error;
    }
};

// Associe (ou remplace) le personnage d'un joueur dans la campagne. Retourne false s'il n'en est pas membre.
export const setMemberCharacter = async (id: string, userId: string, characterId: string) => {
    try {
        await docClient.send(new UpdateCommand({
            TableName: tableName,
            Key: memberKey(id, userId),
            UpdateExpression: "SET CharacterId = :characterId",
            ConditionExpression: "attribute_exists(PK)",
            ExpressionAttributeValues: { ":characterId": characterId }
        }));
        return true;
    } catch (error) {
        if (isConditionalCheckFailed(error)) return false;
        throw error;
    }
};
