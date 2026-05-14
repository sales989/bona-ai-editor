# 环境变量配置清单

## 必需配置（Workers Secrets）

通过以下命令设置：
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put JWT_SECRET
```

### TELEGRAM_BOT_TOKEN
- 创建方式：通过 @BotFather 创建机器人
- 格式示例：`8504867038:AAGQtzhyRHfgOVf1-w764WFVQrBIkiuVhXU`

### TELEGRAM_CHAT_ID
- 获取方式：机器人加入频道/群组后，发一条消息，调用 `https://api.telegram.org/bot<TOKEN>/getUpdates`
- 格式：`-1002692083350`（负数ID）

### JWT_SECRET
- 用途：用户会话加密
- 生成方式：`openssl rand -base64 32` 或任意随机字符串

## 可选配置（管理员后台填写）

以下API密钥可在部署后，通过管理后台 → API配置页面填写：

### PICWISH_API_KEY
- 用途：精准消除图片水印、文字、杂物
- 获取：https://picwish.com 注册获取API Key
- 特点：免费额度充足

### DASHSCOPE_API_KEY
- 用途：人脸替换、证件照换底色、精细编辑
- 获取：https://dashscope.aliyun.com 注册获取
- 特点：阿里云通义万相，精度高

## Cloudflare 配置（wrangler.toml）

```toml
[[d1_databases]]
binding = "DB"
database_name = "bona-ai-editor-db"
database_id = "<your-d1-database-id>"

[[kv_namespaces]]
binding = "SESSION_KV"
id = "<your-kv-namespace-id>"
```

## GitHub Actions Secrets

在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：

| Secret Name | 值 |
|------------|-----|
| CF_API_TOKEN | Cloudflare API Token（需 Workers/Pages/D1/KV权限） |

## 域配置（Cloudflare DNS）

1. 确保 v.bona6.com 的DNS记录指向Cloudflare
2. 在Cloudflare Workers中绑定自定义域名 v.bona6.com
3. 等待DNS生效（通常1-5分钟）
