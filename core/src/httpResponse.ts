import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export const successResponse = (body: unknown): APIGatewayProxyStructuredResultV2 => ({
    statusCode: 200,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
});

export const errorResponse = (message: string, error: Error): APIGatewayProxyStructuredResultV2 => ({
    statusCode: 500,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify({
        error: message,
        details: error.message
    })
});

export const notFoundResponse = (message: string): APIGatewayProxyStructuredResultV2 => ({
    statusCode: 404,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify({ error: message })
});

const jsonHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
};

export const createdResponse = (body: unknown, location: string): APIGatewayProxyStructuredResultV2 => ({
    statusCode: 201,
    headers: { ...jsonHeaders, Location: location },
    body: JSON.stringify(body)
});

export const noContentResponse = (): APIGatewayProxyStructuredResultV2 => ({
    statusCode: 204,
    headers: { "Access-Control-Allow-Origin": "*" }
});

export const badRequestResponse = (message: string, details?: string[]): APIGatewayProxyStructuredResultV2 => ({
    statusCode: 400,
    headers: jsonHeaders,
    body: JSON.stringify(details ? { error: message, details } : { error: message })
});

export const unauthorizedResponse = (message: string): APIGatewayProxyStructuredResultV2 => ({
    statusCode: 401,
    headers: jsonHeaders,
    body: JSON.stringify({ error: message })
});
