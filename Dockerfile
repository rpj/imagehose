FROM node:latest AS base
WORKDIR /app
COPY *.json ./
COPY *.js ./
COPY *.ts ./
COPY *.html ./
RUN npm install
ENV IN_CONTAINER=1
ENTRYPOINT ["npm", "start"]