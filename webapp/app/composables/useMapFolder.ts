// Dossier de cartes choisi sur le PC de l'utilisateur (File System Access API : Chrome / Edge).
// Le handle est conservé dans IndexedDB ; l'accès doit être ré-autorisé par un geste utilisateur à chaque session.
const DB_NAME = 'dnd-compagnon'
const STORE = 'handles'
const KEY = 'maps-folder'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function useMapFolder() {
  const supported = import.meta.client && 'showDirectoryPicker' in window
  const handle = shallowRef<FileSystemDirectoryHandle>()
  const folderName = computed(() => handle.value?.name ?? '')

  async function restore() {
    if (!supported) return
    try {
      handle.value = await idb<FileSystemDirectoryHandle | undefined>('readonly', s => s.get(KEY))
    } catch {}
  }

  async function pick() {
    // @ts-expect-error API non typée selon la version de TypeScript
    const h: FileSystemDirectoryHandle = await window.showDirectoryPicker({ id: 'dnd-maps', mode: 'readwrite' })
    handle.value = h
    await idb('readwrite', s => s.put(h, KEY))
  }

  // Redemande l'autorisation si besoin (doit être appelé depuis un clic)
  async function ensure(mode: 'read' | 'readwrite') {
    const h = handle.value as any
    if (!h) return false
    if (await h.queryPermission({ mode }) === 'granted') return true
    return (await h.requestPermission({ mode })) === 'granted'
  }

  // Copie le fichier dans le dossier s'il n'y existe pas déjà (n'écrase jamais)
  async function store(file: File) {
    if (!await ensure('readwrite')) throw new Error('permission')
    try {
      await handle.value!.getFileHandle(file.name)
      return
    } catch {}
    const fh = await handle.value!.getFileHandle(file.name, { create: true })
    const w = await fh.createWritable()
    await w.write(file)
    await w.close()
  }

  async function read(name: string): Promise<File> {
    if (!await ensure('read')) throw new Error('permission')
    return (await handle.value!.getFileHandle(name)).getFile()
  }

  return { supported, folderName, restore, pick, store, read }
}
