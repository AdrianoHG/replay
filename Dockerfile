FROM nginx:stable-alpine@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c
LABEL org.opencontainers.image.source="https://github.com/AdrianoHG/replay"
LABEL org.opencontainers.image.licenses="AGPL-3.0-only"
COPY --chmod=0644 deploy/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=0644 index.html app.js ui.js styles.css icon.svg LICENSE /srv/replay/
RUN chmod 0755 /srv/replay
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["nginx", "-g", "daemon off;"]
