import type { APIGatewayProxyEventV2 } from "aws-lambda";

// Reconstruit l'URL de base de l'API à partir de la requête entrante, pour générer des liens absolus.
// En prod, les clients passent par CloudFront (voir template.yaml) : API Gateway exige que le header
// Host corresponde à son propre domaine execute-api (sinon 403 Forbidden), donc CloudFront ne peut pas
// le transmettre tel quel. Une CloudFront Function (SpellsForwardHostFunction) copie plutôt le Host du
// visiteur dans X-Forwarded-Host avant que la politique n'exclue Host — c'est ce header qu'on préfère
// ici. Dans ce cas le préfixe de stage ne doit pas être ajouté car l'OriginPath de la distribution s'en
// charge déjà. Sans ce header (accès direct à l'API Gateway, ou sam local), on retombe sur le
// comportement historique basé sur domainName, avec le préfixe de stage.
function buildBaseUrl(event: APIGatewayProxyEventV2): string {
    const domainName = event.requestContext.domainName;
    const forwardedHost = event.headers?.["x-forwarded-host"];
    const host = forwardedHost ?? domainName;
    const stage = event.requestContext.stage;
    const protocol = event.headers?.["x-forwarded-proto"] ?? "https";
    const stagePrefix = !forwardedHost && stage && stage !== "$default" ? `/${stage}` : "";

    return `${protocol}://${host}${stagePrefix}`;
}

// Lien "self" d'un sort, permettant à un client de retrouver ses détails complets (auto-discovery)
export function buildSpellSelfLink(event: APIGatewayProxyEventV2, id: string): string {
    return `${buildBaseUrl(event)}/spells/${id}`;
}
