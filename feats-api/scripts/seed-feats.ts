import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DynamoDBClient, type DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

interface FeatPrerequisite {
    type: string;
    value: string;
}

interface Feat {
    name: string;
    type: string;
    prerequisites: FeatPrerequisite[];
    featDescription: string;
}

interface FeatItem {
    PK: string;
    SK: string;
    Name: string;
    Category: string;
    Prerequisites: { Type: string; Value: string }[];
    Description: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "..", "data", "feats.json");
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

function toItem(feat: Feat): FeatItem {
    return {
        PK: `FEAT#${slugify(feat.name)}`,
        SK: "METADATA",
        Name: feat.name,
        Category: feat.type,
        Prerequisites: feat.prerequisites.map((prerequisite) => ({
            Type: prerequisite.type,
            Value: prerequisite.value
        })),
        Description: feat.featDescription
    };
}

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

async function loadFeats(): Promise<Feat[]> {
    const raw = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as Feat[];
}

async function writeBatch(items: FeatItem[]): Promise<void> {
    let requestItems: Record<string, { PutRequest: { Item: FeatItem } }[]> = {
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
    console.log(`Seed des dons -> table "${tableName}" (région ${region}, endpoint ${endpoint || "AWS par défaut"})`);

    const feats = await loadFeats();
    const items = feats.map(toItem);

    for (const batch of chunk(items, BATCH_SIZE)) {
        await writeBatch(batch);
    }

    console.log(`${items.length} don(s) inséré(s) avec succès.`);
}

main().catch((error: Error & { name?: string }) => {
    if (error.name === "ResourceNotFoundException") {
        console.error(
            `La table "${tableName}" n'existe pas sur l'endpoint ${endpoint || "AWS par défaut"}. Créez-la avant de lancer le seed.`
        );
    } else {
        console.error("Échec du seed des dons :", error);
    }
    process.exitCode = 1;
});
