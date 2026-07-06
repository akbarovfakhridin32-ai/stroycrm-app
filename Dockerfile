
FROM node:18-alpine

# Устанавливаем PocketBase
ADD https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb && rm /tmp/pb.zip

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
EXPOSE 8090

# Запускаем PocketBase и ваш сервер
CMD sh -c "/pb/pocketbase serve --http=0.0.0.0:8090 & node server.js"