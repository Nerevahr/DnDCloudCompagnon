import { randomUUID } from "node:crypto";
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
    getUserId,
    notifyCampaign
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
import { ORDER, RUNNING, beginCombat, createCombat, deleteCombat, getCombat, getDexterityModifier, isActive, listCombats, publishOrder, reorder, setInitiative, startCombat, updateCombat } from "./lib/combatRepository";
import type { Combat } from "./lib/combatRepository";
import { validateCombat, validateInitiative, validateOrder } from "./lib/combatValidation";
import { allInitiativesKnown, computeOrder } from "./lib/initiativeOrder";
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
    } else if (path.includes("/combats")) {
        const combatId = event.pathParameters?.combatId;
        if (!combatId) {
            if (method === "GET") return listCurrentCombats(userId, campaignId);
            if (method === "POST") return addCombat(event, userId, campaignId);
        } else if (path.endsWith("/start")) {
            if (method === "POST") return launchCombat(userId, campaignId, combatId);
        } else if (path.endsWith("/begin")) {
            if (method === "POST") return runCombat(userId, campaignId, combatId);
        } else if (path.endsWith("/order")) {
            if (method === "PUT") return changeOrder(event, userId, campaignId, combatId);
        } else if (path.endsWith("/initiative")) {
            if (method === "PUT") return sendInitiative(event, userId, campaignId, combatId);
        } else {
            if (method === "PUT") return editCombat(event, userId, campaignId, combatId);
            if (method === "DELETE") return removeCombat(userId, campaignId, combatId);
        }
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

// Le MJ voit tous ses combats en entier ; un joueur ne voit que le combat lancé, sans ses ennemis, avec son propre
// bonus et son initiative s'il l'a déjà envoyée.
const presentCombats = async (combats: Combat[], me: Member) => {
    if (me.Role === GM) return { Combats: combats };

    const active = combats.find(isActive);
    if (!active) return { Combats: [] };

    const { id, Name, Status, UpdatedAt } = active;
    return {
        Combats: [{
            id,
            Name,
            Status,
            UpdatedAt,
            Initiative: active.Initiatives[me.UserId] ?? null,
            // L'ordre de jeu n'est révélé qu'au démarrage du combat par le MJ, et seulement l'ordre : ni les initiatives
            // ni les bonus des autres participants ne sont transmis aux joueurs
            ...(Status === RUNNING && { Order: active.Order?.map(({ id, Name, Enemy }) => ({ id, Name, Enemy })) }),
            InitiativeBonus: me.CharacterId ? await getDexterityModifier(me.UserId, me.CharacterId) : 0
        }]
    };
};

const presentOne = async (combat: Combat, me: Member) => ({ Combat: (await presentCombats([combat], me)).Combats[0] ?? null });

// Charge la campagne et vérifie que l'appelant en est le MJ
const loadAsGm = async (campaignId: string, userId: string) => {
    const loaded = await load(campaignId, userId);
    if (!loaded) return { response: notFound(campaignId) };
    if (loaded.me.Role !== GM) return { response: forbiddenResponse("Seul le MJ peut gérer les combats") };
    return { me: loaded.me };
};

// Prévient les membres connectés à la partie (WebSocket) qu'un combat a changé : ils relisent l'API
const notifyCombat = (campaignId: string) => notifyCampaign(campaignId, { type: "combat" });

const MAX_ENEMIES = 50;

const combatNotFound = () => notFoundResponse("Combat introuvable");

const listCurrentCombats = async (userId: string, campaignId: string): Promise<Result> => {
    try {
        const loaded = await load(campaignId, userId);
        if (!loaded) return notFound(campaignId);

        return successResponse(await presentCombats(await listCombats(campaignId), loaded.me));
    } catch (error) {
        console.error("Erreur lors de la lecture de DynamoDB:", error);
        return errorResponse("Impossible de récupérer les combats", error as Error);
    }
};

// Le MJ prépare un nouveau combat (nom + ennemis avec leur initiative)
const addCombat = async (event: Event, userId: string, campaignId: string): Promise<Result> => {
    const validation = validateCombat(parseBody(event));
    if (!validation.ok) {
        return badRequestResponse("Combat invalide", validation.errors);
    }

    try {
        const checked = await loadAsGm(campaignId, userId);
        if (checked.response) return checked.response;

        const combat = await createCombat(campaignId, validation.value);

        await notifyCombat(campaignId);
        return createdResponse({ Combat: combat }, `${buildCampaignSelfLink(event, campaignId)}/combats/${combat.id}`);
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible d'enregistrer le combat", error as Error);
    }
};

// Le MJ modifie un combat qui n'est pas encore lancé
const editCombat = async (event: Event, userId: string, campaignId: string, combatId: string): Promise<Result> => {
    const validation = validateCombat(parseBody(event));
    if (!validation.ok) {
        return badRequestResponse("Combat invalide", validation.errors);
    }

    try {
        const checked = await loadAsGm(campaignId, userId);
        if (checked.response) return checked.response;

        const existing = await getCombat(campaignId, combatId);
        if (!existing) return combatNotFound();

        const combat = await updateCombat(campaignId, combatId, validation.value);
        if (!combat) return conflict("Ce combat est déjà lancé : terminez-le avant de le modifier");

        await notifyCombat(campaignId);
        return successResponse({ Combat: combat });
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible d'enregistrer le combat", error as Error);
    }
};

// Le MJ déclenche un combat : les joueurs sont invités à lancer leur initiative. Un seul combat peut être lancé à la fois.
const launchCombat = async (userId: string, campaignId: string, combatId: string): Promise<Result> => {
    try {
        const checked = await loadAsGm(campaignId, userId);
        if (checked.response) return checked.response;

        const combats = await listCombats(campaignId);
        if (!combats.some((combat) => combat.id === combatId)) return combatNotFound();
        if (combats.some(isActive)) return conflict("Un combat est déjà lancé : terminez-le avant d'en lancer un autre");

        const combat = await startCombat(campaignId, combatId);
        if (!combat) return conflict("Ce combat n'est pas en préparation");

        await notifyCombat(campaignId);
        return successResponse({ Combat: combat });
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible de lancer le combat", error as Error);
    }
};

// Le MJ démarre le combat une fois l'ordre de jeu arrangé : les joueurs le découvrent alors
const runCombat = async (userId: string, campaignId: string, combatId: string): Promise<Result> => {
    try {
        const checked = await loadAsGm(campaignId, userId);
        if (checked.response) return checked.response;

        if (!(await getCombat(campaignId, combatId))) return combatNotFound();

        const combat = await beginCombat(campaignId, combatId);
        if (!combat) return conflict("Le combat ne peut démarrer qu'une fois toutes les initiatives reçues");

        await notifyCombat(campaignId);
        return successResponse({ Combat: combat });
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible de démarrer le combat", error as Error);
    }
};

// Supprime un combat préparé, ou termine le combat lancé : les joueurs retrouvent l'écran « campagne en cours »
const removeCombat = async (userId: string, campaignId: string, combatId: string): Promise<Result> => {
    try {
        const checked = await loadAsGm(campaignId, userId);
        if (checked.response) return checked.response;

        await deleteCombat(campaignId, combatId);

        await notifyCombat(campaignId);
        return noContentResponse();
    } catch (error) {
        console.error("Erreur lors de la suppression dans DynamoDB:", error);
        return errorResponse("Impossible de supprimer le combat", error as Error);
    }
};

// Le MJ enregistre l'ordre de jeu : la liste doit contenir exactement les participants du combat (plus les ennemis
// qu'il ajoute, moins ceux qu'il retire : un ennemi absent de la liste est supprimé du combat). Les joueurs ne sont
// prévenus qu'à cet enregistrement.
const changeOrder = async (event: Event, userId: string, campaignId: string, combatId: string): Promise<Result> => {
    const validation = validateOrder(parseBody(event));
    if (!validation.ok) {
        return badRequestResponse("Ordre invalide", validation.errors);
    }

    try {
        const checked = await loadAsGm(campaignId, userId);
        if (checked.response) return checked.response;

        const current = await getCombat(campaignId, combatId);
        if (!current) return combatNotFound();
        if ((current.Status !== ORDER && current.Status !== RUNNING) || !current.Order) return conflict("L'ordre de jeu n'est pas encore défini");

        // Les ennemis ajoutés sont désignés dans Order par un identifiant provisoire ; ils reçoivent un identifiant définitif
        const { Order: ids, NewEnemies: added } = validation.value;
        const byId = new Map(current.Order.map((entry) => [entry.id, entry]));
        const newEnemies = added.map(({ id, Name, Initiative }) => ({ tempId: id, enemy: { id: randomUUID(), Name, Initiative } }));
        for (const { tempId, enemy } of newEnemies) {
            if (byId.has(tempId)) return badRequestResponse("Ordre invalide", [`L'identifiant "${tempId}" est déjà utilisé`]);
            byId.set(tempId, { id: enemy.id, Name: enemy.Name, Initiative: enemy.Initiative, Bonus: 0, Enemy: true });
        }
        // Un participant absent de la liste est retiré du combat : seuls les ennemis peuvent l'être, jamais un joueur
        const kept = new Set(ids);
        const removed = [...byId].filter(([key]) => !kept.has(key)).map(([, entry]) => entry);
        if (new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id)) || removed.some((entry) => !entry.Enemy)) {
            return badRequestResponse("Ordre invalide", ["La liste doit contenir chaque joueur exactement une fois, et uniquement des participants du combat"]);
        }

        const enemies = [...current.Enemies.filter((enemy) => kept.has(enemy.id)), ...newEnemies.map(({ enemy }) => enemy)];
        if (enemies.length > MAX_ENEMIES) {
            return badRequestResponse("Ordre invalide", [`Un combat ne peut pas compter plus de ${MAX_ENEMIES} ennemis`]);
        }

        const enemiesChanged = newEnemies.length > 0 || removed.length > 0;
        const combat = await reorder(
            campaignId,
            combatId,
            ids.map((id) => byId.get(id)!),
            enemiesChanged ? enemies : undefined
        );
        if (!combat) return conflict("L'ordre de jeu n'est pas encore défini");

        await notifyCombat(campaignId);
        return successResponse({ Combat: combat });
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible de modifier l'ordre", error as Error);
    }
};

// Un joueur envoie le total de son jet d'initiative
const sendInitiative = async (event: Event, userId: string, campaignId: string, combatId: string): Promise<Result> => {
    const validation = validateInitiative(parseBody(event));
    if (!validation.ok) {
        return badRequestResponse("Initiative invalide", validation.errors);
    }

    try {
        const loaded = await load(campaignId, userId);
        if (!loaded) return notFound(campaignId);
        if (loaded.me.Role === GM) return forbiddenResponse("L'initiative du MJ se définit sur les ennemis");

        const bonus = loaded.me.CharacterId ? await getDexterityModifier(userId, loaded.me.CharacterId) : 0;
        let combat = await setInitiative(campaignId, combatId, userId, validation.value.Initiative, bonus);
        if (!combat) return conflict("Aucun combat n'attend d'initiative");

        // Dernier joueur à répondre : l'ordre de jeu est calculé. Si un autre joueur l'a publié en même temps,
        // publishOrder ne fait rien et la relecture ci-dessous renvoie l'état à jour.
        const members = await listMembers(campaignId);
        if (allInitiativesKnown(combat, members)) {
            const characters = await getCharacterSummaries(members);
            const names = new Map<string, string>();
            for (const member of members) {
                const name = characters.get(`${member.UserId}/${member.CharacterId}`)?.Name as string | undefined;
                if (name) names.set(member.UserId, name);
            }
            combat = (await publishOrder(campaignId, combatId, computeOrder(combat, names))) ?? (await getCombat(campaignId, combatId)) ?? combat;
        }

        await notifyCombat(campaignId);
        return successResponse(await presentOne(combat, loaded.me));
    } catch (error) {
        console.error("Erreur lors de l'écriture dans DynamoDB:", error);
        return errorResponse("Impossible d'enregistrer l'initiative", error as Error);
    }
};

const conflict = (message: string): Result => ({
    statusCode: 409,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ error: message })
});
