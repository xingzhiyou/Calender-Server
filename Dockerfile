FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY server/package*.json ./
RUN npm install

# 复制应用代码
COPY server/ ./

# 暴露端口
EXPOSE 8080

# 启动命令
CMD ["npm", "start"]
