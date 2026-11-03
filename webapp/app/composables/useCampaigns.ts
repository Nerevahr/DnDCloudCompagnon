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
    chooseCharacter: (id: string, characterId: string) =>
      $fetch<Campaign>(`${base}/${id}/character`, { ...options, method: 'PUT', body: { CharacterId: characterId } })
  }
}
