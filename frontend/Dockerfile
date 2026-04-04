# ══════════════════════════════════════════════════════════════
# Frontend — nginx:alpine
# Estrategia simple: las fuentes se cargan desde Google Fonts
# directamente en el HTML (igual que en Live Server).
# El CSS y JS se sirven con MIME types forzados.
# ══════════════════════════════════════════════════════════════
FROM nginx:1.25-alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/cvranker.conf
COPY public/    /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
    CMD wget -qO /dev/null http://localhost/ || exit 1