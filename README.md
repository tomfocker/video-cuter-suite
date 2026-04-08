# Video Cuter Suite

一个面向最终用户的整合发布仓库，目标是把下面三部分组合成真正开箱即用的一套服务：

- `video-cuter`：浏览器端视频裁剪与处理工具
- `funasr-server`：独立运行的 FunASR HTTP 识别服务
- `gateway`：统一入口、同源代理、容器互联出口

## ✨ 这是什么

这个仓库不是主业务源码仓库，而是一个“整合与发布仓库”。

它主要负责两件事：

1. 提供一份可以直接启动的 `docker compose` 配置
2. 统一发布整套镜像到 Docker Hub

如果你只想维护前端，请去 `video-cuter` 仓库。  
如果你只想维护语音识别服务，请去 `funasr-server` 仓库。  
如果你想一条命令把完整体验跑起来，用这个仓库就对了。

## 🧩 为什么默认保留 gateway

`gateway` 的作用不是新增一套业务，而是提供一个“统一入口”：

- 浏览器用户只需要访问一个地址：`http://localhost:18080/`
- 前端页面可以同源调用 `/v1/audio/transcriptions`
- 其他容器或脚本也可以走固定的 ASR 暴露端口：`18000`
- 后续如果要加 HTTPS、鉴权、限流、上传大小限制，也有统一落点

没有 gateway 也能跑，但会让用户同时面对前端地址和后端地址，还要考虑跨域、代理和部署说明。对于整合版产品来说，带上 gateway 更适合交付。

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

路由规则如下：

- `http://localhost:18080/` -> 前端页面
- `http://localhost:18080/healthz` -> 后端健康检查
- `http://localhost:18080/v1/audio/transcriptions` -> 后端识别接口
- `http://localhost:18080/api/transcriptions` -> 后端兼容接口
- `http://localhost:18080/api/asr/*` -> 后端兼容接口
- `http://localhost:18000/*` -> 直接暴露给其他工具/容器调用的后端入口

## 🚀 开箱即用

### 方式一：直接使用本仓库

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

### 方式二：直接复制这份最小可用配置

如果你不想克隆整个仓库，也可以直接使用下面这份 `compose.yaml`：

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
    image: tomfocker/video-cuter:latest
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

保存后执行：

```bash
docker compose up -d
```

## 📦 模型策略

默认推荐策略是：

- 主镜像不内置模型
- 第一次启动时自动下载模型
- 模型落在可持久化目录里，后续重启不重复下载

这样做的优点：

- 镜像更轻
- 拉取更快
- 升级镜像时不用重复搬运模型
- 模型和服务镜像可以分别管理

当前默认围绕单一模型展开：

- `Fun-ASR-Nano-GGUF`

这符合本项目“先把一个最合适的模型做稳”的目标。

## 💾 自动下载与本地模型

默认情况下，模型会下载到：

```text
./.docker-data/asr/
```

如果你已经手动下载好了模型，推荐目录结构如下：

```text
./models/Fun-ASR-Nano-GGUF/
```

然后执行：

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.local-model.yml up -d
```

这个覆盖文件会：

- 关闭自动下载
- 将本地模型目录挂载进容器
- 直接让 `funasr-server` 使用本地模型

相关文件：

- [docker-compose.local-model.yml](/Users/andy/Code/cut-funasr-bundle/docker-compose.local-model.yml)

## 🔌 其他容器怎么调用识别服务

### 同一个 Compose 项目内

如果调用方也在同一个 Compose 网络里，推荐直接访问：

```text
http://asr:8000/v1/audio/transcriptions
```

这条链路最直接，少一层代理。

### 独立 Compose 项目或宿主机工具

如果是另一个独立项目，或者你只是想从宿主机脚本直接调，推荐访问：

```text
http://localhost:18000/v1/audio/transcriptions
```

如果调用方运行在另一个 Docker 容器里，常见写法是：

```text
http://host.docker.internal:18000/v1/audio/transcriptions
```

## 🌐 浏览器为什么走 18080

浏览器端优先走：

```text
http://localhost:18080/
```

这是因为：

- 页面和识别接口保持同源
- 不需要额外处理跨域
- 用户只记一个主入口即可

也就是说：

- `18080` 更适合“人打开网页使用”
- `18000` 更适合“程序或其他容器直接调用”

## 🛠️ 环境变量

默认示例见：

- [.env.example](/Users/andy/Code/cut-funasr-bundle/.env.example)

当前支持的主要变量：

- `CUT_HTTP_PORT`
  默认前端统一入口端口，默认值 `18080`
- `FUNASR_HTTP_PORT`
  默认后端直连端口，默认值 `18000`
- `VIDEO_CUTER_IMAGE`
  前端镜像名
- `FUNASR_IMAGE`
  后端镜像名
- `GATEWAY_IMAGE`
  gateway 镜像名

## 🧪 本地开发模式

如果你正在本地同时开发三个仓库，可以使用开发覆盖文件：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

这个模式会：

- 从 `../cut` 构建 `video-cuter`
- 从 `../yunyinshibie` 构建 `funasr-server`
- 从当前仓库构建 `gateway`

适合本地联调，不适合最终用户部署。

相关文件：

- [docker-compose.dev.yml](/Users/andy/Code/cut-funasr-bundle/docker-compose.dev.yml)

## 🩺 健康检查与排障

常用检查地址：

- `http://localhost:18080/`
- `http://localhost:18080/healthz`
- `http://localhost:18080/v1/audio/transcriptions`
- `http://localhost:18000/healthz`
- `http://localhost:18000/v1/audio/transcriptions`

常见问题排查：

1. 首次启动耗时较久
   通常是后端正在下载模型，尤其是第一次启动。
2. 前端能打开但识别失败
   优先检查 `asr` 容器日志，以及模型目录是否完整。
3. 其他容器无法访问识别服务
   先确认是同 Compose 网络直连，还是通过宿主机端口访问，两种地址不同。

## 📁 关键文件

- [docker-compose.yml](/Users/andy/Code/cut-funasr-bundle/docker-compose.yml)
  默认生产部署入口
- [docker-compose.local-model.yml](/Users/andy/Code/cut-funasr-bundle/docker-compose.local-model.yml)
  本地模型挂载覆盖
- [docker-compose.dev.yml](/Users/andy/Code/cut-funasr-bundle/docker-compose.dev.yml)
  本地开发构建覆盖
- [Dockerfile](/Users/andy/Code/cut-funasr-bundle/Dockerfile)
  gateway 镜像构建
- [Caddyfile](/Users/andy/Code/cut-funasr-bundle/Caddyfile)
  gateway 路由与同源代理规则

## 🤖 Docker Hub 自动发布

本仓库包含统一发布工作流：

- [.github/workflows/dockerhub.yml](/Users/andy/Code/cut-funasr-bundle/.github/workflows/dockerhub.yml)

它会在 `main` 更新或手动触发时统一构建并推送：

- `video-cuter`
- `funasr-server`
- `video-cuter-suite-gateway`

默认需要在 GitHub 仓库中配置：

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

如果被拉取的源码仓库未来改成私有仓库，再额外补充：

- `GH_PAT`

## ✅ 适合谁

这个仓库适合下面三类用户：

- 想一条命令启动整套前后端能力的用户
- 想通过浏览器直接使用视频处理工具，同时接入识别服务的用户
- 想把识别能力暴露给其他容器、脚本或业务系统复用的用户

如果你追求的是最小职责边界，请分别使用独立的 `video-cuter` 与 `funasr-server` 仓库。  
如果你要的是完整体验和最低部署门槛，优先使用这个整合仓库。
