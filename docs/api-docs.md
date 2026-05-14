# API 接口文档

## 基础信息
- 基础URL: `https://v.bona6.com/api`
- 认证方式: Bearer Token（登录后获取）
- 数据格式: JSON

---

## 认证接口

### POST /api/auth/login
登录获取Token

**请求体：**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "u_adm_001",
      "username": "admin",
      "role": "admin"
    }
  }
}
```

### POST /api/auth/logout
退出登录

### GET /api/auth/me
获取当前用户信息

---

## 文件上传

### POST /api/upload
上传文件（支持单/多文件，最大50MB/文件）

**请求：** `multipart/form-data`
- `files`: 文件数组

**响应：**
```json
{
  "success": true,
  "data": {
    "file_ids": ["file_id_1", "file_id_2"],
    "count": 2
  }
}
```

---

## 任务管理

### POST /api/tasks
创建处理任务

**请求体：**
```json
{
  "task_type": "image",
  "source_file_ids": ["uploaded_file_id_1"],
  "ai_prompt": "请去除图片中的水印和文字"
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "task_id": "t_xxx",
    "status": "pending"
  }
}
```

### GET /api/tasks
获取任务列表

**参数：**
- `type`: image/video（可选）
- `status`: pending/processing/success/failed（可选）
- `page`: 页码（默认1）
- `page_size`: 每页数量（默认20）

### GET /api/tasks/:id
获取任务详情

### POST /api/tasks/:id/reedit
二次编辑

**请求体：**
```json
{
  "ai_prompt": "新的编辑指令"
}
```

### GET /api/files/:fileId
获取/预览处理结果文件

---

## 管理接口（仅管理员）

### GET /api/admin/stats
获取数据统计

### GET /api/admin/users
获取用户列表

### POST /api/admin/users
创建用户

**请求体：**
```json
{
  "username": "newuser",
  "password": "password123",
  "role": "user"
}
```

### PUT /api/admin/users/:id/status
启用/禁用用户

**请求体：**
```json
{
  "status": 1
}
```

### PUT /api/admin/users/:id/password
重置用户密码

**请求体：**
```json
{
  "password": "newpassword123"
}
```

### DELETE /api/admin/users/:id
删除用户

### GET /api/admin/api-configs
获取API配置列表

### PUT /api/admin/api-configs/:provider
保存API配置

**请求体：**
```json
{
  "api_key": "your-api-key-here"
}
```

---

## 健康检查

### GET /api/health
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "1.0.0"
  }
}
```
