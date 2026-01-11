#!/bin/bash

# VPS Monitor 一键安装脚本
# 适用于 Ubuntu/Debian/CentOS

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. 权限检查
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}请以 root 用户运行此脚本${NC}"
  exit 1
fi

# 安装目录
INSTALL_DIR="/opt/vps-monitor"

# --- 菜单逻辑 ---

show_menu() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${GREEN}   VPS Monitor 一键安装工具${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e "1. 安装完整版 (前后端同时安装)"
    echo -e "2. 仅安装后端 (被监控端 Agent)"
    echo -e "3. 仅安装前端 (控制面板 Dashboard)"
    echo -e "4. 退出"
    echo -e "${BLUE}========================================${NC}"
    read -p "请选择安装选项 [1-4]: " choice

    case $choice in
        1)
            INSTALL_MODE="full"
            ;;
        2)
            INSTALL_MODE="backend"
            ;;
        3)
            INSTALL_MODE="frontend"
            ;;
        4)
            exit 0
            ;;
        *)
            echo -e "${RED}无效选项，请重新选择${NC}"
            show_menu
            ;;
    esac

    if [ "$INSTALL_MODE" == "full" ] || [ "$INSTALL_MODE" == "frontend" ]; then
        echo -e "${YELLOW}请输入后端连接地址 (例如 http://your_server_ip:3001)${NC}"
        read -p "后端地址 [默认 http://localhost:3001]: " BACKEND_URL
        BACKEND_URL=${BACKEND_URL:-"http://localhost:3001"}
    fi
}

# --- 环境安装函数 ---

install_nodejs() {
    if ! command -v node &> /dev/null; then
        echo -e "${YELLOW}未检测到 Node.js，正在安装...${NC}"
        if command -v apt &> /dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            apt-get install -y nodejs
        elif command -v yum &> /dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
            yum install -y nodejs
        else
            echo -e "${RED}无法识别的包管理器，请手动安装 Node.js${NC}"
            exit 1
        fi
    fi
    echo -e "${GREEN}Node.js 版本: $(node -v)${NC}"
}

install_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo -e "${YELLOW}正在安装 PM2...${NC}"
        npm install -g pm2
    fi
}

# --- 具体安装逻辑 ---

do_install_backend() {
    echo -e "${BLUE}>>> 正在部署后端服务...${NC}"
    mkdir -p $INSTALL_DIR/backend
    cd $INSTALL_DIR/backend

    # 生成 package.json
    cat > package.json <<EOF
{
  "name": "vps-monitor-backend",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^5.2.1",
    "socket.io": "^4.8.3",
    "systeminformation": "^5.30.2",
    "better-sqlite3": "^11.0.0"
  }
}
EOF

    # 生成 index.js
    cat > index.js <<EOF
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const si = require('systeminformation');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(cors());

// Database setup
const db = new Database(path.join(__dirname, 'history.db'));
db.pragma('journal_mode = WAL');

// Create tables
db.exec(\`
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    cpu_load REAL,
    mem_percentage REAL,
    net_rx REAL,
    net_tx REAL,
    disk_usage REAL
  )
\`);

// API to get history
app.get('/api/history', (req, res) => {
  try {
    const range = req.query.range || '1h';
    let timeFilter;
    
    switch(range) {
      case '1h': timeFilter = "-1 hour"; break;
      case '6h': timeFilter = "-6 hours"; break;
      case '24h': timeFilter = "-24 hours"; break;
      case '7d': timeFilter = "-7 days"; break;
      default: timeFilter = "-1 hour";
    }

    const rows = db.prepare(\`
      SELECT 
        strftime('%H:%M', datetime(timestamp, 'localtime')) as time,
        cpu_load as cpu,
        mem_percentage as mem,
        net_rx as rx,
        net_tx as tx,
        disk_usage as disk
      FROM metrics 
      WHERE timestamp > datetime('now', ?)
      ORDER BY timestamp ASC
    \`).all(timeFilter);
    
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

let latestMetrics = { cpu: {}, memory: {}, network: [], disk: [], uptime: 0 };

async function updateFastMetrics() {
  try {
    const [cpu, mem, load, time] = await Promise.all([
      si.cpu(), si.mem(), si.currentLoad(), si.time()
    ]);
    latestMetrics.cpu = { manufacturer: cpu.manufacturer, brand: cpu.brand, speed: cpu.speed, cores: cpu.cores, load: load.currentLoad };
    latestMetrics.memory = { total: mem.total, free: mem.free, used: mem.used, active: mem.active, percentage: (mem.used / mem.total) * 100 };
    latestMetrics.uptime = time.uptime;
    io.emit('metrics', latestMetrics);
  } catch (e) {}
}

async function updateNetworkMetrics() {
  try {
    const networkStats = await si.networkStats();
    latestMetrics.network = networkStats.map(iface => ({ iface: iface.iface, rx_sec: iface.rx_sec, tx_sec: iface.tx_sec }));
  } catch (e) {}
}

async function updateDiskMetrics() {
  try {
    const fsSize = await si.fsSize();
    latestMetrics.disk = fsSize.map(disk => ({ fs: disk.fs, type: disk.type, size: disk.size, used: disk.used, available: disk.available, use: disk.use }));
  } catch (e) {}
}

function recordHistory() {
  try {
    const totalRx = latestMetrics.network.reduce((acc, curr) => acc + (curr.rx_sec || 0), 0);
    const totalTx = latestMetrics.network.reduce((acc, curr) => acc + (curr.tx_sec || 0), 0);
    const diskUsage = latestMetrics.disk[0]?.use || 0;
    db.prepare(\`INSERT INTO metrics (cpu_load, mem_percentage, net_rx, net_tx, disk_usage) VALUES (?, ?, ?, ?, ?)\`)
      .run(latestMetrics.cpu.load || 0, latestMetrics.memory.percentage || 0, totalRx, totalTx, diskUsage);
  } catch (e) {}
}

setInterval(updateFastMetrics, 1000);
setInterval(updateNetworkMetrics, 1000);
setInterval(updateDiskMetrics, 10000);
setInterval(recordHistory, 60000);
setInterval(() => db.prepare("DELETE FROM metrics WHERE timestamp < datetime('now', '-7 days')").run(), 3600000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));
EOF

    echo -e "${YELLOW}正在安装后端依赖...${NC}"
    npm install

    # 启动后端
    pm2 stop vps-monitor-backend &> /dev/null
    pm2 start index.js --name vps-monitor-backend

    # 防火墙
    if command -v ufw &> /dev/null; then
        ufw allow 3001/tcp
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=3001/tcp
        firewall-cmd --reload
    fi
}

do_install_frontend() {
    echo -e "${BLUE}>>> 正在部署前端服务...${NC}"
    
    # 检查源码是否存在
    if [ -d "./frontend" ]; then
        echo -e "${YELLOW}检测到前端源码，正在编译...${NC}"
        cd frontend
        
        # 写入编译时的环境变量
        echo "VITE_BACKEND_URL=$BACKEND_URL" > .env.production
        
        npm install
        npm run build
        
        mkdir -p $INSTALL_DIR/frontend
        cp -r dist/* $INSTALL_DIR/frontend/
        cd ..
    else
        echo -e "${RED}未检测到前端源码，请确保在项目根目录运行脚本${NC}"
        exit 1
    fi

    cd $INSTALL_DIR/frontend
    # 安装静态服务工具
    npm install -g serve

    # 启动前端托管
    pm2 stop vps-monitor-frontend &> /dev/null
    pm2 start "serve -s . -p 5174" --name vps-monitor-frontend

    # 防火墙
    if command -v ufw &> /dev/null; then
        ufw allow 5174/tcp
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=5174/tcp
        firewall-cmd --reload
    fi
}

# --- 执行流程 ---

# 1. 先让用户选择模式 (避免未选择就安装环境)
show_menu

# 2. 根据选择安装环境
echo -e "${YELLOW}正在准备基础运行环境...${NC}"
install_nodejs
install_pm2

# 3. 执行具体安装
if [ "$INSTALL_MODE" == "full" ] || [ "$INSTALL_MODE" == "backend" ]; then
    do_install_backend
fi

if [ "$INSTALL_MODE" == "full" ] || [ "$INSTALL_MODE" == "frontend" ]; then
    do_install_frontend
fi

# 4. 统一收尾工作
echo -e "${YELLOW}正在保存进程状态并设置开机自启...${NC}"
pm2 save
pm2 startup

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}安装任务执行完毕！${NC}"
[ "$INSTALL_MODE" == "full" ] || [ "$INSTALL_MODE" == "backend" ] && echo -e "${BLUE}后端 Agent 端口: 3001${NC}"
[ "$INSTALL_MODE" == "full" ] || [ "$INSTALL_MODE" == "frontend" ] && echo -e "${BLUE}前端 Dashboard 端口: 5174 (请上传 dist 文件至 $INSTALL_DIR/frontend)${NC}"
echo -e "${GREEN}========================================${NC}"
