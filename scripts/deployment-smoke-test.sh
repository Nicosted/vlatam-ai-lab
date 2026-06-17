#!/bin/bash
set -euo pipefail

API_URL=${API_URL:-http://localhost:3000}

echo "Running deployment smoke test..."

echo "1. Testing health endpoint..."
curl --fail --silent --show-error "$API_URL/health" > /dev/null
echo "✓ Health check passed"

echo "2. Testing classifier endpoint..."
curl --fail --silent --show-error \
  "$API_URL/api/classifier/infoleg/artifact--infoleg--extraction-001" > /dev/null
echo "✓ Classifier endpoint passed"

echo "3. Testing 404 handling..."
HTTP_CODE=$(curl --silent --output /dev/null --write-out "%{http_code}" \
  "$API_URL/api/classifier/infoleg/artifact--infoleg--nonexistent")
if [ "$HTTP_CODE" != "404" ]; then
  echo "✗ Expected 404, got $HTTP_CODE"
  exit 1
fi
echo "✓ 404 handling passed"

echo "4. Testing path traversal protection..."
HTTP_CODE=$(curl --path-as-is --silent --output /dev/null --write-out "%{http_code}" \
  "$API_URL/api/classifier/..%2Fetc/artifact--x--value")
if [ "$HTTP_CODE" != "400" ]; then
  echo "✗ Expected 400, got $HTTP_CODE"
  exit 1
fi
echo "✓ Path traversal protection passed"

echo
echo "✓ All smoke tests passed"
