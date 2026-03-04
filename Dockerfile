FROM node:24-slim

RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV KAFKA_BROKERS=localhost:9092
ENV LOG_LEVEL=debug

EXPOSE 8888

CMD ["node", "server.js"]
