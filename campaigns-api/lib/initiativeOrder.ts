import type { Combat, OrderEntry } from "./combatRepository";
import type { Member } from "./campaignRepository";

// Ordre de jeu : initiative décroissante, égalités départagées par le bonus d'initiative (0 pour les ennemis),
// puis les joueurs avant les ennemis. Le tri est stable : à égalité parfaite, l'ordre d'arrivée est conservé.
export const computeOrder = (combat: Combat, names: Map<string, string>): OrderEntry[] => {
    const players = Object.entries(combat.Initiatives).map(([id, Initiative]) => ({
        id,
        Name: names.get(id) ?? "Joueur",
        Initiative,
        Bonus: combat.Bonuses?.[id] ?? 0,
        Enemy: false
    }));
    const enemies = combat.Enemies.map((enemy) => ({ id: enemy.id, Name: enemy.Name, Initiative: enemy.Initiative, Bonus: 0, Enemy: true }));

    return [...players, ...enemies].sort((a, b) =>
        b.Initiative - a.Initiative || b.Bonus - a.Bonus || Number(a.Enemy) - Number(b.Enemy));
};

// Vrai quand tous les joueurs ayant choisi un personnage ont envoyé leur initiative
export const allInitiativesKnown = (combat: Combat, members: Member[]) => {
    const players = members.filter((member) => member.Role === "PLAYER" && member.CharacterId);
    return players.length > 0 && players.every((member) => combat.Initiatives[member.UserId] !== undefined);
};
