import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import {
    successResponse,
    createdResponse,
    noContentResponse,
    badRequestResponse,
    unauthorizedResponse,
    forbiddenResponse,
    notFoundResponse,
    errorResponse,
    getUserId
} from "@dndcloud/core";
import {
    GM,
    PLAYER,
    addPlayer,
    createCampaign,
    deleteCampaign,
    findCampaignIdByInvite,
    getCampaign,
    getCharacterSummaries,
    getMember,
    listCampaigns,
    listMembers,
    ownsCharacter,
    regenerateInvite,
    setMemberCharacter,
    updateCampaign
} from "./lib/campaignRepository";
import type { Campaign, Member } from "./lib/campaignRepository";
import { buildCampaignSelfLink } from "./lib/links";
import { validateCharacterChoice, validateJoin, validateNewCampaign, validatePatch } from "./lib/validation";

type Event = APIGatewayProxyEventV2WithJWTAuthorizer;
type Result = APIGatewayProxyStructuredResultV2;

export const lambdaHandler = async (event: Event): Promise<Result> => {
    // Identifiant Cognito de l'utilisateur (voir getUserId)
    const userId = getUserId(event);
    if (typeof userId !== "string" || !userId) {
        return unauthorizedResponse("Utilisateur non identifié");
    }

    const campaignId = event.pathParameters?.id;
    const method = event.requestContext.http.method;
    const path = event.requestContext.http.path ?? "";

    if (!campaignId) {
        if (method === "GET") return list(event, userId);
        if (method === "POST" && path.endsWith("/join")) return join(event, userId);
        if (method === "POST") return create(event, userId);
    } else if (path.endsWith("/character")) {
        if (method === "PUT") return chooseCharacter(event, userId, campaignId);
    } else if (path.endsWith("/invite")) {
        if (method === "POST") return renewInvite(event, userId, campaignId);
    } else {
        if (method === "GET") return get(event, userId, campaignId);
        if (method === "PATCH") return update(event, userId, campaignId);
        if (method === "DELETE") return remove(userId, campaignId);
    }

    return { statusCode: 405, body: JSON.stringify({ error: `Méthode ${method} non supportée` }) };
};

// Retourne le corps JSON de la requête, ou undefined s'il est absent ou invalide
const parseBody = (event: Event): unknown => {
    if (!event.body) return undefined;
    try {
        return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body);
    } catch {
        return undefined;
    }
};

// Représentation détaillée d'une campagne pour un de ses membres : la fiche, la liste des membres avec le
// résumé de leur personnage, et ce qui reste à faire pour l'appelant. Seul le MJ voit le code et le lien
// d'invitation.
const present = async (event: Event, campaign: Campaign, me: Member) => {
    const members = await listMembers(campaign.id);
    const characters = await getCharacterSummaries(members);
    const { InviteCode, ...fields } = campaign;

    return {
        ...fields,
        Role: me.Role,
        // Un joueur sans personnage doit en choisir un à sa première visite (PUT /campaigns/{id}/character)
        NeedsCharacter: me.Role === PLAYER && !me.CharacterId,
        Members: members.map((member) => ({
            UserId: member.UserId,
            IsMe: member.UserId === me.UserId,
            Role: member.Role,
            JoinedAt: member.JoinedAt,
            ...(member.CharacterId && {
                CharacterId: member.CharacterId,
                Character: characters.get(`${member.UserId}/${member.CharacterId}`)
            })
        })),
        ...(me.Role === GM && { InviteCode }),
        _self: buildCampaignSelfLink(event, campaign.id)
    };
};

// Charge la campagne et le membership de l'appelant. Une campagne dont l'appelant n'est pas membre est
// indiscernable d'une campagne inexistante (404), pour ne pas révéler son existence.
const load = async (campaignId: string, userId: string) => {
    const [me, campaign] = await Promise.all([getMember(campaignId, userId), getCampaign(campaignId)]);
    return me && campaign ? { me, campaign } : undefined;
};

const notFound = (campaignId: string) => notFoundResponse(`Aucune campagne trouvée pour l'identifiant "${campaignId}"`);

const list = async (event: Event, userId: string): Promise<Result> => {
    try {
        const campaigns = await listCampaigns(userId);

        return successResponse({
            count: campaigns.length,
            campaigns: campaigns.map((campaign) => ({ ...campaign, _self: buildCampaignSelfLink(event, campaign.id) }))
        });
    } catch (error) {
        console.error("Erreur lors de la lecture de DynamoDB:", error);
        return errorResponse("Impossible de récupérer les campagnes", error as Error);
    }
};

const get = async (event: Event, userId: string, campaignId: string): Promise<Result> => {
    try {
        const loaded = await load(campaignId, userId);
        if (!loaded) return notFound(campaignId);

        return successResponse(await present(event, loaded.campaign, loaded.me));
    } catch (error) {
        console.error("Erreur lors de la lecture de DynamoDB:", error);
        return errorResponse("Impossible de récupérer la campagne", error as Error);
    }
};

const create = async (event: Event, userId: string): Promise<Result> => {
    const validation = validateNewCampaign(parseBody(event));
    if (!validation.ok) {
        return badRequestResponse("Campagne invalide", validation.errors);
    }

    try {
        const campaign = await createCampaign(userId, validation.value);
        const body = await present(event, campaign, { UserId: userId, Role: GM, JoinedAt: campaign.CreatedAt });

        return createdResponse(body, body._self);
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible de créer la campagne", error as Error);
    }
};

const update = async (event: Event, userId: string, campaignId: string): Promise<Result> => {
    const validation = validatePatch(parseBody(event));
    if (!validation.ok) {
        return badRequestResponse("Modification invalide", validation.errors);
    }
    if (Object.keys(validation.value).length === 0) {
        return badRequestResponse("Modification invalide", ["Aucun champ à modifier"]);
    }

    try {
        const loaded = await load(campaignId, userId);
        if (!loaded) return notFound(campaignId);
        if (loaded.me.Role !== GM) return forbiddenResponse("Seul le MJ peut modifier la campagne");

        const campaign = await updateCampaign(campaignId, validation.value);
        if (!campaign) return notFound(campaignId);

        return successResponse(await present(event, campaign, loaded.me));
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible de modifier la campagne", error as Error);
    }
};

const remove = async (userId: string, campaignId: string): Promise<Result> => {
    try {
        const loaded = await load(campaignId, userId);
        if (!loaded) return notFound(campaignId);
        if (loaded.me.Role !== GM) return forbiddenResponse("Seul le MJ peut supprimer la campagne");

        await deleteCampaign(loaded.campaign);

        return noContentResponse();
    } catch (error) {
        console.error("Erreur lors de la suppression dans DynamoDB:", error);
        return errorResponse("Impossible de supprimer la campagne", error as Error);
    }
};

// Le MJ génère un nouveau lien d'invitation ; l'ancien cesse de fonctionner
const renewInvite = async (event: Event, userId: string, campaignId: string): Promise<Result> => {
    try {
        const loaded = await load(campaignId, userId);
        if (!loaded) return notFound(campaignId);
        if (loaded.me.Role !== GM) return forbiddenResponse("Seul le MJ peut gérer les invitations");

        const campaign = await regenerateInvite(loaded.campaign);

        return successResponse(await present(event, campaign, loaded.me));
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible de renouveler l'invitation", error as Error);
    }
};

// Rejoint une campagne avec le code d'un lien d'invitation. Idempotent : rouvrir le lien quand on est déjà
// membre renvoie simplement la campagne. Le personnage peut être fourni tout de suite, ou choisi ensuite.
const join = async (event: Event, userId: string): Promise<Result> => {
    const validation = validateJoin(parseBody(event));
    if (!validation.ok) {
        return badRequestResponse("Invitation invalide", validation.errors);
    }
    const { InviteCode, CharacterId } = validation.value;

    try {
        const campaignId = await findCampaignIdByInvite(InviteCode);
        if (!campaignId) return notFoundResponse("Lien d'invitation invalide ou expiré");

        const existing = await getMember(campaignId, userId);
        if (!existing) {
            if (CharacterId && !(await ownsCharacter(userId, CharacterId))) {
                return badRequestResponse("Invitation invalide", [`Aucun personnage trouvé pour l'identifiant "${CharacterId}"`]);
            }
            await addPlayer(campaignId, userId, CharacterId);
        }

        const loaded = await load(campaignId, userId);
        // Absent ici seulement si la campagne a été supprimée entre-temps
        if (!loaded) return notFoundResponse("Lien d'invitation invalide ou expiré");

        const body = await present(event, loaded.campaign, loaded.me);
        return existing ? successResponse(body) : createdResponse(body, body._self);
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible de rejoindre la campagne", error as Error);
    }
};

// Un joueur choisit (ou change) celui de SES personnages qui participe à la campagne
const chooseCharacter = async (event: Event, userId: string, campaignId: string): Promise<Result> => {
    const validation = validateCharacterChoice(parseBody(event));
    if (!validation.ok) {
        return badRequestResponse("Choix invalide", validation.errors);
    }
    const { CharacterId } = validation.value;

    try {
        const loaded = await load(campaignId, userId);
        if (!loaded) return notFound(campaignId);
        if (loaded.me.Role === GM) return forbiddenResponse("Le MJ ne joue pas de personnage dans sa campagne");

        if (!(await ownsCharacter(userId, CharacterId))) {
            return badRequestResponse("Choix invalide", [`Aucun personnage trouvé pour l'identifiant "${CharacterId}"`]);
        }
        if (!(await setMemberCharacter(campaignId, userId, CharacterId))) return notFound(campaignId);

        return successResponse(await present(event, loaded.campaign, { ...loaded.me, CharacterId }));
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible de choisir le personnage", error as Error);
    }
};
