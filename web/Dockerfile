FROM node:20-slim AS build
WORKDIR /app
ARG WAYFINDER_API_URL=http://wayfinder:8000
ARG NEXT_PUBLIC_WEBSITE_DOMAIN=""
ARG NEXT_PUBLIC_SITE_URL=""
ARG NEXT_PUBLIC_AUTH_DISABLED=""
ARG NEXT_PUBLIC_OAUTH_PROVIDERS=""
ENV WAYFINDER_API_URL=$WAYFINDER_API_URL
ENV NEXT_PUBLIC_WEBSITE_DOMAIN=$NEXT_PUBLIC_WEBSITE_DOMAIN
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_AUTH_DISABLED=$NEXT_PUBLIC_AUTH_DISABLED
ENV NEXT_PUBLIC_OAUTH_PROVIDERS=$NEXT_PUBLIC_OAUTH_PROVIDERS
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . ./
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./
RUN npm ci --omit=dev --no-audit --no-fund
EXPOSE 3000
CMD ["sh", "-c", "npm start -- -p ${PORT:-3000}"]
