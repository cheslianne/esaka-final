FROM nginx:1.27-alpine

WORKDIR /usr/share/nginx/html

# Static frontend files
COPY index.html login.html forgot-password.html reset-password.html buyer-registry.html ./
COPY assets ./assets
COPY dashboards ./dashboards
COPY images ./images

# Nginx config template (rendered at container start with the real $PORT)
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
