#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"

app_name="${SAFARI_APP_NAME:-PT-Depiler}"
project_dir="${SAFARI_PROJECT_DIR:-safari-project}"
if [[ "${project_dir}" != /* ]]; then
  project_dir="${repo_dir}/${project_dir}"
fi
derived_data_dir="${project_dir}/DerivedData"
project_path="${project_dir}/${app_name}/${app_name}.xcodeproj"

"${script_dir}/create-safari-project.sh"

xcodebuild \
  -project "${project_path}" \
  -scheme "${app_name}" \
  -configuration Debug \
  -derivedDataPath "${derived_data_dir}" \
  CODE_SIGNING_ALLOWED=NO \
  build

echo "Unsigned app: ${derived_data_dir}/Build/Products/Debug/${app_name}.app"
echo "Open ${project_path} in Xcode and select your Development Team to run the extension in Safari."
