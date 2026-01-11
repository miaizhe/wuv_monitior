# VPS Monitor

一个轻量级、实时且功能强大的 VPS 性能监控系统。支持多服务器管理、历史数据趋势展示以及一键极速安装。

## ✨ 特性

- **云端设置同步**：您的个性化设置（主题色、暗色模式、服务器列表等）现在直接保存在服务器数据库中，换台电脑登录依然是原来的配置。
- **单端口访问**：前端现已集成到后端服务中，默认只需开放并访问 `3001` 端口。
- **实时监控**：毫秒级更新 CPU、内存、网络、磁盘及系统负载。
- **极速部署**：提供完善的 Shell 脚本，支持在 Ubuntu/Debian/CentOS 上一键安装。
- **现代 UI**：基于 React + Tailwind CSS + Lucide Icons 构建，响应式设计，完美适配移动端。

## 🚀 快速开始 (一键安装)

在您的 VPS 上使用 root 权限运行以下命令即可完成部署：

### 在线安装命令
```bash
curl -sSL https://raw.githubusercontent.com/miaizhe/wuv_monitior/main/install.sh | bash
```

### 安装说明
- **环境要求**：支持 Ubuntu 20.04+、Debian 10+、CentOS 7+。
- **自动配置**：脚本将自动安装 Node.js、PM2、Git 等必要环境。
- **交互配置**：安装过程中会提示输入 **后端连接地址**（默认 `http://localhost:3001`）。
- **默认端口**：系统默认运行在 `3001` 端口。请确保防火墙已放行该端口。以前的 `5174` 端口现在已不再必需。

## 🛠️ 维护与卸载

### 查看状态
```bash
pm2 status
```

### 查看日志
```bash
pm2 logs vps-monitor-backend
pm2 logs vps-monitor-frontend
```

### 备份与恢复数据库
为了保护您的历史监控数据，脚本现在支持一键备份与恢复：
1. 重新运行安装脚本。
2. 选择 **选项 5** (备份) 或 **选项 6** (恢复)。
3. 备份文件将保存在 `/opt/vps-monitor/backups` 目录下。

### 卸载系统
重新运行安装脚本并选择 **选项 4** 即可完成自动卸载：
```bash
curl -sSL https://raw.githubusercontent.com/miaizhe/wuv_monitior/main/install.sh | bash
```

---

## 🛠️ 技术栈

### 前端 (Frontend)
- **框架**: React + Vite
- **样式**: Tailwind CSS
- **图表**: Recharts
- **实时通信**: Socket.io-client
- **图标**: Lucide React

### 后端 (Backend)
- **运行时**: Node.js
- **框架**: Express
- **实时通信**: Socket.io
- **数据采集**: systeminformation
- **数据库**: SQLite (better-sqlite3)

## 📦 项目结构

```text
.
├── frontend/           # 前端 React 源码
├── backend/            # 后端 Node.js 源码
├── install.sh          # 一键安装脚本
└── README.md           # 项目文档
```

## 🔧 开发者指南

### 环境准备
- Node.js (LTS 版本)
- npm 或 yarn

### 本地开发

1. **克隆项目**
   ```bash
   git clone https://github.com/miaizhe/wuv_monitior.git
   cd wuv_monitior
   ```

2. **启动后端**
   ```bash
   cd backend
   npm install
   node index.js
   ```

3. **启动前端**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### 构建部署
```bash
cd frontend
npm run build
```
构建产物将位于 `frontend/dist` 目录下。

## 📄 开源协议

MIT License
