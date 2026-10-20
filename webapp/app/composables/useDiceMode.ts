// Mode de jet de dés : « manual » (le joueur lance ses dés et saisit le résultat) ou « app » (l'application tire
// le d20). Choix gardé en localStorage, propre à l'appareil comme le thème.
export type DiceMode = 'manual' | 'app'

const STORAGE_KEY = 'dnd-dice-mode'

function readMode(): DiceMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'app' ? 'app' : 'manual'
  } catch {
    return 'manual'
  }
}

export function useDiceMode() {
  const diceMode = useState<DiceMode>('dice-mode', () => (import.meta.client ? readMode() : 'manual'))

  function setDiceMode(mode: DiceMode) {
    diceMode.value = mode
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch { /* stockage indisponible : le choix ne survivra pas au rechargement */ }
  }

  return { diceMode, setDiceMode }
}

// d20 tiré avec le générateur cryptographique du navigateur, sans biais de modulo
export function rollD20(): number {
  const limit = Math.floor(2 ** 32 / 20) * 20
  const buffer = new Uint32Array(1)
  do {
    crypto.getRandomValues(buffer)
  } while (buffer[0]! >= limit)
  return (buffer[0]! % 20) + 1
}
