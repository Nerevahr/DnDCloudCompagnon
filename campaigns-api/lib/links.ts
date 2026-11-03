import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { buildSelfLink } from "@dndcloud/core";

// Lien "self" d'une campagne, permettant à un client de retrouver ses détails complets (auto-discovery)
export function buildCampaignSelfLink(event: APIGatewayProxyEventV2, id: string): string {
    return buildSelfLink(event, "api/v1/campaigns", id);
}
