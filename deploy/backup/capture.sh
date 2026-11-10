#!/bin/sh
set -eu
umask 077

# Invoked only while backup.sh owns PostgreSQL advisory lock 10409.
case "${CAPTURE_DIRECTORY:-}" in
    /backups/daily/.????-??-??T??????Z.partial) ;;
    *) exit 1 ;;
esac
pg_dump --format=custom --no-owner --no-acl --file="$CAPTURE_DIRECTORY/database.dump"
# Trash is required: the DB snapshot may still reference objects moved before this capture.
tar -czf "$CAPTURE_DIRECTORY/storage.tar.gz" -C /storage .
