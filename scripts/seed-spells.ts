import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DynamoDBClient, type DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

type SpellComponent = "V" | "S" | "M";

interface Spell {
    name: string;
    portee: string;
    ecole: string;
    components: SpellComponent[];
    materialDescription?: string;
    dureeIncantation: string;
    duree: string;
    niveau: number;
    classes: string[];
    concentration: boolean;
    descriptionSort: string;
    tags?: string[];
    emplacementNiveauSuperieur?: string;
    ameliorationSortMineur?: string;
    requiresSavingThrow?: boolean;
    savingThrowStat?: string;
    damageAmount?: string;
    alternateDamageAmount?: string;
}

interface SpellItem {
    PK: string;
    SK: string;
    Name: string;
    Level: number;
    School: string;
    Range: string;
    CastingTime: string;
    Duration: string;
    Classes: string[];
    Tags: string[];
    Concentration: boolean;
    Components: SpellComponent[];
    MaterialDescription: string;
    Description: string;
    HigherLevelSlot: string;
    MinorSpellImprovement: string;
    RequiresSavingThrow: boolean;
    SavingThrowStat: string;
    DamageAmount: string;
    AlternateDamageAmount: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE_PATTERN = /^spells_\d+\.json$/;
const BATCH_SIZE = 25; // limite DynamoDB pour BatchWriteItem

const tableName = process.env.TABLE_NAME || "DnD_Companion";
const region = process.env.AWS_REGION || "eu-west-3";
const endpoint = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";

const clientConfig: DynamoDBClientConfig = { region };
if (endpoint) {
    clientConfig.endpoint = endpoint;
    clientConfig.credentials = {
        accessKeyId: "fakeMyKeyId",
        secretAccessKey: "fakeSecretAccessKey"
    };
}

const client = new DynamoDBClient(clientConfig);
const docClient = DynamoDBDocumentClient.from(client);

function slugify(name: string): string {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // retire les accents
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function toItem(spell: Spell): SpellItem {
    return {
        PK: `SPELL#${slugify(spell.name)}`,
        SK: "METADATA",
        Name: spell.name,
        Level: spell.niveau,
        School: spell.ecole,
        Range: spell.portee,
        CastingTime: spell.dureeIncantation,
        Duration: spell.duree,
        Classes: spell.classes,
        Tags: spell.tags ?? [],
        Concentration: spell.concentration,
        Components: spell.components,
        MaterialDescription: spell.materialDescription ?? "",
        Description: spell.descriptionSort,
        HigherLevelSlot: spell.emplacementNiveauSuperieur ?? "",
        MinorSpellImprovement: spell.ameliorationSortMineur ?? "",
        RequiresSavingThrow: spell.requiresSavingThrow ?? false,
        SavingThrowStat: spell.savingThrowStat ?? "",
        DamageAmount: spell.damageAmount ?? "",
        AlternateDamageAmount: spell.alternateDamageAmount ?? ""
    };
}

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

async function loadSpells(): Promise<Spell[]> {
    const entries = await readdir(DATA_DIR);
    const dataFiles = entries.filter((entry) => DATA_FILE_PATTERN.test(entry)).sort();

    if (dataFiles.length === 0) {
        throw new Error(`Aucun fichier "spells_<niveau>.json" trouvé dans ${DATA_DIR}`);
    }

    const spells: Spell[] = [];
    for (const file of dataFiles) {
        const raw = await readFile(path.join(DATA_DIR, file), "utf-8");
        spells.push(...(JSON.parse(raw) as Spell[]));
        console.log(`  - ${file} chargé`);
    }

    return spells;
}

async function writeBatch(items: SpellItem[]): Promise<void> {
    let requestItems: Record<string, { PutRequest: { Item: SpellItem } }[]> = {
        [tableName]: items.map((item) => ({ PutRequest: { Item: item } }))
    };

    let attempt = 0;
    while (Object.keys(requestItems).length > 0) {
        const result = await docClient.send(new BatchWriteCommand({ RequestItems: requestItems }));
        requestItems = (result.UnprocessedItems as typeof requestItems) ?? {};

        if (Object.keys(requestItems).length > 0) {
            attempt += 1;
            if (attempt > 5) {
                throw new Error("Trop d'items non traités après plusieurs tentatives (UnprocessedItems).");
            }
            await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
        }
    }
}

async function main(): Promise<void> {
    console.log(`Seed des sorts -> table "${tableName}" (région ${region}, endpoint ${endpoint || "AWS par défaut"})`);

    const spells = await loadSpells();
    const items = spells.map(toItem);

    for (const batch of chunk(items, BATCH_SIZE)) {
        await writeBatch(batch);
    }

    console.log(`${items.length} sort(s) inséré(s) avec succès.`);
}

main().catch((error: Error & { name?: string }) => {
    if (error.name === "ResourceNotFoundException") {
        console.error(
            `La table "${tableName}" n'existe pas sur l'endpoint ${endpoint || "AWS par défaut"}. Créez-la avant de lancer le seed.`
        );
    } else {
        console.error("Échec du seed des sorts :", error);
    }
    process.exitCode = 1;
});
