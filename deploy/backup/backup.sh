#!/bin/sh
set -eu
umask 077
export LC_ALL=C

# Rutas fijas para que la rotación nunca actúe sobre un destino suministrado.
backup_root=/backups
lock_directory=$backup_root/.backup-lock
partial_directory=
mkdir -p "$backup_root/daily" "$backup_root/weekly"
if ! mkdir "$lock_directory" 2>/dev/null; then
    echo "Ya hay un backup en curso o quedó un bloqueo; revisar antes de reintentar." >&2
    exit 1
fi

cleanup() {
    if [ -n "$partial_directory" ]; then
        rm -rf -- "$partial_directory"
    fi
    rmdir "$lock_directory"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

rotate_backups() {
    retention_directory=$1
    retention_limit=$2
    retention_count=0
    for retained_name in $(ls -1 "$retention_directory" | sort -r); do
        case "$retained_name" in
            ????-??-??T??????Z) ;;
            *) continue ;;
        esac
        retention_count=$((retention_count + 1))
        if [ "$retention_count" -gt "$retention_limit" ]; then
            rm -rf -- "$retention_directory/$retained_name"
        fi
    done
}

backup_name=$(date -u +%Y-%m-%dT%H%M%SZ)
if [ -e "$backup_root/daily/$backup_name" ]; then
    echo "Ya existe un juego con esta fecha; reintentar en otro segundo." >&2
    exit 1
fi
partial_directory=$backup_root/daily/.$backup_name.partial
mkdir "$partial_directory"
# El juego es visible para restauración solo cuando ambos archivos están completos.
export CAPTURE_DIRECTORY=$partial_directory
psql --no-psqlrc --set=ON_ERROR_STOP=1 <<'SQL'
SELECT pg_advisory_lock(10409);
\! /bin/sh /opt/backup/capture.sh
\if :SHELL_ERROR
SELECT 1 / 0;
\endif
SELECT pg_advisory_unlock(10409);
SQL
(
    cd "$partial_directory"
    sha256sum database.dump storage.tar.gz > SHA256SUMS
)
mv "$partial_directory" "$backup_root/daily/$backup_name"
partial_directory=

weekly_name=$(date -u +%Y-%m-%d)T000000Z
# Solo el primer juego del domingo cuenta como semanal, incluso con copias manuales.
if [ "$(date -u +%u)" = "7" ] && [ ! -e "$backup_root/weekly/$weekly_name" ]; then
    partial_directory=$backup_root/weekly/.$weekly_name.partial
    cp -a "$backup_root/daily/$backup_name" "$partial_directory"
    mv "$partial_directory" "$backup_root/weekly/$weekly_name"
    partial_directory=
fi
rotate_backups "$backup_root/daily" 7
rotate_backups "$backup_root/weekly" 4
echo "Backup completado: $backup_name (UTC)."
