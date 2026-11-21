#!/bin/sh
# 把仓库内的钩子模板安装到 .git/hooks/。clone 后运行一次即可。
# 钩子本身不进版本库；本地专属规则放在 .git/hooks/check.local.env，安装脚本不会覆盖它。
set -e
repo=$(git rev-parse --show-toplevel) || exit 1
hooks_dir="$repo/.git/hooks"
mkdir -p "$hooks_dir"

for h in pre-commit pre-push; do
  cp "$repo/scripts/hooks/$h" "$hooks_dir/$h"
  chmod +x "$hooks_dir/$h"
  echo "installed: $h"
done

env_file="$hooks_dir/check.local.env"
if [ ! -f "$env_file" ]; then
  printf '%s\n' '# 本地专用规则（不进仓库）。可在此 export EXTRA_PATTERNS / FORBIDDEN_EMAIL_DOMAINS。' > "$env_file"
  echo "created: check.local.env (optional)"
fi

echo "hooks installed: commit 检查暂存内容，push 自动跑完整发布前复核。"
