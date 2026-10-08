#!/usr/bin/env bash
# Build la webapp (Nuxt generate) et la publie sur le bucket S3 du stack, puis invalide CloudFront.
set -euo pipefail

STACK="${STACK_NAME:-DnDCloudCompagnon}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

BUCKET="$(output WebBucketName)"
DIST="$(output WebDistributionId)"

# apiBase vaut "" en production (même origine que l'API)
(cd "$ROOT/webapp" && npm run generate)

OUT="$ROOT/webapp/.output/public"
# Assets versionnés : cache long ; le reste (html, sw, manifest) est revalidé
aws s3 sync "$OUT" "s3://$BUCKET" --delete --exclude "_nuxt/*" --cache-control "no-cache"
aws s3 sync "$OUT/_nuxt" "s3://$BUCKET/_nuxt" --delete --cache-control "public,max-age=31536000,immutable"

aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null
echo "Déployé sur https://dnd.nerevahr.fr/"
