import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

// Identifiant Cognito (claim "sub") de l'utilisateur, posé par l'authorizer JWT de l'API Gateway.
// sam local n'exécute pas l'authorizer : en local uniquement, on lit le "sub" directement dans le jeton
// du header Authorization (sans en vérifier la signature), pour que des utilisateurs différents restent
// distincts ; sans jeton exploitable, on retombe sur un utilisateur fictif.
// AWS_SAM_LOCAL n'est jamais défini sur une Lambda déployée : en production, seul l'authorizer fait foi.
export function getUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): unknown {
    if (process.env.AWS_SAM_LOCAL !== "true") {
        return event.requestContext.authorizer?.jwt?.claims?.sub;
    }

    const header = Object.entries(event.headers ?? {}).find(([name]) => name.toLowerCase() === "authorization")?.[1];
    try {
        const payload = header?.replace(/^Bearer\s+/i, "").split(".")[1];
        const sub = payload && JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).sub;
        if (typeof sub === "string" && sub) return sub;
    } catch { /* jeton illisible : utilisateur fictif */ }
    return "local-user";
}
