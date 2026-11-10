# Incluye cliente PostgreSQL, tar y crond antes de trasladar la imagen offline.
FROM postgres:17-alpine
COPY backup.sh restore.sh capture.sh check-references.sh /opt/backup/
COPY crontab /etc/crontabs/root
RUN chmod 0700 /opt/backup/*.sh
RUN chmod 0600 /etc/crontabs/root
# Root permite leer uploads de node y conservar uid/gid al restaurar.
ENTRYPOINT ["crond", "-f", "-l", "2"]
