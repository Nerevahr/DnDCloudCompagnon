import type { APIGatewayProxyEventV2 } from "aws-lambda";

// Reconstruit l'URL de base de l'API à partir de la requête entrante, pour générer des liens absolus.
// En local (sam local start-api), le stage est "$default" et n'apparaît pas dans l'URL ;
// une fois déployée, l'API utilise un stage nommé (ex: "prod") qui doit être préfixé.
function buildBaseUrl(event: APIGatewayProxyEventV2): string {
    const domainName = event.requestContext.domainName;
    const stage = event.requestContext.stage;
    const protocol = event.headers?.["x-forwarded-proto"] ?? "https";
    const stagePrefix = stage && stage !== "$default" ? `/${stage}` : "";

    return `${protocol}://${domainName}${stagePrefix}`;
}

// Lien "self" d'un sort, permettant à un client de retrouver ses détails complets (auto-discovery)
export function buildSpellSelfLink(event: APIGatewayProxyEventV2, id: string): string {
    return `${buildBaseUrl(event)}/spells/${id}`;
}
