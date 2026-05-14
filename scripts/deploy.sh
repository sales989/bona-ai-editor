#!/bin/bash
# BONA AI Editor - Local one-click deploy script
# Prerequisites: node, npm, wrangler CLI installed

set -e

echo "🚀 BONA AI Editor 一键部署脚本"
echo "================================"

# Check requirements
command -v node >/dev/null 2>&1 || { echo "❌ 需要安装 Node.js"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ 需要安装 npm"; exit 1; }
command -v wrangler >/dev/null 2>&1 || { echo "❌ 需要安装 wrangler (npm install -g wrangler)"; exit 1; }

# Step 1: Install dependencies
echo ""
echo "📦 安装依赖..."
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Step 2: Build frontend
echo ""
echo "🔨 构建前端..."
cd frontend && npm run build && cd ..

# Step 3: Initialize D1 database
echo ""
echo "🗄️ 初始化数据库..."
cd backend && wrangler d1 execute bona-ai-editor-db --file=./migrations/001_init.sql && cd ..

# Step 4: Create KV namespace if not exists
echo ""
echo "📦 创建KV命名空间..."
wrangler kv:namespace create bona-session-kv 2>/dev/null || echo "   KV命名空间已存在"

# Step 5: Deploy
echo ""
echo "🚀 部署至Cloudflare..."
cd backend && wrangler deploy && cd ..

# Step 6: Deploy frontend
echo ""
echo "🌐 部署前端至Cloudflare Pages..."
cd frontend && npx wrangler pages deploy dist --project-name=bona-ai-editor && cd ..

# Step 7: Set environment variables prompt
echo ""
echo "⚠️  请手动设置以下环境变量(Workers Secrets):"
echo "   wrangler secret put TELEGRAM_BOT_TOKEN"
echo "   wrangler secret put TELEGRAM_CHAT_ID"
echo "   wrangler secret put JWT_SECRET"
echo ""
echo "✅ BONA AI Editor 部署完成！"
echo "📌 访问地址: https://v.bona6.com"
