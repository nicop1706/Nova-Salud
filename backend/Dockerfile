
FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./

RUN npm ci --omit=dev

COPY backend/src ./src

COPY database /database

EXPOSE 4000

CMD ["npm", "start"]
