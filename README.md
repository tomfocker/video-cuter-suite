# Cut + FunASR Bundle

这个目录是独立于 `cut` 与 `yunyinshibie` 两个源码仓库之外的打包层。

目标：

- `cut` 继续作为独立前端项目维护
- `yunyinshibie` 继续作为独立 ASR 服务项目维护
- 这个 bundle 只负责把两者组合成一个开箱即用的 Docker 入口

## 结构

- `docker-compose.yml`
  - 启动 `asr` 服务
  - 启动 `frontend` 服务
  - 启动 `gateway` 统一对外暴露入口
- `docker-compose.local-model.yml`
  - 可选覆盖文件，启用本地模型挂载
- `.env.example`
  - 默认宿主机端口示例，可复制成 `.env` 后覆盖

由于 `cut` 现在已经是纯静态前端，bundle 额外使用一个 `Caddy` 网关来做整合：

- `/` 转发到 `frontend`
- `/api/asr/*` 转发到 `asr`
- `/healthz`、`/v1/audio/transcriptions`、`/api/transcriptions` 也直接透传到 `asr`
- 宿主机仍然保留一个后端直连端口，方便其他工具或容器测试

## 默认模型策略

推荐默认方式：

- 主镜像不内置模型
- 第一次启动自动下载到 `./.docker-data/asr/models/...`
- 国内或离线环境优先推荐使用本地模型挂载覆盖

原因：

- 镜像更小，发布更快
- 模型可单独更新
- 初次部署仍然能“开箱即用”
- 对网络不稳定环境，仍保留手动模型路径

## 快速启动

确保下面两个源码目录存在：

- `../cut`
- `../yunyinshibie`

然后启动：

```bash
cp .env.example .env
docker compose up --build
```

启动后访问：

- 应用入口：`http://localhost:18080/`
- 前端同源健康检查：`http://localhost:18080/healthz`
- 前端同源转录接口：`http://localhost:18080/v1/audio/transcriptions`
- 后端直连健康检查：`http://localhost:18000/healthz`
- 后端直连转录接口：`http://localhost:18000/v1/audio/transcriptions`

这里的根路径直接就是 `cut` 工作台。

如果本机端口有冲突，可以把 `.env` 改成例如：

```bash
CUT_HTTP_PORT=28080
FUNASR_HTTP_PORT=28000
```

## 本地模型挂载

如果你已经手动下载好了 `Fun-ASR-Nano-GGUF`，放到：

```bash
./models/Fun-ASR-Nano-GGUF/
```

然后执行：

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.local-model.yml up --build
```

这样会：

- 禁用自动下载
- 直接使用本地模型目录

## 路由说明

对浏览器：

- `/` -> `cut`
- `/healthz` -> 透传到 ASR 健康检查
- `/v1/audio/transcriptions` -> 透传到 ASR OpenAI 风格接口
- `/api/transcriptions` -> 透传到 ASR 简洁别名接口
- `/api/asr/healthz` -> ASR
- `/api/asr/v1/*` -> ASR
- `/api/asr/api/transcriptions` -> ASR

对同一 Compose 网络中的其他容器：

- 推荐直接访问 `http://asr:8000/v1/audio/transcriptions`
- 如果是其他独立 Compose 项目，也可以访问 `http://host.docker.internal:18000/v1/audio/transcriptions`

这样浏览器走同源网关，容器走内部服务名，两条链路都清晰。
