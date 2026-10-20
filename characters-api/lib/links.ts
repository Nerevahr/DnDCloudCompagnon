import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { buildSelfLink } from "@dndcloud/core";

// Lien "self" d'un personnage, permettant à un client de retrouver ses détails complets (auto-discovery)
export function buildCharacterSelfLink(event: APIGatewayProxyEventV2, id: string): string {
    return buildSelfLink(event, "api/v1/characters", id);
}
