# BONA AI图文编辑平台

企业内部AI图文一体化智能编辑平台

## 技术栈
- **前端**: React 18 + TypeScript + Vite + Tailwind CSS
- **后端**: Cloudflare Workers + itty-router
- **数据库**: Cloudflare D1
- **会话存储**: Cloudflare KV
- **文件存储**: Telegram Bot API（私有频道）
- **AI模型**: Cloudflare Workers AI (Flux) + PicWish + 阿里云通义万相
- **部署**: GitHub Actions CI/CD

## 功能特性

### AI视频编辑
- 人脸替换/打码/修复
- 字幕/水印/杂物删除
- 多语言配音/音频修改
- 横竖屏转换/裁剪/调速
- 企业水印批量添加

### AI图片编辑
- 人脸替换/修复/五官微调
- 去水印/文字/LOGO/杂物
- 换背景/透明背景/模糊背景
- 风格转换（动漫/古风/赛博等）
- 高清修复/无损放大/扩图
- 证件照换底色
- 调色滤镜
- 局部重绘

## 目录结构

```
bona-ai-editor/
├── backend/          # Cloudflare Workers 后端
│   ├── src/
│   │   ├── routes/   # API路由
│   │   ├── services/ # 业务服务
│   │   └── utils/    # 工具函数
│   └── migrations/   # 数据库迁移
├── frontend/         # React 前端
│   └── src/
│       ├── pages/    # 页面组件
│       ├── components/
│       ├── api/      # API客户端
│       └── utils/    # 工具函数
├── .github/workflows/ # CI/CD配置
├── scripts/          # 部署脚本
└── docs/             # 文档
```

## 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| TELEGRAM_BOT_TOKEN | Telegram Bot Token | 是 |
| TELEGRAM_CHAT_ID | TG频道/群组ID | 是 |
| JWT_SECRET | JWT加密密钥 | 是 |
| PICWISH_API_KEY | 佐糖API密钥（可选） | 否 |
| DASHSCOPE_API_KEY | 阿里通义万相API密钥（可选） | 否 |

## 部署

### 方式一：GitHub Actions（推荐）
1. Fork本仓库
2. 在GitHub仓库 Settings → Secrets 中添加所需环境变量
3. 推送代码至 main 分支自动部署

### 方式二：本地部署
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

## 初始账号
- 用户名: `admin`
- 密码: `admin123`（首次登录后请修改）

## 许可
企业内部使用，禁止对外公开
