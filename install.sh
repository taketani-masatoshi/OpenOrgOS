#!/usr/bin/env bash
# OrgOS Core installer — curl | bash  (or: bash install.sh)
set -euo pipefail

ORGOS_VERSION="${ORGOS_VERSION:-0.8.0}"
INSTALL_DIR="${ORGOS_INSTALL_DIR:-${HOME}/.orgos}"
REPO="${ORGOS_REPO:-https://github.com/orgos-reference/orgos.git}"

echo "OrgOS Core installer · v${ORGOS_VERSION}"
echo "  Install dir: ${INSTALL_DIR}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js >= 20 required — install from https://nodejs.org or: brew install node@22"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if (( NODE_MAJOR < 20 )); then
  echo "Node $(node -v) is too old — need >= 20"
  exit 1
fi

mkdir -p "${INSTALL_DIR}"
if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  git clone --depth 1 --branch "v${ORGOS_VERSION}" "${REPO}" "${INSTALL_DIR}/src" 2>/dev/null \
    || git clone --depth 1 "${REPO}" "${INSTALL_DIR}/src"
fi

cd "${INSTALL_DIR}/src"
npm ci --omit=dev
npm run build:package

PKG="${INSTALL_DIR}/cli"
rm -rf "${PKG}"
cp -R packages/orgos-cli "${PKG}"

LINE='export PATH="'"${PKG}/bin"'":$PATH'
LINE2='export ORGOS_HOME="'"${PKG}"'"'
for RC in "${HOME}/.zshrc" "${HOME}/.bashrc"; do
  if [[ -f "${RC}" ]] && ! grep -q 'ORGOS_HOME' "${RC}" 2>/dev/null; then
    printf '\n# OrgOS Core\n%s\n%s\n' "${LINE2}" "${LINE}" >> "${RC}"
    echo "  Updated ${RC}"
  fi
done

export PATH="${PKG}/bin:${PATH}"
export ORGOS_HOME="${PKG}"

echo ""
echo "✓ Installed — run: orgos doctor"
echo "  Quickstart:"
echo "    mkdir ~/my-orgos && cd ~/my-orgos"
echo "    orgos workspace init"
echo "    orgos init demo --name \"Demo Corp\""
