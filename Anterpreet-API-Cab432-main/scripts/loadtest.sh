#!/usr/bin/env bash
set -euo pipefail
if [ $# -lt 2 ]; then
  echo "Usage: $0 <base_url> <jwt>"
  echo "Example: $0 http://localhost:8080 eyJhbGciOi..."
  exit 1
fi
BASE="$1"
JWT="$2"

IMG_ID=$(curl -s -H "Authorization: Bearer $JWT" "$BASE/api/v1/images?limit=1" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -n1)
if [ -z "$IMG_ID" ]; then
  echo "No images found. Importing one..."
  curl -s -X POST -H "Authorization: Bearer $JWT" "$BASE/api/v1/images/import" >/dev/null
  sleep 1
  IMG_ID=$(curl -s -H "Authorization: Bearer $JWT" "$BASE/api/v1/images?limit=1" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -n1)
fi
echo "Using imageId=$IMG_ID"

# Fire 400 processing jobs quickly (adjust as needed)
for i in $(seq 1 400); do
  curl -s -X POST "$BASE/api/v1/jobs" \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d "{\"imageId\":\"$IMG_ID\",\"params\":{\"preset\":\"max\",\"repeats\":2}}" >/dev/null &
done
wait
echo "Load test complete."
