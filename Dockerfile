FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# Устанавливаем зависимости Node.js
RUN npm install

# Копируем весь проект
COPY . .

# Открываем порт 3000
EXPOSE 3000

# Запускаем сервер
CMD ["node", "server.js"]