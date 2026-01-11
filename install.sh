#!/bin/bash

# ==========================================
# VPS Monitor 一键安装脚本 (在线版)
# GitHub: https://github.com/miaizhe/wuv_monitior
# 用法: curl -sSL https://raw.githubusercontent.com/miaizhe/wuv_monitior/main/install.sh | bash
# ==========================================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. 权限检查
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}请以 root 用户运行此脚本${NC}"
  exit 1
fi

# 安装目录
INSTALL_DIR="/opt/vps-monitor"
REPO_URL="https://github.com/miaizhe/wuv_monitior.git"
TEMP_DIR="/tmp/vps-monitor-setup"

# --- 环境安装函数 ---

install_git() {
    if ! command -v git &> /dev/null; then
        echo -e "${YELLOW}未检测到 Git，正在安装...${NC}"
        if command -v apt &> /dev/null; then
            apt-get update && apt-get install -y git
        elif command -v yum &> /dev/null; then
            yum install -y git
        else
            echo -e "${RED}无法安装 Git，请手动安装后重试${NC}"
            exit 1
        fi
    fi
}

show_menu() {
    while true; do
        echo -e "${BLUE}========================================${NC}"
        echo -e "${GREEN}   VPS Monitor 一键安装工具${NC}"
        echo -e "${BLUE}========================================${NC}"
        echo -e "1. 安装完整版 (前后端同时安装)"
        echo -e "2. 仅安装后端 (被监控端 Agent)"
        echo -e "3. 仅安装前端 (控制面板 Dashboard)"
        echo -e "4. 卸载 VPS Monitor"
        echo -e "5. 退出"
        echo -e "${BLUE}========================================${NC}"
        
        # 使用 /dev/tty 确保在管道模式下也能读取输入
        if ! read -p "请选择安装选项 [1-5]: " choice < /dev/tty; then
            echo -e "\n${RED}读取输入失败，请确保在交互式终端中运行${NC}"
            exit 1
        fi

        case $choice in
            1)
                INSTALL_MODE="full"
                break
                ;;
            2)
                INSTALL_MODE="backend"
                break
                ;;
            3)
                INSTALL_MODE="frontend"
                break
                ;;
            4)
                INSTALL_MODE="uninstall"
                break
                ;;
            5)
                exit 0
                ;;
            *)
                echo -e "${RED}无效选项 [$choice]，请重新选择${NC}"
                ;;
        esac
    done

    if [ "$INSTALL_MODE" == "full" ] || [ "$INSTALL_MODE" == "frontend" ]; then
        echo -e "${YELLOW}请输入后端连接地址 (例如 http://your_server_ip:3001)${NC}"
        # 同样为后端地址输入添加 /dev/tty
        if ! read -p "后端地址 [默认 http://localhost:3001]: " BACKEND_URL < /dev/tty; then
            BACKEND_URL="http://localhost:3001"
        fi
        BACKEND_URL=${BACKEND_URL:-"http://localhost:3001"}
    fi
}

# --- 环境安装函数 ---

install_nodejs() {
    echo -e "${YELLOW}正在检查并安装编译依赖 (build-essential)...${NC}"
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y build-essential python3 make g++
    elif command -v yum &> /dev/null; then
        yum groupinstall -y "Development Tools" && yum install -y python3
    fi

    if ! command -v node &> /dev/null; then
        echo -e "${YELLOW}未检测到 Node.js，正在安装 (LTS)...${NC}"
        if command -v apt &> /dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
            apt-get install -y nodejs
        elif command -v yum &> /dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash -
            yum install -y nodejs
        else
            echo -e "${RED}不支持的包管理器，请手动安装 Node.js${NC}"
            exit 1
        fi
    fi
    echo -e "${GREEN}Node.js 版本: $(node -v)${NC}"
}

install_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo -e "${YELLOW}正在安装 PM2...${NC}"
        npm install -g pm2
        # 强制刷新命令哈希表，确保新安装的命令立即可用
        hash -r
    fi
    
    # 如果还是找不到，尝试手动链接到 /usr/local/bin
    if ! command -v pm2 &> /dev/null; then
        PM2_BIN=$(npm config get prefix)/bin/pm2
        if [ -f "$PM2_BIN" ]; then
            ln -sf "$PM2_BIN" /usr/local/bin/pm2
        fi
    fi
}

uninstall_system() {
    echo -e "${RED}警告: 此操作将卸载 VPS Monitor 并删除所有数据 (包括历史数据库)！${NC}"
    read -p "确定要继续吗？[y/N]: " confirm < /dev/tty
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}卸载已取消。${NC}"
        exit 0
    fi

    echo -e "${YELLOW}正在停止并删除 PM2 进程...${NC}"
    if command -v pm2 &> /dev/null; then
        pm2 stop vps-monitor-backend &> /dev/null
        pm2 delete vps-monitor-backend &> /dev/null
        pm2 stop vps-monitor-frontend &> /dev/null
        pm2 delete vps-monitor-frontend &> /dev/null
        pm2 save --force
    fi

    echo -e "${YELLOW}正在删除安装目录 ($INSTALL_DIR)...${NC}"
    rm -rf "$INSTALL_DIR"

    echo -e "${YELLOW}正在清理防火墙规则...${NC}"
    if command -v ufw &> /dev/null; then
        ufw delete allow 3001/tcp &> /dev/null
        ufw delete allow 5174/tcp &> /dev/null
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --remove-port=3001/tcp &> /dev/null
        firewall-cmd --permanent --remove-port=5174/tcp &> /dev/null
        firewall-cmd --reload &> /dev/null
    fi

    echo -e "${GREEN}卸载完成！${NC}"
    exit 0
}

# --- 具体安装逻辑 ---

do_install_backend() {
    echo -e "${BLUE}>>> 正在部署后端服务...${NC}"
    
    # 如果是在线安装且没有源码，先克隆
    if [ ! -d "./backend" ] && [ ! -d "$TEMP_DIR/backend" ]; then
        echo -e "${YELLOW}未在当前目录找到后端源码，正在从 GitHub 克隆...${NC}"
        install_git
        rm -rf $TEMP_DIR
        git clone $REPO_URL $TEMP_DIR
    fi

    mkdir -p $INSTALL_DIR/backend
    
    # 优先从源码目录复制，如果没有则使用脚本内置生成
    if [ -d "./backend" ]; then
        cp -r ./backend/* $INSTALL_DIR/backend/
    elif [ -d "$TEMP_DIR/backend" ]; then
        cp -r $TEMP_DIR/backend/* $INSTALL_DIR/backend/
    else
        # 兜底：使用脚本内置生成的代码
        echo -e "${YELLOW}使用脚本内置后端逻辑...${NC}"
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

// 全局异常处理，防止进程崩溃
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
});
EOF
    fi

    cd $INSTALL_DIR/backend

    echo -e "${YELLOW}正在安装后端依赖...${NC}"
    npm install
    # 强制重新编译 better-sqlite3 以匹配当前系统的 Node.js 版本
    if [ -d "node_modules/better-sqlite3" ]; then
        echo -e "${YELLOW}正在为当前系统编译 better-sqlite3...${NC}"
        npm rebuild better-sqlite3
    fi

    # 启动后端
    pm2 stop vps-monitor-backend &> /dev/null
    pm2 start index.js --name vps-monitor-backend
    
    # 等待几秒检查状态
    sleep 3
    if pm2 status vps-monitor-backend | grep -q "errored"; then
        echo -e "${RED}后端启动失败！正在输出错误日志...${NC}"
        pm2 logs vps-monitor-backend --lines 20 --no-daemon &
        LOG_PID=$!
        sleep 5
        kill $LOG_PID
        echo -e "${YELLOW}请检查上述错误（通常是由于缺少编译环境或端口冲突导致）${NC}"
    fi

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
    
    # 准备源码目录
    SOURCE_DIR="."
    if [ ! -d "./frontend" ]; then
        echo -e "${YELLOW}未在当前目录找到源码，正在从 GitHub 克隆...${NC}"
        install_git
        rm -rf $TEMP_DIR
        git clone $REPO_URL $TEMP_DIR
        SOURCE_DIR=$TEMP_DIR
    fi

    echo -e "${YELLOW}正在编译前端...${NC}"
    cd $SOURCE_DIR/frontend
    
    # 写入编译时的环境变量
    echo "VITE_BACKEND_URL=$BACKEND_URL" > .env.production
    
    npm install
    npm run build
    
    mkdir -p $INSTALL_DIR/frontend
    cp -r dist/* $INSTALL_DIR/frontend/
    
    # 清理临时目录
    if [ "$SOURCE_DIR" == "$TEMP_DIR" ]; then
        cd /
        rm -rf $TEMP_DIR
    fi

    cd $INSTALL_DIR/frontend
    # 安装静态服务工具
    npm install -g serve

    # 启动前端托管
    pm2 stop vps-monitor-frontend &> /dev/null
    
    # 获取 serve 的绝对路径以提高稳定性
    SERVE_BIN=$(which serve || npm config get prefix | awk '{print $1"/bin/serve"}')
    if [ -f "$SERVE_BIN" ]; then
        pm2 start "$SERVE_BIN" --name vps-monitor-frontend -- -s . -p 5174
    else
        pm2 start "npx serve -s . -p 5174" --name vps-monitor-frontend
    fi

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

# 2. 如果是卸载模式，直接执行并退出
if [ "$INSTALL_MODE" == "uninstall" ]; then
    uninstall_system
fi

# 3. 根据选择安装环境
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
echo -e "${YELLOW}正在配置开机自启和进程保活...${NC}"

# 再次确保 PM2 可用
hash -r
if ! command -v pm2 &> /dev/null; then
    # 最后的兜底尝试：从 npm prefix 获取路径
    export PATH=$PATH:$(npm config get prefix)/bin
fi

# 自动获取并执行 PM2 startup 命令
if command -v pm2 &> /dev/null; then
    STARTUP_CMD=$(pm2 startup | tail -n 1)
    if [[ $STARTUP_CMD == sudo* ]]; then
        eval "$STARTUP_CMD"
    fi
    pm2 save
else
    echo -e "${RED}警告: 未能找到 PM2 命令，保活配置可能失败。请手动运行 'npm install -g pm2' 后重试。${NC}"
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}安装任务执行完毕！${NC}"
echo -e "${BLUE}服务保活状态: 已启用 (通过 PM2)${NC}"
