import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DynamoDBClient, type DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

interface Item {
    name: string;
    type: string;
    itemDescription: string;
    weaponType: string | null;
    damageDice: string | null;
    damageType: string | null;
    armorCategory: string | null;
    baseArmorClass: number | null;
}

interface ItemRecord {
    PK: string;
    SK: string;
    Name: string;
    Type: string;
    Description: string;
    WeaponType?: string;
    DamageDice?: string;
    DamageType?: string;
    ArmorCategory?: string;
    BaseArmorClass?: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "..", "data", "items.json");
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

function toItem(item: Item): ItemRecord {
    // On n'écrit que les attributs renseignés : les objets non-armes / non-armures
    // laissent ces champs à null dans le JSON source, inutile de les stocker.
    const record: ItemRecord = {
        PK: `ITEM#${slugify(item.name)}`,
        SK: "METADATA",
        Name: item.name,
        Type: item.type,
        Description: item.itemDescription
    };

    if (item.weaponType) record.WeaponType = item.weaponType;
    if (item.damageDice) record.DamageDice = item.damageDice;
    if (item.damageType) record.DamageType = item.damageType;
    if (item.armorCategory) record.ArmorCategory = item.armorCategory;
    if (item.baseArmorClass != null) record.BaseArmorClass = item.baseArmorClass;

    return record;
}

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

async function loadItems(): Promise<Item[]> {
    const raw = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as Item[];
}

async function writeBatch(items: ItemRecord[]): Promise<void> {
    let requestItems: Record<string, { PutRequest: { Item: ItemRecord } }[]> = {
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
    console.log(`Seed des objets -> table "${tableName}" (région ${region}, endpoint ${endpoint || "AWS par défaut"})`);

    const items = await loadItems();
    const records = items.map(toItem);

    for (const batch of chunk(records, BATCH_SIZE)) {
        await writeBatch(batch);
    }

    console.log(`${records.length} objet(s) inséré(s) avec succès.`);
}

main().catch((error: Error & { name?: string }) => {
    if (error.name === "ResourceNotFoundException") {
        console.error(
            `La table "${tableName}" n'existe pas sur l'endpoint ${endpoint || "AWS par défaut"}. Créez-la avant de lancer le seed.`
        );
    } else {
        console.error("Échec du seed des objets :", error);
    }
    process.exitCode = 1;
});
