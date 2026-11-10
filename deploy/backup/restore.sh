#!/bin/sh
set -eu
umask 077

# Exige elegir un juego concreto y confirmar el nombre de la BD de destino.
if [ "$#" -ne 1 ]; then
    echo "Uso: restore.sh /backups/daily/FECHA o /backups/weekly/FECHA" >&2
    exit 1
fi
backup_directory=$1
case "$backup_directory" in
    /backups/daily/????-??-??T??????Z|/backups/weekly/????-??-??T??????Z) ;;
    *)
        echo "Ruta de backup no permitida." >&2
        exit 1
        ;;
esac
if [ "${RESTORE_CONFIRM:-}" != "$PGDATABASE" ]; then
    echo "Defina RESTORE_CONFIRM con el nombre exacto de la BD; API y web deben estar paradas." >&2
    exit 1
fi
if [ -n "$(find /storage -mindepth 1 -print -quit)" ]; then
    echo "Storage debe estar vacío. Conserve el volumen anterior y use uno nuevo." >&2
    exit 1
fi
cd "$backup_directory"
sha256sum -c SHA256SUMS
pg_restore --list database.dump > /dev/null
tar -tzf storage.tar.gz > /dev/null
# El dump restaura los objetos de aplicación y drizzle en una sola transacción.
pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction --dbname="$PGDATABASE" database.dump
tar -xzpf storage.tar.gz -C /storage
echo "Restauración completada. Verifique uid/gid 1000 y salud antes de abrir acceso."
