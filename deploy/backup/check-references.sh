#!/bin/sh
set -eu
umask 077

references=$(mktemp)
missing=$(mktemp)
trap 'rm -f "$references" "$missing"' EXIT
psql --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align > "$references" <<'SQL'
SELECT CASE kind WHEN 'avatar' THEN 'avatars/' WHEN 'signature' THEN 'signatures/' ELSE 'exports/' END || path FROM files
UNION SELECT 'avatars/' || avatar_path FROM users WHERE avatar_path IS NOT NULL
UNION SELECT 'signatures/' || signature_path FROM contract_signatories WHERE signature_path IS NOT NULL
UNION SELECT 'contracts/' || signed_pdf_path FROM contracts WHERE signed_pdf_path IS NOT NULL;
SQL
while IFS= read -r relative; do
    case "$relative" in
        *..*|*\\*|/*) printf 'Referencia inválida: %s\n' "$relative" >> "$missing"; continue ;;
        avatars/*|signatures/*|contracts/*|exports/*) ;;
        *) printf 'Referencia inválida: %s\n' "$relative" >> "$missing"; continue ;;
    esac
    if [ -f "/storage/$relative" ]; then
        continue
    fi
    recovered=false
    # Newest first; storage objects have immutable, server-generated names.
    for trash_day in $(find /storage/.trash -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -r); do
        if [ -f "$trash_day/$relative" ]; then
            mkdir -p "$(dirname "/storage/$relative")"
            cp -p "$trash_day/$relative" "/storage/$relative"
            recovered=true
            printf 'Recuperado de papelera: %s\n' "$relative"
            break
        fi
    done
    if [ "$recovered" = false ]; then
        printf 'Falta: %s\n' "$relative" >> "$missing"
    fi
done < "$references"
if [ -s "$missing" ]; then
    cat "$missing" >&2
    echo "Referencias incompletas: mantenga la aplicación parada." >&2
    exit 1
fi
echo "Referencias BD/archivos verificadas."
