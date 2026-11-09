export interface CampaignSummary {
  id: string
  Name: string
  Description: string
  GameMasterId: string
  UpdatedAt: string
  // Rôle de l'utilisateur connecté dans la campagne : MJ ou joueur
  Role: 'GM' | 'PLAYER'
}

export interface CampaignMember {
  UserId: string
  // Vrai pour l'utilisateur connecté
  IsMe: boolean
  Role: 'GM' | 'PLAYER'
  JoinedAt: string
  CharacterId?: string
  // Absent si le personnage a été supprimé depuis son choix
  Character?: { id: string, Name: string, Class: string, Species?: string, Level: number }
}

export interface Campaign extends Omit<CampaignSummary, 'UpdatedAt'> {
  UpdatedAt: string
  // Vrai pour un joueur qui n'a pas encore choisi son personnage
  NeedsCharacter: boolean
  Members: CampaignMember[]
  // Réservés au MJ
  InviteCode?: string
}

// Participant dans l'ordre de jeu : id = UserId pour un joueur, id de l'ennemi sinon
export interface OrderEntry {
  id: string
  Name: string
  // Valeurs réservées au MJ : l'API ne les envoie pas aux joueurs, qui ne reçoivent que l'ordre
  Initiative?: number
  // Bonus d'initiative servant à départager les égalités (0 pour un ennemi)
  Bonus?: number
  Enemy: boolean
}

export interface CombatEnemy {
  id: string
  Name: string
  Initiative: number
}

// Vue MJ : tout le combat. Vue joueur : seulement l'état du combat, son initiative (null tant qu'il n'a pas
// lancé) et le bonus à ajouter à son d20.
export interface Combat {
  id: string
  Name: string
  // PREPARING : le MJ prépare (invisible des joueurs) ; INITIATIVE : lancé, les joueurs envoient leur initiative ;
  // ORDER : toutes les initiatives sont connues, le MJ arrange l'ordre de jeu (invisible des joueurs) ;
  // RUNNING : le MJ a démarré le combat, les joueurs voient `Order`
  Status: 'PREPARING' | 'INITIATIVE' | 'ORDER' | 'RUNNING'
  UpdatedAt: string
  // MJ uniquement
  Enemies?: CombatEnemy[]
  // Ordre de jeu : dès la phase ORDER pour le MJ, seulement en phase RUNNING pour les joueurs
  Order?: OrderEntry[]
  // MJ uniquement : initiative de chaque joueur, indexée par UserId
  Initiatives?: Record<string, number>
  // Joueur uniquement
  Initiative?: number | null
  InitiativeBonus?: number
}

export interface CombatDefinition {
  Name: string
  Enemies: { Name: string, Initiative: number }[]
}

// Appels d'écriture sur l'API des campagnes (la lecture passe par useLazyFetch dans les pages)
export function useCampaignsApi() {
  const base = `${useRuntimeConfig().public.apiBase}/api/v1/campaigns`
  const options = useApiFetchOptions()

  return {
    base,
    options,
    create: (body: Record<string, unknown>) => $fetch<Campaign>(base, { ...options, method: 'POST', body }),
    update: (id: string, body: Record<string, unknown>) => $fetch<Campaign>(`${base}/${id}`, { ...options, method: 'PATCH', body }),
    remove: (id: string) => $fetch(`${base}/${id}`, { ...options, method: 'DELETE' }),
    renewInvite: (id: string) => $fetch<Campaign>(`${base}/${id}/invite`, { ...options, method: 'POST' }),
    join: (inviteCode: string) => $fetch<Campaign>(`${base}/join`, { ...options, method: 'POST', body: { InviteCode: inviteCode } }),
    combatsUrl: (id: string) => `${base}/${id}/combats`,
    createCombat: (id: string, body: CombatDefinition) =>
      $fetch<{ Combat: Combat }>(`${base}/${id}/combats`, { ...options, method: 'POST', body }),
    updateCombat: (id: string, combatId: string, body: CombatDefinition) =>
      $fetch<{ Combat: Combat }>(`${base}/${id}/combats/${combatId}`, { ...options, method: 'PUT', body }),
    startCombat: (id: string, combatId: string) =>
      $fetch<{ Combat: Combat }>(`${base}/${id}/combats/${combatId}/start`, { ...options, method: 'POST' }),
    removeCombat: (id: string, combatId: string) => $fetch(`${base}/${id}/combats/${combatId}`, { ...options, method: 'DELETE' }),
    sendInitiative: (id: string, combatId: string, initiative: number) =>
      $fetch<{ Combat: Combat }>(`${base}/${id}/combats/${combatId}/initiative`, { ...options, method: 'PUT', body: { Initiative: initiative } }),
    beginCombat: (id: string, combatId: string) =>
      $fetch<{ Combat: Combat }>(`${base}/${id}/combats/${combatId}/begin`, { ...options, method: 'POST' }),
    // `newEnemies` : ennemis ajoutés, désignés dans `order` par leur identifiant provisoire
    reorderCombat: (id: string, combatId: string, order: string[], newEnemies: { id: string, Name: string, Initiative: number }[] = []) =>
      $fetch<{ Combat: Combat }>(`${base}/${id}/combats/${combatId}/order`, { ...options, method: 'PUT', body: { Order: order, ...(newEnemies.length && { NewEnemies: newEnemies }) } }),
    chooseCharacter: (id: string, characterId: string) =>
      $fetch<Campaign>(`${base}/${id}/character`, { ...options, method: 'PUT', body: { CharacterId: characterId } })
  }
}
