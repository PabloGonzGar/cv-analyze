# ── Frontend: Nginx sirviendo estáticos ────────────────────────────────────────
FROM nginx:alpine

# Borra la config por defecto
RUN rm /etc/nginx/conf.d/default.conf

# Copia nuestra config
COPY nginx.conf /etc/nginx/conf.d/cvranker.conf

# Copia los archivos estáticos
COPY public/ /usr/share/nginx/html/

EXPOSE 80