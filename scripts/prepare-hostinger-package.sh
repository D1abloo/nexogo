#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/admin"
OUT_DIR="$ROOT_DIR/.deploy/hostinger-node-app"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

copy_if_exists() {
  local path="$1"
  if [ -e "$APP_DIR/$path" ]; then
    cp -R "$APP_DIR/$path" "$OUT_DIR/$path"
  fi
}

mkdir -p "$OUT_DIR/pages" "$OUT_DIR/lib"

copy_if_exists "pages"
copy_if_exists "lib"
copy_if_exists "components"
copy_if_exists "public"
copy_if_exists "styles.css"
copy_if_exists "package.json"
copy_if_exists "package-lock.json"
copy_if_exists "next.config.js"
copy_if_exists "jsconfig.json"
copy_if_exists ".nvmrc"
copy_if_exists ".env.production.example"

cat > "$OUT_DIR/DEPLOY_HOSTINGER.md" <<'EOF'
# Hostinger Node.js App package

Este paquete esta preparado para subirlo como aplicacion Node.js a Hostinger.

## Pasos recomendados

1. Sube este contenido a un repositorio separado o comprímelo en ZIP.
2. En Hostinger hPanel:
   - Websites
   - Add Website
   - Node.js Apps
3. Usa estas opciones:
   - Node.js version: 20.x
   - Install command: npm install
   - Build command: npm run build
   - Start command: npm run start
4. Carga las variables del archivo `.env.production.example`.
5. Redeploy.
EOF

echo "Paquete preparado en: $OUT_DIR"
echo "Si quieres subirlo por ZIP, comprime el contenido de ese directorio."
