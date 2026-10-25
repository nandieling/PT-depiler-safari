#!/usr/bin/env bash
#
# 从上游 pt-plugins/PT-depiler 同步新版本，本地和 GitHub Actions 共用同一套逻辑。
#
# 本仓库的历史是压缩过的快照，与上游没有共同祖先，所以这里不做 merge，而是把
# 「上次同步到的上游提交 -> 本次上游提交」的 diff 以三方合并的方式打在 HEAD 上
# （git apply --3way）：
#
#   * 只同步下面 sync_paths 列出的上游路径，.github、scripts、safari 等本仓库自建
#     内容不受影响
#   * package.json 整体采用上游内容，再由 scripts/sync-package-json.mjs 写回移植版
#     自己的版本号与脚本，所以版本号差异不会造成冲突
#   * 其他无法自动合并的文件会留下冲突标记，脚本列出它们并以退出码 1 结束，等待人工处理
#
# 上次同步到的上游提交记录在仓库根目录的 .upstream-synced 里，同步成功后更新。
# 上游的标签既不会拉取也不会推送，本仓库的标签只属于自己的发布版本。
#
# 环境变量：
#   UPSTREAM_REPO    上游仓库地址，默认 https://github.com/pt-plugins/PT-depiler.git
#   UPSTREAM_BRANCH  未指定 UPSTREAM_REF 时同步的上游分支，默认 master
#   UPSTREAM_REF     同步目标：上游分支名或 40 位提交号，用于回放到指定版本
#   UPSTREAM_BUMP_VERSION
#                    设为 1 时把移植版自己的版本号最后一位 +1（1.3 -> 1.4），
#                    自动同步工作流用它，做到"上游每更新一次就发一版"。
#                    上游在本次同步范围内没有实际改动时不会加一，空同步不会发版；
#                    同步分支上已经挂着比 main 更新的一个版本时也不会再加一，
#                    避免一个迟迟没被合并的冲突 PR 每天吃掉一个版本号。
#   UPSTREAM_MARK_ON_CONFLICT
#                    设为 1 时即使有冲突也把 .upstream-synced 推进到本次目标。
#                    自动同步工作流用它：冲突的解法会随 PR 一起评审，合并即视为同步完成。

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"
upstream_repo="${UPSTREAM_REPO:-https://github.com/pt-plugins/PT-depiler.git}"
upstream_branch="${UPSTREAM_BRANCH:-master}"
marker_file="${repo_dir}/.upstream-synced"

# 只同步上游代码；本仓库自建的 Safari 移植层与工程文件不在同步范围内
sync_paths=(src public vite vite.config.ts package.json pnpm-lock.yaml pnpm-workspace.yaml patches .dsh)

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

cd "${repo_dir}"

[[ -z "$(git status --porcelain)" ]] || die "工作区不干净，请先提交或 git stash 之后再同步上游。"
[[ -f "${marker_file}" ]] || die "找不到 ${marker_file}，请先写入当前分支对应的上游提交号。"

base_commit="$(tr -d '[:space:]' <"${marker_file}")"
[[ "${base_commit}" =~ ^[0-9a-f]{7,40}$ ]] || die "${marker_file} 中不是提交号：${base_commit}"

target_commit="${UPSTREAM_REF:-${upstream_branch}}"
if [[ ! "${target_commit}" =~ ^[0-9a-f]{40}$ ]]; then
  resolved="$(git ls-remote "${upstream_repo}" "refs/heads/${target_commit}" | awk '{print $1; exit}')"
  [[ -n "${resolved}" ]] || die "无法解析上游分支 ${target_commit}。"
  target_commit="${resolved}"
fi

if [[ "${base_commit}" == "${target_commit}" ]]; then
  echo "已经是最新：上游 ${target_commit}"
  exit 0
fi

# CI 中是浅克隆，只取用到的两个提交；本地仓库已有完整上游历史，走普通增量拉取
depth_flag=""
if [[ "$(git rev-parse --is-shallow-repository)" == "true" ]]; then
  depth_flag="--depth=1"
fi

fetch_upstream_commit() {
  local sha="$1"
  if git cat-file -e "${sha}^{commit}" 2>/dev/null; then
    return 0
  fi
  if ! git fetch ${depth_flag} --no-tags --quiet "${upstream_repo}" "${sha}"; then
    # 少数服务端不支持按提交号取对象，退回完整拉取上游分支
    git fetch --no-tags --quiet "${upstream_repo}" "${upstream_branch}"
  fi
  git cat-file -e "${sha}^{commit}" 2>/dev/null || die "本地缺少上游提交 ${sha}。"
}

fetch_upstream_commit "${target_commit}"
fetch_upstream_commit "${base_commit}"

if git rev-parse --verify --quiet "${target_commit}^" >/dev/null; then
  echo "同步范围：$(git log -1 --format='%h %ad %s' --date=short "${base_commit}")"
  echo "        -> $(git log -1 --format='%h %ad %s' --date=short "${target_commit}")"
  echo "        （$(git rev-list --count "${base_commit}..${target_commit}") 个上游提交）"
else
  # 浅克隆里没有上游历史，提交列表由工作流用 GitHub API 生成
  echo "同步范围：${base_commit:0:8} -> ${target_commit:0:8}（浅克隆，未拉取上游历史）"
fi

# 先算出上游在同步范围内的改动，再决定是否升移植版自己的版本号
patch_file="$(mktemp -t ptd-upstream)"
trap 'rm -f "${patch_file}"' EXIT
git diff --binary "${base_commit}" "${target_commit}" -- "${sync_paths[@]}" >"${patch_file}"
has_upstream_changes=0
[[ -s "${patch_file}" ]] && has_upstream_changes=1

# package.json 会被整体替换成上游内容，先记住移植版自己的版本号
port_version="$(git show HEAD:package.json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")"
if [[ "${UPSTREAM_BUMP_VERSION:-0}" == "1" ]] && [[ "${has_upstream_changes}" == "1" ]]; then
  # 自动发版：不动上游版本号，只把移植版自己的最后一位加一
  main_version=""
  if git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null; then
    main_version="$(git show refs/remotes/origin/main:package.json 2>/dev/null |
      node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version" 2>/dev/null || true)"
  fi
  bumped="$(PORT_VERSION="${port_version}" MAIN_VERSION="${main_version}" node -e '
    const parse = (v) => v.split(".").map(Number);
    const cmp = (a, b) => {
      for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        const diff = (a[i] || 0) - (b[i] || 0);
        if (diff) return diff;
      }
      return 0;
    };
    const current = parse(process.env.PORT_VERSION);
    const main = process.env.MAIN_VERSION ? parse(process.env.MAIN_VERSION) : null;
    // 分支上已经有比 main 新的版本号，说明上一个同步 PR 还挂着，不再继续加
    const next = main && cmp(current, main) > 0 ? current : current.slice(0, -1).concat(current[current.length - 1] + 1);
    process.stdout.write(next.join("."));
  ')"
  if [[ "${bumped}" == "${port_version}" ]]; then
    echo "移植版版本号保持 ${port_version}：main 上还是 ${main_version}，上一个同步 PR 尚未合并。"
  else
    echo "移植版版本号：${port_version} -> ${bumped}"
    port_version="${bumped}"
  fi
elif [[ "${UPSTREAM_BUMP_VERSION:-0}" == "1" ]]; then
  echo "上游在本次同步范围内没有改动，移植版版本号保持 ${port_version}。"
fi

apply_status=0
if [[ -s "${patch_file}" ]]; then
  git apply --3way --index "${patch_file}" || apply_status=$?
else
  echo "同步范围内没有实际改动。"
fi

# package.json：以上游为准，再补回移植版自己的版本号与脚本
git checkout "${target_commit}" -- package.json
PORT_VERSION="${port_version}" node "${script_dir}/sync-package-json.mjs" "${repo_dir}/package.json"
git add package.json

# Xcode 模板里的 MARKETING_VERSION 只是占位（生成工程时以 package.json 为准），
# 一并跟着版本号走，免得它停在旧版本上让人误判 App 的实际版本
template_project="${repo_dir}/safari/PT-Depiler/PT-Depiler.xcodeproj/project.pbxproj"
if [[ -f "${template_project}" ]]; then
  MARKETING_VERSION="${port_version}" perl -0pi -e \
    's/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $ENV{MARKETING_VERSION};/g' "${template_project}"
  git add "safari/PT-Depiler/PT-Depiler.xcodeproj/project.pbxproj"
fi

unmerged="$(git diff --name-only --diff-filter=U)"
conflicts=()
while IFS= read -r conflicted; do
  if [[ -n "${conflicted}" ]]; then
    conflicts+=("${conflicted}")
  fi
done <<<"${unmerged}"

# 上一次运行留下的冲突标记也一起找出来：本次补丁没报冲突不代表分支是干净的，
# 放任它们只会让它们一路混到 pnpm check，最后剩一句难懂的 TS1185
stale=()
while IFS= read -r marked; do
  if [[ -n "${marked}" ]] && { [[ -z "${unmerged}" ]] || ! grep -Fxq -- "${marked}" <<<"${unmerged}"; }; then
    stale+=("${marked}")
  fi
done < <(git grep -lI -E "^(<<<<<<<|>>>>>>>)" -- "${sync_paths[@]}" 2>/dev/null || true)

if [[ ${apply_status} -ne 0 ]] || [[ ${#conflicts[@]} -gt 0 ]] || [[ ${#stale[@]} -gt 0 ]]; then
  echo
  if [[ ${#conflicts[@]} -gt 0 ]]; then
    echo "上游改动已打补丁，但以下文件需要人工合并（搜索 <<<<<<< ）："
    for conflicted in "${conflicts[@]}"; do
      printf 'conflicted-file: %s\n' "${conflicted}"
    done
  fi
  if [[ ${#stale[@]} -gt 0 ]]; then
    echo "以下文件残留着上一次同步的冲突标记，请一并人工处理："
    for marked in "${stale[@]}"; do
      printf 'conflicted-file: %s\n' "${marked}"
    done
  fi
  if [[ ${#conflicts[@]} -eq 0 ]] && [[ ${#stale[@]} -eq 0 ]]; then
    echo "补丁未能完整应用（git apply 退出码 ${apply_status}），请检查 git status。"
  fi
  if [[ "${UPSTREAM_MARK_ON_CONFLICT:-0}" == "1" ]]; then
    printf '%s\n' "${target_commit}" >"${marker_file}"
    git add "${marker_file}"
    echo "基线已推进到 ${target_commit}：解决冲突后合并即可，不必再跑一次同步。"
  else
    echo "基线未更新，仍为 ${base_commit}。"
  fi
  exit 1
fi

printf '%s\n' "${target_commit}" >"${marker_file}"
git add "${marker_file}"

echo
echo "已同步到 ${target_commit}。请依次执行："
echo "  pnpm install --no-frozen-lockfile"
echo "  pnpm check"
echo "  pnpm build:dist-safari"
echo "（package.json 的 version 现为 $(node -p "require('./package.json').version")）"
