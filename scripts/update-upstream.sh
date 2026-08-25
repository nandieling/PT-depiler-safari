#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"
remote_name="${UPSTREAM_REMOTE:-origin}"
upstream_branch="${UPSTREAM_BRANCH:-master}"

cd "${repo_dir}"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: commit or stash local changes before updating from upstream." >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
if [[ -z "${current_branch}" ]]; then
  echo "error: update must run from a local branch." >&2
  exit 1
fi

git fetch "${remote_name}" "${upstream_branch}"
git merge --no-edit "${remote_name}/${upstream_branch}"
pnpm install --frozen-lockfile

echo "Merged ${remote_name}/${upstream_branch} into ${current_branch}."
echo "Run 'pnpm build:safari-app' to verify the updated Safari build."
