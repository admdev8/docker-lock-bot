#!/usr/bin/env bash

set -eou pipefail

repo="${1}"
owner="${2}"
token="${3}"
tmp_dir="${4}"
default_branch="${5}"
pr_branch="remotes/origin/${6}"
lockfile="${7}"

cd "./${tmp_dir}"

# https://developer.github.com/apps/building-github-apps/authenticating-with-github-apps/
git clone "https://x-access-token:${token}@github.com/${owner}/${repo}.git"
cd "${repo}"

docker lock generate

cat "${lockfile}"

should_commit=""

# check if PR branch exists
pr_branch_exists="$(git branch -a | tr -d " " | grep -e "^${pr_branch}$" || echo "")"

if [[ "${pr_branch_exists}" != "" ]]; then
    printf "PR branch exists\n"

    # lockfile does not exist on PR branch -> "DOES NOT EXIST"
    # lockfile exists -> git diff's output (could be "")
    should_commit=$(git diff "${pr_branch}:${lockfile}" "${lockfile}" 2>/dev/null || echo "DOES NOT EXIST")
    printf "diff:\n"
    set +e
    git diff "${pr_branch}:${lockfile}" "${lockfile}"
    set -e
else
    printf "PR branch does not exist\n"

    # lockfile does not exist on default branch -> "DOES NOT EXIST"
    # lockfile exists -> git diff's output (could be "")
    should_commit=$(git diff "${default_branch}:${lockfile}" "${lockfile}" 2>/dev/null || echo "DOES NOT EXIST")
fi

mv "${lockfile}" ../

if [[ "${should_commit}" != "" ]]; then
    exit 0
fi
exit 246
