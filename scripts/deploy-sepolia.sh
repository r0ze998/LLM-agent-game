#!/usr/bin/env bash
set -euo pipefail

# Deploy Dojo contracts to Starknet Sepolia testnet
#
# Prerequisites:
#   1. sozo v1.5 installed: dojoup -v 1.5.0
#   2. Funded Sepolia account address + private key in dojo_sepolia.toml
#
# Usage:
#   ./scripts/deploy-sepolia.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/../packages/contracts"

cd "$CONTRACTS_DIR"

echo "=== Building contracts ==="
sozo build

echo ""
echo "=== Migrating to Sepolia (profile: sepolia) ==="
sozo migrate --profile sepolia

echo ""
echo "=== Running setup: register_all ==="
sozo execute aw-setup register_all --profile sepolia

echo ""
echo "=== Deployment complete ==="
echo ""
echo "Deployed addresses (from manifest_sepolia.json):"
if command -v jq &>/dev/null && [ -f manifest_sepolia.json ]; then
  echo "  World: $(jq -r '.world.address' manifest_sepolia.json)"
  echo "  Contracts:"
  jq -r '.contracts[] | "    \(.tag): \(.address)"' manifest_sepolia.json
  echo ""
  echo "  Models:"
  jq -r '.models[] | "    \(.tag): \(.selector)"' manifest_sepolia.json
else
  echo "  (install jq to see parsed addresses, or check manifest_sepolia.json)"
fi
