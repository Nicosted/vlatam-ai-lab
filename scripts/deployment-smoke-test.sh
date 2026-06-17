#!/bin/bash
set -euo pipefail

API_KEY="${API_KEY:-staging-key-1}"
API_URL="${API_URL:-http://localhost:3000}"

echo "Running deployment smoke tests..."

echo "Test 1: GET /health (public)"
curl -f -s -o /dev/null "$API_URL/health" || exit 1

echo "Test 2: GET /api/classifier/infoleg/artifact--infoleg--extraction-001 (no auth, expect 401)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API_URL/api/classifier/infoleg/artifact--infoleg--extraction-001")
if [ "$HTTP_CODE" != "401" ]; then
  echo "Expected 401, got $HTTP_CODE"
  exit 1
fi

echo "Test 3: GET /api/classifier/infoleg/artifact--infoleg--extraction-001 (with auth, expect 200)"
curl -f -s -H "x-vlatam-ai-lab-key: $API_KEY" \
  -o /dev/null "$API_URL/api/classifier/infoleg/artifact--infoleg--extraction-001" || exit 1

echo "Test 4: GET /api/classifier/infoleg/artifact--infoleg--nonexistent (with auth, expect 404)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "x-vlatam-ai-lab-key: $API_KEY" \
  "$API_URL/api/classifier/infoleg/artifact--infoleg--nonexistent")
if [ "$HTTP_CODE" != "404" ]; then
  echo "Expected 404, got $HTTP_CODE"
  exit 1
fi

echo "Test 5: GET /api/classifier/..%2F..%2Fetc%2Fpasswd/artifact--x--value (with auth, expect 400)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --path-as-is \
  -H "x-vlatam-ai-lab-key: $API_KEY" \
  "$API_URL/api/classifier/..%2F..%2Fetc%2Fpasswd/artifact--x--value")
if [ "$HTTP_CODE" != "400" ]; then
  echo "Expected 400, got $HTTP_CODE"
  exit 1
fi

echo "All smoke tests passed."
