FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY server/package*.json ./
RUN npm install

# 复制应用代码
COPY server/ ./
COPY uploads/ ./uploads/

# 创建 uploads 目录（如果不存在）
RUN mkdir -p uploads

# 暴露端口
EXPOSE 8080

# 启动命令
CMD ["npm", "start"]
