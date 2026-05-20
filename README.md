# Calendar Server - 资源管理后端

一个基于 Node.js + Vue 的资源管理系统，提供文件上传、存储和API访问功能。

## 功能特性

- ✅ 文件上传（支持自定义名称）
- ✅ 同名文件自动替换
- ✅ JSON格式的资源列表API
- ✅ 资源增删改查
- ✅ UUID唯一标识
- ✅ 后台管理界面
- ✅ 文件预览（图片）
- ✅ CORS跨域支持
- ✅ 用户认证系统
- ✅ 白名单注册机制
- ✅ 角色权限管理（管理员/普通用户）
- ✅ 密码重置功能

## 技术栈

- **后端**: Node.js + Express
- **前端**: Vue 3 (内嵌于管理页面)
- **存储**: 本地文件系统 + JSON元数据
- **认证**: Token + SHA256密码哈希

## 项目结构

```
Calendar-Server/
├── server/              # Node.js后端
│   ├── app.js          # 主程序
│   ├── package.json    # 依赖配置
│   ├── reset-password.js # 密码重置脚本
│   └── public/
│       └── admin.html  # 管理页面
├── uploads/            # 文件存储目录
│   ├── resources.json  # 资源元数据
│   └── users.json      # 用户数据
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 运行服务器

```bash
npm start
```

服务器将在 `http://0.0.0.0:8080` 启动。

### 3. 访问后台管理

打开浏览器访问: http://localhost:8080/admin

### 4. 首次使用

1. 访问 /admin 时输入用户名（如 admin）
2. 设置密码，第一个用户会自动成为管理员
3. 之后可通过管理员添加白名单用户

## 认证 API

### 检查用户状态
```bash
POST /api/auth/check-user
Content-Type: application/json

{"username": "用户名"}
```

响应:
```json
{
  "success": true,
  "exists": true,
  "hasPassword": true,
  "canRegister": false
}
```

### 设置密码（首次登录）
```bash
POST /api/auth/set-password
Content-Type: application/json

{"username": "用户名", "password": "密码", "confirmPassword": "密码"}
```

### 登录
```bash
POST /api/auth/login
Content-Type: application/json

{"username": "用户名", "password": "密码"}
```

响应:
```json
{
  "success": true,
  "token": "认证令牌",
  "role": "admin"
}
```

### 登出
```bash
POST /api/auth/logout
Authorization: Bearer <token>
```

### 验证Token
```bash
GET /api/auth/verify
Authorization: Bearer <token>
```

## 用户管理 API

> 以下API需要管理员权限

### 获取用户列表
```bash
GET /api/users
Authorization: Bearer <token>
```

### 添加白名单用户
```bash
POST /api/auth/register
Authorization: Bearer <token>
Content-Type: application/json

{"username": "新用户名"}
```

### 删除用户
```bash
DELETE /api/users/:username
Authorization: Bearer <token>
```

### 删除用户密码
```bash
DELETE /api/users/:username/password
Authorization: Bearer <token>
```

### 修改用户角色
```bash
PUT /api/users/:username/role
Authorization: Bearer <token>
Content-Type: application/json

{"role": "admin" | "user"}
```

## 资源 API

### 获取资源列表
```bash
GET /api/resources
Authorization: Bearer <token>
```

响应示例:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-string",
      "name": "文件名.png",
      "uuid": "uuid-string",
      "path": "/api/files/uuid-string.png",
      "size": 12345,
      "content_type": "image/png",
      "updated_at": "2026-05-20T10:00:00Z"
    }
  ]
}
```

### 上传文件
```bash
POST /api/resources
Authorization: Bearer <token>
Content-Type: multipart/form-data

# 表单字段:
# - file: 文件内容
# - name: 可选，自定义名称
```

### 获取单个资源
```bash
GET /api/resources/{uuid}
Authorization: Bearer <token>
```

### 更新资源
```bash
PUT /api/resources/{uuid}
Authorization: Bearer <token>
Content-Type: application/json

{"name": "新名称"}
```

### 删除资源
```bash
DELETE /api/resources/{uuid}
Authorization: Bearer <token>
```

### 下载文件
```bash
GET /api/files/{filename}
Authorization: Bearer <token>
```

## 密码重置

如果管理员忘记密码，可以使用命令行脚本重置：

```bash
# 重置为随机密码
node server/reset-password.js admin

# 重置为指定密码
node server/reset-password.js admin 123456
```

## 角色说明

### 管理员
- 可以上传、编辑、删除资源
- 可以管理用户（添加白名单、删除用户、删除密码）
- 可以修改用户角色（升级/降级）
- 不能删除自己的密码

### 普通用户
- 可以上传、编辑、删除自己的资源
- 不能管理用户

## 开发说明

### 依赖环境
- Node.js 14+
- npm
