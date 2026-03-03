FROM node:24-slim

WORKDIR /app

# Install rpk (Redpanda CLI) and netcat for test fixture scripts
RUN apt-get update && apt-get install -y curl netcat-openbsd && \
    curl -LO https://github.com/redpanda-data/redpanda/releases/download/v25.3.6/rpk-linux-amd64.tar.gz && \
    tar -xzf rpk-linux-amd64.tar.gz && \
    mv rpk-linux-amd64/rpk /usr/local/bin/ && \
    rm -rf rpk-linux-amd64 rpk-linux-amd64.tar.gz && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

ENV KAFKA_BROKERS=localhost:9092

EXPOSE 8081

CMD ["node", "server.js"]
