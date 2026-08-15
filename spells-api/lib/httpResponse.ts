import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export const successResponse = (body: unknown): APIGatewayProxyStructuredResultV2 => ({
    statusCode: 200,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" // CORS
    },
    body: JSON.stringify(body)
});

export const errorResponse = (message: string, error: Error): APIGatewayProxyStructuredResultV2 => ({
    statusCode: 500,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        error: message,
        details: error.message
    })
});

export const notFoundResponse = (message: string): APIGatewayProxyStructuredResultV2 => ({
    statusCode: 404,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: message })
});
