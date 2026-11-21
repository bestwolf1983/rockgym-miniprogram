#!/usr/bin/env bash
# 公开发布前的凭据自检（零依赖；本机装了 gitleaks 会自动增加深度扫描）。
#
#   ./scripts/pre-publish-check.sh            完整复核：工作区、提交历史、交付件
#   ./scripts/pre-publish-check.sh --staged  只检查本次提交（供 pre-commit 调用）
#
# 可选环境变量：
#   FORBIDDEN_EMAIL_DOMAINS  禁止出现在提交里的邮箱域名，空格分隔
#   EXTRA_PATTERNS           追加的 grep -E 模式（内部域名、自定义令牌前缀等）
#
# 本脚本会进入公开仓库，因此不内置任何公司专属标识；这类规则由本地钩子传入。

set -u
repo=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "不是 Git 仓库" >&2; exit 1; }
cd "$repo" || exit 1

staged=0
[ "${1:-}" = "--staged" ] && staged=1
fail=0
ok()   { printf '  ok    %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1" >&2; fail=1; }
note() { printf '  note  %s\n' "$1"; }

if [ "$staged" -eq 1 ]; then
  printf '== 提交前检查 ==\n'
else
  printf '== 发布前复核 ==\n'
fi

# 1. 提交身份
email=$(git config user.email 2>/dev/null || true)
if [ -z "$email" ]; then
  bad "user.email 未配置"
else
  domain=${email##*@}
  blocked=""
  for d in ${FORBIDDEN_EMAIL_DOMAINS:-}; do
    case "$domain" in *"$d"*) blocked="$d"; break ;; esac
  done
  if [ -n "$blocked" ]; then
    bad "提交邮箱命中禁用域名（${blocked}），请改用仓库级个人邮箱"
  else
    ok "提交邮箱域名: $domain"
  fi
fi

# 2. 会进入仓库的文件：文件名 + 内容
sensitive_name='(^|/)(\.env|\.env\..*|.*\.pem|.*\.key|.*\.p12|.*secret.*|.*credential.*|project\.private\.config\.json)$'
PAT='-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|(APPSECRET|appSecret|AppSecret|FIELD_ENCRYPTION_KEY|FIELD_HASH_SALT|DATABASE_URL|REDIS_URL|api[_-]?key|apiKey|access[_-]?token|client[_-]?secret|secret[_-]?key)[[:space:]]*[=:][[:space:]]*[A-Za-z0-9_+/=-]{12,}|(postgres|mysql|redis|mongodb)(\+srv)?://[^[:space:]]*:[^[:space:]@]{8,}@'
[ -n "${EXTRA_PATTERNS:-}" ] && PAT="$PAT|$EXTRA_PATTERNS"

scan_files() {
  if [ "$staged" -eq 1 ]; then
    git diff --cached --name-only --diff-filter=ACM -z
  else
    git ls-files --cached --others --exclude-standard -z
  fi
}

while IFS= read -r -d '' f; do
  [ -f "$f" ] || continue
  case "$f" in
    *.env.example|.env.example) continue ;;
  esac
  if printf '%s' "$f" | grep -qE "$sensitive_name"; then
    bad "敏感文件将进入仓库: $f"
  fi
  case "$f" in
    *.md|*.txt|*.png|*.jpg|*.jpeg|*.gif|*.svg|*.lock|package-lock.json|pnpm-lock.yaml) continue ;;
  esac
  if [ "$staged" -eq 1 ]; then
    hits=$(git show ":$f" 2>/dev/null | grep -InE -I -e "$PAT" 2>/dev/null | head -3)
  else
    hits=$(grep -InE -I -e "$PAT" "$f" 2>/dev/null | head -3)
  fi
  if [ -n "$hits" ]; then
    bad "疑似密钥内容: $f"
    printf '%s\n' "$hits" >&2
  fi
done < <(scan_files)
[ "$fail" -eq 0 ] && ok "文件名与内容扫描完成"

# 3. gitleaks 深度扫描（可选增强）
if command -v gitleaks >/dev/null 2>&1; then
  if [ "$staged" -eq 1 ]; then
    if ! (gitleaks git --staged --no-banner --redact >/dev/null 2>&1 || \
          gitleaks protect --staged --no-banner --redact >/dev/null 2>&1); then
      bad "gitleaks 在暂存内容中发现疑似密钥"
    fi
  elif git rev-parse --verify HEAD >/dev/null 2>&1; then
    if ! gitleaks git . --no-banner --redact >/dev/null 2>&1; then
      bad "gitleaks 在提交历史中发现疑似密钥"
    fi
  fi
  ok "gitleaks 深度扫描已执行"
else
  note "未安装 gitleaks，当前使用内置规则（可选增强）"
fi

# 4. 发布前专属检查
if [ "$staged" -eq 0 ]; then
  authors=$(git log --all --format='%ae' 2>/dev/null | sort -u)
  if [ -z "$authors" ]; then
    note "尚无提交历史（第一次提交前请确认上面的邮箱）"
  else
    printf '        历史作者:\n'
    printf '%s\n' "$authors" | sed 's/^/          /'
    for d in ${FORBIDDEN_EMAIL_DOMAINS:-}; do
      if printf '%s\n' "$authors" | grep -qi "@.*$d"; then
        bad "提交历史中存在禁用邮箱域名: $d"
      fi
    done
  fi

  if [ -f package-lock.json ]; then
    odd=$(grep '"resolved"' package-lock.json | grep -v 'registry.npmjs.org' | head -3)
    if [ -n "$odd" ]; then
      bad "lockfile 含非公共 registry"
      printf '%s\n' "$odd" >&2
    else
      ok "lockfile 依赖源均为公共 registry"
    fi
  fi

  for f in LICENSE README.md; do
    [ -f "$f" ] && ok "$f 已存在" || note "待补: ${f}（公开发布前需要）"
  done
  [ -f .env.example ] && ok ".env.example 已存在" || note "待补: .env.example（对外配置模板）"
fi

if [ "$fail" -eq 1 ]; then
  printf '\n检查未通过，请勿提交或发布。密钥一旦公开，第一动作是轮换，而不是删提交。\n' >&2
  exit 1
fi
printf '\n检查通过。\n'
