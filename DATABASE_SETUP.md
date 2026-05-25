# D1 数据库设置指南

## 分片规则

视频按ID尾号数字分片到10个数据库：
- ID 以 0 结尾 → DB_0
- ID 以 1 结尾 → DB_1
- ...
- ID 以 9 结尾 → DB_9

例如：
- `mpg9fqw7zqoz5` → 尾号是 5 → DB_5
- `mpfui87t6pgq8` → 尾号是 8 → DB_8

## 创建数据库步骤

### 1. 登录 Cloudflare Dashboard
访问 https://dash.cloudflare.com

### 2. 创建 10 个 D1 数据库
进入 Workers & Pages → D1 数据库，创建以下数据库：

```
evideos_db_0
evideos_db_1
evideos_db_2
evideos_db_3
evideos_db_4
evideos_db_5
evideos_db_6
evideos_db_7
evideos_db_8
evideos_db_9
```

### 3. 初始化表结构
对每个数据库执行 `schema/init-all-dbs.sql` 中的SQL：

```bash
# 使用 wrangler CLI 执行（需要安装 wrangler）
wrangler d1 execute evideos_db_0 --file=./schema/init-all-dbs.sql
wrangler d1 execute evideos_db_1 --file=./schema/init-all-dbs.sql
# ... 以此类推
```

或者在 Dashboard 中逐个执行 SQL。

### 4. 绑定到 Workers
在 `wrangler.toml` 或 Cloudflare Dashboard 中绑定数据库：

```toml
[[d1_databases]]
binding = "DB_0"
database_name = "evideos_db_0"
database_id = "your-db-0-id"

[[d1_databases]]
binding = "DB_1"
database_name = "evideos_db_1"
database_id = "your-db-1-id"

# ... 以此类推
```

## 后台管理地址

后台地址：`https://你的域名/aadmin`

例如：
- https://a2612d00.evideos.pages.dev/aadmin

### 默认密码
在 Cloudflare Dashboard → Workers & Pages → 你的项目 → Settings → Variables 中设置：

```
ADMIN_PASSWORD = your_secure_password
```

## 采集源配置

进入后台后，添加采集源：

### 推荐采集源
1. **飞速资源**
   - 地址: `https://www.feisuzyapi.com/api.php/provide/vod/`

2. **量子资源**
   - 地址: `https://cj.lziapi.com/api.php/provide/vod/`

3. **新浪资源**
   - 地址: `https://api.xinlangapi.com/api.php/provide/vod/`

4. **快播资源**
   - 地址: `https://www.kuaibozy.com/api.php/provide/vod/`

5. **八戒资源**
   - 地址: `https://www.bajiezyapi.com/api.php/provide/vod/`

### 采集模式
- **单页采集**: 只采集前N页（默认5页）
- **全量采集**: 采集所有页面

### 分类过滤
可以指定只采集特定分类，如：`动作片,喜剧片,爱情片`

## 视频播放原理

1. 采集时，视频按ID尾号自动分片到对应的数据库
2. 播放时，系统根据视频ID尾号从对应的数据库查询
3. 播放链接直接指向源站的m3u8地址，不经过服务器中转
