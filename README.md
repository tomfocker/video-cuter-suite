# Video Cuter Suite

一个面向最终用户的整合发布仓库，用来把下面三部分组合成开箱即用的一套服务：

- `video-cuter-full`：`video-cuter` 仓库中的完整版前端
- `funasr-server`：独立运行的 FunASR HTTP 识别服务
- `gateway`：统一入口、同源代理、容器互联出口

## ✨ 仓库定位

这个仓库现在只负责：

1. 提供可以直接启动的 `docker compose` 配置
2. 提供 gateway 统一入口
3. 统一发布整合部署所需镜像

它不再维护前端源码本身。

前端源码维护位置：

- 纯净版前端：[`video-cuter` 根目录](https://github.com/tomfocker/video-cuter)
- 完整版前端：[`video-cuter/full`](https://github.com/tomfocker/video-cuter/tree/main/full)

这样以后如果你要改网页版功能，只需要去 `video-cuter` 一个仓库，不会再分散在多个项目里。

## 🧩 为什么保留 gateway

`gateway` 负责提供统一入口：

- 浏览器用户只访问一个地址：`http://localhost:18080/`
- 前端页面同源调用 `/v1/audio/transcriptions`
- 其他工具或容器可以走固定暴露端口：`18000`
- 后续加 HTTPS、鉴权、限流也有统一落点

也就是说：

- `18080` 面向浏览器
- `18000` 面向程序和其他容器

## 🏗️ 默认架构

```text
Browser
  |
  v
gateway (:18080 / :18000)
  |                |
  |                +--> asr (:8000)
  |
  +--> frontend (:8000)
```

路由说明：

- `http://localhost:18080/` -> 完整版前端页面
- `http://localhost:18080/healthz` -> 后端健康检查
- `http://localhost:18080/v1/audio/transcriptions` -> 后端识别接口
- `http://localhost:18080/api/transcriptions` -> 后端兼容接口
- `http://localhost:18080/api/asr/*` -> 后端兼容接口
- `http://localhost:18000/*` -> 后端直连入口

## 🚀 开箱即用

```bash
git clone https://github.com/tomfocker/video-cuter-suite.git
cd video-cuter-suite
cp .env.example .env
docker compose up -d
```

启动完成后默认使用：

- 前端统一入口：`http://localhost:18080/`
- 同源识别接口：`http://localhost:18080/v1/audio/transcriptions`
- 后端直连入口：`http://localhost:18000/v1/audio/transcriptions`

## 🧪 最小 compose 示例

如果你只想复制最小配置，也可以直接使用：

```yaml
services:
  asr:
    image: tomfocker/funasr-server:latest
    restart: unless-stopped
    expose:
      - "8000"
    environment:
      CW_HOST: 0.0.0.0
      CW_PORT: 8000
      CW_DATA_DIR: /data
      CW_AUTO_DOWNLOAD_MODEL: "1"
      CW_VULKAN_ENABLE: "0"
      CW_DML_ENABLE: "0"
    volumes:
      - ./.docker-data/asr:/data

  frontend:
    image: tomfocker/video-cuter-full:latest
    restart: unless-stopped
    expose:
      - "8000"

  gateway:
    image: tomfocker/video-cuter-suite-gateway:latest
    restart: unless-stopped
    depends_on:
      - asr
      - frontend
    ports:
      - "18080:8080"
      - "18000:18000"
```

## 📦 模型策略

默认推荐：

- 镜像不内置模型
- 第一次启动自动下载
- 模型持久化保存在 `./.docker-data/asr/`

优点：

- 镜像更轻
- 拉取更快
- 升级服务时不用重复搬运模型

当前默认只围绕单模型：

- `Fun-ASR-Nano-GGUF`

## 💾 本地模型挂载

如果你已经下载好了模型，推荐目录：

```text
./models/Fun-ASR-Nano-GGUF/
```

然后执行：

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.local-model.yml up -d
```

## 🔌 其他容器怎么调用识别服务

### 同一个 Compose 网络内

推荐直接访问：

```text
http://asr:8000/v1/audio/transcriptions
```

### 宿主机或独立 Compose 项目

推荐访问：

```text
http://localhost:18000/v1/audio/transcriptions
```

另一个 Docker 容器里常见写法：

```text
http://host.docker.internal:18000/v1/audio/transcriptions
```

## 🛠️ 环境变量

默认示例见：

- [.env.example](/Users/andy/Code/cut-funasr-bundle/.env.example)

主要变量：

- `CUT_HTTP_PORT`
  浏览器统一入口端口，默认 `18080`
- `FUNASR_HTTP_PORT`
  后端直连端口，默认 `18000`
- `VIDEO_CUTER_FULL_IMAGE`
  完整版前端镜像名
- `FUNASR_IMAGE`
  后端镜像名
- `GATEWAY_IMAGE`
  gateway 镜像名

## 🧪 本地开发模式

如果你正在本地同时开发三个仓库：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

这个模式会：

- 从 `../cut/full` 构建完整版前端
- 从 `../yunyinshibie` 构建 `funasr-server`
- 从当前仓库构建 `gateway`

## 📁 关键文件

- [docker-compose.yml](/Users/andy/Code/cut-funasr-bundle/docker-compose.yml)
  默认生产部署入口
- [docker-compose.local-model.yml](/Users/andy/Code/cut-funasr-bundle/docker-compose.local-model.yml)
  本地模型挂载覆盖
- [docker-compose.dev.yml](/Users/andy/Code/cut-funasr-bundle/docker-compose.dev.yml)
  本地开发覆盖
- [Dockerfile](/Users/andy/Code/cut-funasr-bundle/Dockerfile)
  gateway 镜像构建
- [Caddyfile](/Users/andy/Code/cut-funasr-bundle/Caddyfile)
  gateway 路由规则

## 🤖 Docker Hub 自动发布

工作流见：

- [.github/workflows/dockerhub.yml](/Users/andy/Code/cut-funasr-bundle/.github/workflows/dockerhub.yml)

当前会发布：

- `video-cuter-suite-gateway`

前端与后端镜像的发布职责已经回归各自源码仓库：

- `video-cuter` 负责发布 `video-cuter` 与 `video-cuter-full`
- `funasr-server` 负责发布 `funasr-server`
- `video-cuter-suite` 只负责发布 `video-cuter-suite-gateway`

默认需要：

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## ✅ 适合谁

这个仓库适合：

- 想一条命令启动完整前后端体验的用户
- 想通过浏览器直接使用完整版视频处理工具的用户
- 想把识别能力暴露给其他容器或脚本复用的用户

如果你想改前端源码，请去 `video-cuter`。  
如果你想改后端识别服务，请去 `funasr-server`。  
如果你只想部署整套服务，就使用这个仓库。
