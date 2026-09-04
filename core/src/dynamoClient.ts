import { DynamoDBClient, type DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const isLocal = process.env.AWS_SAM_LOCAL === "true";
const clientConfig: DynamoDBClientConfig = {
    region: process.env.AWS_REGION || "eu-west-3"
};

if (isLocal) {
    clientConfig.endpoint = "http://host.docker.internal:8000";
    clientConfig.credentials = {
        accessKeyId: "fakeMyKeyId",
        secretAccessKey: "fakeSecretAccessKey"
    };
}

const client = new DynamoDBClient(clientConfig);

export const docClient = DynamoDBDocumentClient.from(client);
export const tableName = process.env.TABLE_NAME || "DnD_Companion";
