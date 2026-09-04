import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { buildSelfLink } from "@dndcloud/core";

// Lien "self" d'un objet, permettant à un client de retrouver ses détails complets (auto-discovery)
export function buildItemSelfLink(event: APIGatewayProxyEventV2, id: string): string {
    return buildSelfLink(event, "items", id);
}
