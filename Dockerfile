FROM node:24-slim

WORKDIR /app

# Install rpk (Redpanda CLI) and netcat for test fixture scripts
RUN apt-get update && apt-get install -y curl netcat-openbsd && \
    curl -LfsSL https://github.com/redpanda-data/redpanda/releases/download/v24.3.4/rpk-linux-amd64.tar.gz -o rpk.tar.gz && \
    tar -xzf rpk.tar.gz && \
    mv rpk-linux-amd64/rpk /usr/local/bin/ && \
    rm -rf rpk-linux-amd64 rpk.tar.gz && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

ENV KAFKA_BROKERS=localhost:9092

EXPOSE 8081

CMD ["node", "server.js"]
