# 线上 Docker Compose 安全更新命令

本文档按项目根目录的 `docker-compose.yml` 编写，适用于线上服务器使用 Docker Compose 部署并从本仓库本地构建镜像的场景。

## 当前数据位置

当前 compose 文件里需要保留的数据都绑定在项目目录下：

- `./data:/data`：应用数据
- `./logs:/app/logs`：应用日志
- `./pg_data:/var/lib/postgresql/data`：PostgreSQL 数据库数据
- `.env`：数据库、Redis、会话密钥等线上配置

## 绝对不要执行

这些命令可能删除数据库或应用数据，线上更新时不要用：

```bash
docker compose down -v
docker-compose down -v
docker volume prune
docker system prune --volumes
rm -rf data logs pg_data
```

如果只是更新应用代码和镜像，不需要 `down`，直接重建 `new-api` 服务即可。

## 推荐更新流程

进入线上项目目录：

```bash
cd /home/mafuchao/www/new-api
```

先备份数据库、compose、环境变量和数据目录：

```bash
BACKUP_TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
docker compose exec -T postgres pg_dump -U root -d new-api | gzip > "backups/new-api-db-${BACKUP_TS}.sql.gz"
tar --ignore-failed-read -czf "backups/new-api-files-${BACKUP_TS}.tgz" \
  .env docker-compose.yml data logs pg_data
```

数据库恢复以 `new-api-db-*.sql.gz` 为准，`new-api-files-*.tgz` 用来保留配置、日志和挂载目录快照。

查看当前容器状态，确认服务正在运行：

```bash
docker compose ps
docker compose logs --tail=100 new-api
```

拉取最新代码：

```bash
git pull --ff-only
```

重新构建当前 compose 使用的本地镜像：

```bash
docker build -t new-api-custom:local .
```

只重建应用容器，不动 PostgreSQL 数据容器：

```bash
docker compose up -d --no-deps --force-recreate new-api
```

检查更新后的状态：

```bash
docker compose ps
docker compose logs --tail=100 new-api
curl -fsS "http://127.0.0.1:${NEW_API_PORT:-3000}/api/status"
```

如果服务器只安装了旧版 Compose，把上面的 `docker compose` 替换成 `docker-compose`。

## 修改 compose 后的更新

如果只改了 `docker-compose.yml` 里的应用配置，比如环境变量、端口、日志参数，先检查配置是否能解析：

```bash
docker compose config
```

然后重建应用容器：

```bash
docker compose up -d --no-deps --force-recreate new-api
```

如果修改了 `postgres` 或 `redis` 服务配置，先确认 `./pg_data`、`.env` 已经备份，再执行：

```bash
docker compose up -d
```

仍然不要加 `-v`。

## 回滚到旧代码

先查看最近提交，找到要回滚到的提交号：

```bash
git log --oneline -5
```

切回指定提交并重新构建镜像：

```bash
git checkout <commit>
docker build -t new-api-custom:local .
docker compose up -d --no-deps --force-recreate new-api
```

确认恢复正常后再考虑切回原分支或继续修复。

## 备份恢复提醒

恢复备份前先停止相关服务，并保留当前目录副本。不要直接覆盖 `pg_data`，除非已经确认要用备份数据库替换当前数据库。
