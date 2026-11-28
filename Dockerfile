# KaasuPesu has no npm dependencies, so the image is Node plus the app's own files, with no install step.
FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
COPY src ./src
# Inside a container the server must listen on every address. It never gets keys: docker-compose.yml passes
# none and .dockerignore keeps .env out, so the container runs with the browser's speech and the built-in rules.
ENV HOST=0.0.0.0 PORT=8787
EXPOSE 8787
USER node
CMD ["node", "server.js"]
