#!/usr/bin/env bash
#
# 从上游 pt-plugins/PT-depiler 同步新版本。
#
# 本仓库的历史是压缩过的单个提交，与上游没有共同祖先，所以这里不做 merge，
# 而是把「上次同步到的上游提交 -> 本次上游提交」的 diff 以三方合并的方式打在
# 当前工作区上（git apply --3way），这样 Safari 移植层的改动会被保留，
# 真正冲突的文件会留下冲突标记等待人工处理。
#
# 上次同步到的上游提交记录在仓库根目录的 .upstream-synced 里，同步成功后会被更新。

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"
remote_name="${UPSTREAM_REMOTE:-upstream}"
upstream_repo="${UPSTREAM_REPO:-https://github.com/pt-plugins/PT-depiler.git}"
upstream_branch="${UPSTREAM_BRANCH:-master}"
marker_file="${repo_dir}/.upstream-synced"

# 只同步上游代码，本仓库自建的 Safari/工程文件不参与同步
sync_paths=(src public vite vite.config.ts package.json pnpm-lock.yaml pnpm-workspace.yaml .dsh)

cd "${repo_dir}"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: commit or stash local changes before updating from upstream." >&2
  exit 1
fi

if ! git remote get-url "${remote_name}" >/dev/null 2>&1; then
  echo "adding remote '${remote_name}' -> ${upstream_repo}"
  git remote add "${remote_name}" "${upstream_repo}"
fi

git fetch --tags "${remote_name}" "${upstream_branch}"

if [[ ! -f "${marker_file}" ]]; then
  echo "error: ${marker_file} not found; write the upstream commit this branch was based on into it." >&2
  exit 1
fi

base_commit="$(tr -d '[:space:]' <"${marker_file}")"
if ! git cat-file -e "${base_commit}^{commit}" 2>/dev/null; then
  echo "error: upstream commit ${base_commit} is not available locally; fetch the full upstream history first." >&2
  exit 1
fi

target_commit="$(git rev-parse "${remote_name}/${upstream_branch}")"
if [[ "${base_commit}" == "${target_commit}" ]]; then
  echo "already up to date with ${remote_name}/${upstream_branch} (${base_commit})."
  exit 0
fi

echo "syncing $(git log -1 --format='%h %ad %s' --date=short "${base_commit}")"
echo "     -> $(git log -1 --format='%h %ad %s' --date=short "${target_commit}")"

patch_file="$(mktemp -t ptd-upstream)"
trap 'rm -f "${patch_file}"' EXIT
git diff --binary "${base_commit}" "${target_commit}" -- "${sync_paths[@]}" >"${patch_file}"

set +e
git apply --3way --index "${patch_file}"
apply_status=$?
set -e

if [[ ${apply_status} -ne 0 ]] || [[ -n "$(git diff --name-only --diff-filter=U)" ]]; then
  echo
  echo "上游改动已打补丁，但以下文件存在冲突，需要手工合并（搜索 <<<<<<< ）:" >&2
  git diff --name-only --diff-filter=U >&2
  exit 1
fi

printf '%s\n' "${target_commit}" >"${marker_file}"
git add "${marker_file}"

echo
echo "已同步到 ${target_commit}。请依次执行:"
echo "  pnpm install --no-frozen-lockfile"
echo "  pnpm check"
echo "  pnpm build:dist-safari"
