FROM node:24-slim

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV KAFKA_BROKERS=localhost:9092

EXPOSE 8081

CMD ["node", "server.js"]
