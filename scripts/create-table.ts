import {
    DynamoDBClient,
    CreateTableCommand,
    ResourceInUseException,
    type DynamoDBClientConfig
} from "@aws-sdk/client-dynamodb";

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

async function main(): Promise<void> {
    console.log(`Création de la table "${tableName}" (région ${region}, endpoint ${endpoint || "AWS par défaut"})`);

    try {
        await client.send(
            new CreateTableCommand({
                TableName: tableName,
                AttributeDefinitions: [
                    { AttributeName: "PK", AttributeType: "S" },
                    { AttributeName: "SK", AttributeType: "S" }
                ],
                KeySchema: [
                    { AttributeName: "PK", KeyType: "HASH" },
                    { AttributeName: "SK", KeyType: "RANGE" }
                ],
                BillingMode: "PAY_PER_REQUEST"
            })
        );
        console.log(`Table "${tableName}" créée avec succès.`);
    } catch (error) {
        if (error instanceof ResourceInUseException) {
            console.log(`Table "${tableName}" déjà existante, rien à faire.`);
            return;
        }
        throw error;
    }
}

main().catch((error: Error) => {
    console.error("Échec de la création de la table :", error);
    process.exitCode = 1;
});
