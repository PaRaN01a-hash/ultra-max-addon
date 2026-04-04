FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 7000
EXPOSE 7001

CMD node index.js & node index-all.js & wait
