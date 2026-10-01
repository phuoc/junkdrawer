FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=3000 JUNK_DB=/data/junk.db
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
