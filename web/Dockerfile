FROM node:20-slim AS build
WORKDIR /app
ARG GATE_API_URL=http://gate:8000
ENV GATE_API_URL=$GATE_API_URL
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
CMD ["npm", "start"]
