#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"

app_name="${SAFARI_APP_NAME:-PT-Depiler}"
bundle_id="${SAFARI_BUNDLE_ID:-com.ptplugins.ptdepiler}"
project_dir="${SAFARI_PROJECT_DIR:-safari-project}"
deployment_target="${SAFARI_DEPLOYMENT_TARGET:-13.0}"

if [[ ! "${bundle_id}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "error: SAFARI_BUNDLE_ID contains invalid characters." >&2
  exit 1
fi

if [[ "${app_name}" != "PT-Depiler" ]]; then
  echo "error: the checked-in Safari Xcode template only supports SAFARI_APP_NAME=PT-Depiler." >&2
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "error: Xcode command line tools are required." >&2
  exit 1
fi

if [[ "${SAFARI_SKIP_WEB_BUILD:-0}" != "1" ]]; then
  if [[ ! -x "${repo_dir}/node_modules/.bin/vite" ]]; then
    pnpm install --frozen-lockfile
  fi

  echo "Building the Safari Web Extension..."
  (
    cd "${repo_dir}"
    TARGET=safari ./node_modules/.bin/vite build
  )
fi

if [[ ! -f "${repo_dir}/dist-safari/manifest.json" ]]; then
  echo "error: dist-safari/manifest.json does not exist." >&2
  exit 1
fi

# The checked-in Xcode project is only a template.  Its extension resource
# references are populated below from the freshly built WebExtension.
required_resources=(
  "manifest.json"
  "_locales"
  "assets"
  "icons"
  "lib"
  "pt-depiler.css"
  "src"
  "vendor"
)
for resource in "${required_resources[@]}"; do
  if [[ ! -e "${repo_dir}/dist-safari/${resource}" ]]; then
    echo "error: Safari build output is missing '${resource}'." >&2
    echo "Run 'pnpm build:dist-safari' and inspect the Vite build before opening Xcode." >&2
    exit 1
  fi
done

echo "Preparing the Safari Xcode project..."
if [[ "${project_dir}" = /* ]]; then
  project_output_dir="${project_dir}"
else
  project_output_dir="${repo_dir}/${project_dir}"
fi

template_dir="${repo_dir}/safari/${app_name}"
project_file="${project_output_dir}/${app_name}/${app_name}.xcodeproj/project.pbxproj"
extension_resources_dir="${project_output_dir}/${app_name}/${app_name} Extension/Resources"

mkdir -p "${project_output_dir}"
ditto "${template_dir}" "${project_output_dir}/${app_name}"
rm -rf "${extension_resources_dir}"
mkdir -p "${extension_resources_dir}"
ditto "${repo_dir}/dist-safari/." "${extension_resources_dir}"

for resource in "${required_resources[@]}"; do
  if [[ ! -e "${extension_resources_dir}/${resource}" ]]; then
    echo "error: failed to copy '${resource}' into the generated Safari project." >&2
    exit 1
  fi
done

BUNDLE_ID="${bundle_id}" DEPLOYMENT_TARGET="${deployment_target}" perl -0pi -e '
  s/PRODUCT_BUNDLE_IDENTIFIER = [^;]*Extension;/PRODUCT_BUNDLE_IDENTIFIER = $ENV{BUNDLE_ID}.Extension;/g;
  s/PRODUCT_BUNDLE_IDENTIFIER = (?![^;]*Extension)[^;]+;/PRODUCT_BUNDLE_IDENTIFIER = $ENV{BUNDLE_ID};/g;
  s/MACOSX_DEPLOYMENT_TARGET = [0-9.]+;/MACOSX_DEPLOYMENT_TARGET = $ENV{DEPLOYMENT_TARGET};/g;
' "${project_file}"

echo "Safari project: ${project_file%/project.pbxproj}"
echo "Open the generated project above; do not open safari/PT-Depiler directly."
