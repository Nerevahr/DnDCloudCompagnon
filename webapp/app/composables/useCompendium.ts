export interface ResourceColumn {
  key: string
  label: string
  // Libellé abrégé de l'en-tête sur mobile
  shortLabel?: string
  // Colonne triable en cliquant sur son en-tête
  sortable?: boolean
  // Colonne filtrable par sélection multiple de valeurs
  filterable?: boolean
  // La cellule contient une liste (jointe par ", ") : le filtre retient les lignes en contenant au moins une valeur
  multiValue?: boolean
  // Colonne masquée sur mobile
  hideOnMobile?: boolean
  // Sur mobile, valeur d'une autre colonne affichée en texte secondaire sous la valeur de celle-ci
  mobileSubKey?: string
}

export interface ResourceType {
  slug: string
  // Chemin de l'API (/api/v1/<apiPath>) ; par défaut le slug (plusieurs entrées de menu peuvent partager une API)
  apiPath?: string
  // Ne garde que certaines lignes de la liste (ex: sous-catégories d'objets)
  rowFilter?: (row: Record<string, unknown>) => boolean
  label: string
  icon: string
  // Nom de la propriété contenant la liste dans la réponse de l'API
  listKey: string
  // Tri demandé à l'API (?sort=...)
  sort: string
  columns: ResourceColumn[]
  // Champs affichés dans le panneau de détail (hors Name et Description)
  detailFields: ResourceColumn[]
  // Champs affichés après la description (ex: améliorations d'un sort)
  extraFields?: ResourceColumn[]
}

const joinList = (value: unknown) => (Array.isArray(value) ? value.join(', ') : '')

export const resourceTypes: ResourceType[] = [
  {
    slug: 'spells',
    label: 'Sorts',
    icon: 'i-lucide-wand-sparkles',
    listKey: 'spells',
    sort: 'level',
    columns: [
      { key: 'Name', label: 'Nom', mobileSubKey: 'School' },
      { key: 'Level', label: 'Niveau', shortLabel: 'Niv.', sortable: true, filterable: true },
      { key: 'School', label: 'École', hideOnMobile: true },
      { key: 'Classes', label: 'Classes', filterable: true, multiValue: true, hideOnMobile: true }
    ],
    detailFields: [
      { key: 'CastingTime', label: 'Temps d\'incantation' },
      { key: 'Range', label: 'Portée' },
      { key: 'Components', label: 'Composantes' },
      { key: 'MaterialDescription', label: 'Matériel' },
      { key: 'Duration', label: 'Durée' },
      { key: 'SavingThrowStat', label: 'Jet de sauvegarde' },
      { key: 'DamageAmount', label: 'Dégâts' },
      { key: 'AlternateDamageAmount', label: 'Dégâts alternatifs' }
    ],
    extraFields: [
      { key: 'HigherLevelSlot', label: 'Emplacement de niveau supérieur' },
      { key: 'MinorSpellImprovement', label: 'Amélioration du sort mineur' }
    ]
  },
  {
    slug: 'feats',
    label: 'Dons',
    icon: 'i-lucide-award',
    listKey: 'feats',
    sort: 'name',
    columns: [
      { key: 'Name', label: 'Nom' },
      { key: 'Category', label: 'Catégorie' },
      { key: 'Prerequisites', label: 'Prérequis' }
    ],
    detailFields: [
      { key: 'Category', label: 'Catégorie' },
      { key: 'Prerequisites', label: 'Prérequis' }
    ]
  },
  {
    slug: 'weapons',
    apiPath: 'items',
    rowFilter: row => row.Type === 'Arme',
    label: 'Armes',
    icon: 'i-lucide-swords',
    listKey: 'items',
    sort: 'name',
    columns: [
      { key: 'Name', label: 'Nom' },
      { key: 'WeaponType', label: 'Type d\'arme' },
      { key: 'DamageDice', label: 'Dégâts' },
      { key: 'DamageType', label: 'Type de dégâts' }
    ],
    detailFields: [
      { key: 'Type', label: 'Type' },
      { key: 'WeaponType', label: 'Type d\'arme' },
      { key: 'DamageDice', label: 'Dégâts' },
      { key: 'DamageType', label: 'Type de dégâts' },
      { key: 'ArmorCategory', label: 'Catégorie d\'armure' },
      { key: 'BaseArmorClass', label: 'CA' }
    ]
  },
  {
    slug: 'armors',
    apiPath: 'items',
    rowFilter: row => row.Type === 'Armure' || row.Type === 'Bouclier',
    label: 'Armures et boucliers',
    icon: 'i-lucide-shield',
    listKey: 'items',
    sort: 'name',
    columns: [
      { key: 'Name', label: 'Nom' },
      { key: 'Type', label: 'Type' },
      { key: 'ArmorCategory', label: 'Catégorie' },
      { key: 'BaseArmorClass', label: 'CA' }
    ],
    detailFields: [
      { key: 'Type', label: 'Type' },
      { key: 'WeaponType', label: 'Type d\'arme' },
      { key: 'DamageDice', label: 'Dégâts' },
      { key: 'DamageType', label: 'Type de dégâts' },
      { key: 'ArmorCategory', label: 'Catégorie d\'armure' },
      { key: 'BaseArmorClass', label: 'CA' }
    ]
  },
  {
    slug: 'gear',
    apiPath: 'items',
    rowFilter: row => row.Type !== 'Arme' && row.Type !== 'Armure' && row.Type !== 'Bouclier',
    label: 'Équipement',
    icon: 'i-lucide-backpack',
    listKey: 'items',
    sort: 'name',
    columns: [
      { key: 'Name', label: 'Nom' },
      { key: 'Type', label: 'Type' }
    ],
    detailFields: [
      { key: 'Type', label: 'Type' },
      { key: 'WeaponType', label: 'Type d\'arme' },
      { key: 'DamageDice', label: 'Dégâts' },
      { key: 'DamageType', label: 'Type de dégâts' },
      { key: 'ArmorCategory', label: 'Catégorie d\'armure' },
      { key: 'BaseArmorClass', label: 'CA' }
    ]
  }
]

// Met une ligne de l'API à plat pour l'affichage (listes -> texte, null -> vide)
export function formatRow(row: Record<string, unknown>): Record<string, unknown> {
  const formatted: Record<string, unknown> = { id: row.id }
  for (const [key, value] of Object.entries(row)) {
    if (key === 'Prerequisites' && Array.isArray(value)) {
      formatted[key] = value
        .map((p: { type?: string, value?: string }) => `${p.type ?? ''} ${p.value ?? ''}`.trim())
        .join(', ')
    } else if (Array.isArray(value)) {
      formatted[key] = joinList(value)
    } else if (typeof value === 'boolean') {
      formatted[key] = value ? 'Oui' : 'Non'
    } else {
      formatted[key] = value ?? ''
    }
  }
  return formatted
}
