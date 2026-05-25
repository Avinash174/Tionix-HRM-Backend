#!/usr/bin/env bash
# Self-signed cert for local HTTPS (phone on same Wi‑Fi).
# Usage: npm run cert:dev
# Optional: DEV_LAN_IP=192.168.1.5 npm run cert:dev

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="${ROOT}/certs"
LAN_IP="${DEV_LAN_IP:-192.168.1.5}"

mkdir -p "${CERT_DIR}"

SAN="DNS:localhost,DNS:*.local,IP:127.0.0.1,IP:${LAN_IP}"

openssl req -x509 -newkey rsa:2048 \
  -keyout "${CERT_DIR}/key.pem" \
  -out "${CERT_DIR}/cert.pem" \
  -days 365 -nodes \
  -subj "/CN=localhost/O=HRM Dev" \
  -addext "subjectAltName=${SAN}"

echo "Created ${CERT_DIR}/key.pem and cert.pem (SAN includes ${LAN_IP})"
echo "Start server: USE_HTTPS=true npm run dev"
echo "Mobile URL:   https://${LAN_IP}:5001/login"
