# Builds the Laravel API together with the pantry-mcp bridge scripts it shells out
# to at runtime (cronometer-bridge.js, food-nutrition-bridge.js) — kept as siblings
# inside the image (/app and /pantry-mcp) so the app's default
# base_path('../pantry-mcp/dist/...') config just works unchanged from local dev.
FROM php:8.4-fpm

RUN apt-get update && apt-get install -y --no-install-recommends \
      git unzip sqlite3 libsqlite3-dev libzip-dev libonig-dev curl ca-certificates gnupg \
    && docker-php-ext-install pdo_sqlite bcmath zip mbstring \
    && rm -rf /var/lib/apt/lists/*

# Node.js LTS — runs the pantry-mcp bridge scripts.
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# uv — the bridge scripts spawn `uvx cronometer-api-mcp` themselves.
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /pantry-mcp
COPY pantry-mcp/package.json pantry-mcp/package-lock.json ./
RUN npm ci
COPY pantry-mcp/tsconfig.json ./
COPY pantry-mcp/src ./src
RUN npm run build && npm prune --omit=dev

WORKDIR /app
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-interaction --no-autoloader --no-scripts
COPY backend/ ./
RUN composer dump-autoload --optimize --no-dev \
    && chown -R www-data:www-data /app/storage /app/bootstrap/cache

COPY deploy/docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 9000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php-fpm"]
