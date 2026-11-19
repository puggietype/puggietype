#!/usr/bin/env bash
# Legal H4: in a build with accounts ON, the kids guides' CSP must name no
# accounts host (Turnstile, Firebase, Google identity APIs, the accounts API)
# and no Google analytics/ads host, in _headers and in the kids html meta CSP.
# The catch-all CSP must have Turnstile and the auth domain (proves the build
# really is ON). Reads the built files only; no server needed.
#
# usage: scripts/check-kids-csp-accounts.sh <dist dir> <firebase auth domain>
# no pipefail: `printf | grep -q` may close the pipe early on a match
set -eu

dist="${1:?dist dir}"
auth_domain="${2:?firebase auth domain}"
headers="$dist/_headers"

kids_paths=(
  /guide/teaching-kids-to-type
  /guide/teaching-kids-to-type/
  /guide/typing-for-kids
  /guide/typing-for-kids/
)
kids_html=(
  "$dist/guide/teaching-kids-to-type.html"
  "$dist/guide/typing-for-kids.html"
)
forbidden='firebaseapp|googleapis|challenges\.cloudflare|cloudflare|api\.puggietype|api\.example\.test|google-analytics|googletagmanager|analytics\.google|doubleclick|googleadservices|googlesyndication|googletagservices|fundingchoices|adservice\.google|google\.com|gstatic\.com'

fail() {
  echo "kids CSP (accounts on): $*" >&2
  exit 1
}

[ -s "$headers" ] || fail "missing or empty $headers"

# every header line as "<rule path><TAB><line>"
rule_lines() {
  awk '
    /^[^ \t#]/ { path = $0; next }
    /^[ \t]/ && path != "" { sub(/^[ \t]+/, ""); print path "\t" $0 }
  ' "$headers"
}

# header lines of exactly one rule path
rule_block() {
  rule_lines | awk -F '\t' -v want="$1" '$1 == want { print $2 }'
}

home=$(rule_block '/*')
printf '%s\n' "$home" | grep -q 'https://challenges\.cloudflare\.com' ||
  fail "catch-all CSP lacks Turnstile: is the build really accounts ON?"
printf '%s\n' "$home" | grep -qF "https://$auth_domain" ||
  fail "catch-all CSP lacks the auth domain $auth_domain"

for kids in "${kids_paths[@]}"; do
  block=$(rule_block "$kids")
  [ -n "$block" ] || fail "no rule for $kids"
  printf '%s\n' "$block" | grep -qx '! Content-Security-Policy' ||
    fail "$kids does not detach the catch-all CSP"
  count=$(printf '%s\n' "$block" | grep -c '^Content-Security-Policy:' || true)
  [ "$count" = 1 ] || fail "$kids has $count CSP lines, expected 1"
  printf '%s\n' "$block" | grep -q "frame-src 'none'" ||
    fail "$kids CSP allows frames"
  # every other rule that matches this path (globs like /guide/*) too
  while IFS=$'\t' read -r pattern line; do
    [ "$pattern" = '/*' ] && continue
    # shellcheck disable=SC2053 # glob match on purpose
    [[ "$kids" == $pattern ]] || continue
    if printf '%s\n' "$line" | grep -Eiq "$forbidden"; then
      fail "rule $pattern (applies to $kids) names a blocked host: $line"
    fi
  done < <(rule_lines)
done

for f in "${kids_html[@]}"; do
  [ -s "$f" ] || fail "missing kids html $f"
  metas=$(grep -o '<meta http-equiv="Content-Security-Policy"[^>]*>' "$f" || true)
  count=$(printf '%s' "$metas" | grep -c . || true)
  [ "$count" = 1 ] || fail "$f has $count meta CSPs, expected 1"
  if printf '%s\n' "$metas" | grep -Eiq "$forbidden"; then
    fail "$f meta CSP names a blocked host: $metas"
  fi
  printf '%s\n' "$metas" | grep -q "frame-src 'none'" ||
    fail "$f meta CSP allows frames"
  if grep -Eiq 'challenges\.cloudflare|firebaseapp|identitytoolkit|securetoken' "$f"; then
    fail "$f names an accounts host"
  fi
done

echo "kids CSP (accounts on): ok"
