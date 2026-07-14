#!/usr/bin/env bash
set -euo pipefail

AVATAR_DIR="/home/ubuntu/ultramax-landing/images/user-avatars"
MAX_AGE_DAYS=90
MODE="${1:-dry-run}"

if [[ ! -d "$AVATAR_DIR" ]]; then
  echo "Avatar directory not found: $AVATAR_DIR"
  exit 1
fi

echo "Avatar cleanup started"
echo "Directory: $AVATAR_DIR"
echo "Max age:  $MAX_AGE_DAYS days"
echo "Mode:     $MODE"
echo

count=0

while IFS= read -r -d '' file; do
  count=$((count + 1))

  if [[ "$MODE" == "delete" ]]; then
    rm -f -- "$file"
    echo "Deleted: $file"
  else
    echo "Would delete: $file"
  fi
done < <(
  find "$AVATAR_DIR" \
    -type f \
    -name '*.webp' \
    -mtime +"$MAX_AGE_DAYS" \
    -print0
)

echo

if [[ "$MODE" == "delete" ]]; then
  echo "Cleanup complete. Deleted $count file(s)."
else
  echo "Dry run complete. $count file(s) would be deleted."
fi
