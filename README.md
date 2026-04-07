# Video Cuter Suite

一个面向最终用户的一键部署整合仓库。

它不再依赖本地 sibling 源码目录，而是通过 `docker compose` 直接拉取已经发布好的镜像，把下面三部分组合起来：

- `video-cuter`：纯前端视频裁剪工具
- `funasr-server`：纯后端语音识别服务
- `gateway`：同源代理与统一入口

## 仓库定位

这个仓库的职责只有两件事：

1. 提供可直接部署的 `docker compose` 入口
2. 统一发布整套镜像到 Docker Hub

也就是说，它是“发布和集成仓库”，不是主要业务源码仓库。

## 默认部署方式

默认 `docker-compose.yml` 直接使用 Docker Hub 镜像：

- `${VIDEO_CUTER_IMAGE:-tomfocker/video-cuter:latest}`
- `${FUNASR_IMAGE:-tomfocker/funasr-server:latest}`
- `${GATEWAY_IMAGE:-tomfocker/video-cuter-suite-gateway:latest}`

这样用户只需要：

```bash
cp .env.example .env
docker compose up -d
```

就可以启动整套服务。

## 访问入口

启动后默认访问：

- 应用入口：`http://localhost:18080/`
- 同源健康检查：`http://localhost:18080/healthz`
- 同源转录接口：`http://localhost:18080/v1/audio/transcriptions`
- 后端直连健康检查：`http://localhost:18000/healthz`
- 后端直连转录接口：`http://localhost:18000/v1/audio/transcriptions`

其中：

- `18080` 面向浏览器用户
- `18000` 面向其他工具或容器直连调用

## 默认模型策略

推荐默认方式：

- 主镜像不内置模型
- 第一次启动自动下载到 `./.docker-data/asr/models/...`
- 国内或离线环境优先推荐使用本地模型挂载覆盖

原因：

- 镜像更小，下载更快
- 模型可单独复用
- 升级镜像时不会重复搬运模型
- 对网络环境不稳定的用户更友好

## 本地模型挂载

如果你已经手动下载好了 `Fun-ASR-Nano-GGUF`，放到：

```bash
./models/Fun-ASR-Nano-GGUF/
```

然后执行：

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.local-model.yml up -d
```

这样会：

- 禁用自动下载
- 直接使用本地模型目录

## 本地开发模式

如果你正在本地同时开发这三个仓库，可以使用开发覆盖文件：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

这个模式会：

- 从 `../cut` 构建前端镜像
- 从 `../yunyinshibie` 构建后端镜像
- 从当前仓库构建网关镜像

适合本地联调，不适合最终用户部署。

## 路由说明

对浏览器：

- `/` -> `video-cuter`
- `/healthz` -> `funasr-server`
- `/v1/audio/transcriptions` -> `funasr-server`
- `/api/transcriptions` -> `funasr-server`
- `/api/asr/*` -> `funasr-server`

对同一 Compose 网络中的其他容器：

- 推荐直接访问 `http://asr:8000/v1/audio/transcriptions`

如果是其他独立 Compose 项目：

- 可访问 `http://host.docker.internal:18000/v1/audio/transcriptions`

## Docker Hub 自动发布

本仓库包含 GitHub Actions 工作流：

- [.github/workflows/dockerhub.yml](/Users/andy/Code/cut-funasr-bundle/.github/workflows/dockerhub.yml)

它会在 `main` 更新后统一构建并推送：

- `video-cuter`
- `funasr-server`
- `video-cuter-suite-gateway`

到 Docker Hub。

需要在 GitHub 仓库中配置两个 Secrets：

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## 文件说明

- [docker-compose.yml](/Users/andy/Code/cut-funasr-bundle/docker-compose.yml)
  - 默认生产部署入口
- [docker-compose.local-model.yml](/Users/andy/Code/cut-funasr-bundle/docker-compose.local-model.yml)
  - 本地模型挂载覆盖
- [docker-compose.dev.yml](/Users/andy/Code/cut-funasr-bundle/docker-compose.dev.yml)
  - 本地开发构建覆盖
- [Dockerfile](/Users/andy/Code/cut-funasr-bundle/Dockerfile)
  - 网关镜像构建
- [Caddyfile](/Users/andy/Code/cut-funasr-bundle/Caddyfile)
  - 同源代理规则

## 适合谁

这个仓库适合：

- 想一键部署完整体验的用户
- 想直接通过 Docker Compose 启动前后端整合版的用户
- 想把识别服务接给其他容器工具使用的用户

如果你只想维护前端，请去 `video-cuter`。

如果你只想维护识别后端，请去 `funasr-server`。
