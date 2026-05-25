#!/bin/bash
# 删除所有D1数据库脚本
# 需要先安装wrangler: npm install -g wrangler
# 然后登录: wrangler login

echo "⚠️  即将删除所有 evideos 数据库！"
echo "⚠️  所有数据和日志将被永久删除！"
echo ""
read -p "确认删除？(yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "已取消"
    exit 0
fi

echo ""
echo "开始删除数据库..."

# 删除10个数据库
for i in {0..9}; do
    db_name="evideos_db_$i"
    echo "删除 $db_name..."
    wrangler d1 delete $db_name --yes 2>/dev/null || echo "  $db_name 不存在或已删除"
done

echo ""
echo "✅ 所有数据库已删除"
echo ""
echo "下一步："
echo "1. 在 Cloudflare Dashboard 创建新数据库 (10个: evideos_db_0 ~ evideos_db_9)"
echo "2. 绑定到 Workers"
echo "3. 执行初始化脚本"
