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
db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    cpu_load REAL,
    mem_percentage REAL,
    net_rx REAL,
    net_tx REAL,
    disk_usage REAL
  )
`);

// API to get history
app.get('/api/history', (req, res) => {
  try {
    const range = req.query.range || '1h'; // default 1 hour
    let timeFilter;
    
    switch(range) {
      case '1h': timeFilter = "-1 hour"; break;
      case '6h': timeFilter = "-6 hours"; break;
      case '24h': timeFilter = "-24 hours"; break;
      case '7d': timeFilter = "-7 days"; break;
      default: timeFilter = "-1 hour";
    }

    const rows = db.prepare(`
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
    `).all(timeFilter);
    
    res.json(rows);
  } catch (e) {
    console.error("Error fetching history:", e);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let staticData = null;
let latestMetrics = {
  cpu: {},
  memory: {},
  network: [],
  disk: [],
  uptime: 0
};

async function getStaticData() {
  if (staticData) return staticData;
  try {
    const [cpu] = await Promise.all([
      si.cpu()
    ]);
    staticData = {
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        speed: cpu.speed,
        cores: cpu.cores,
      }
    };
    return staticData;
  } catch (e) {
    console.error("Error getting static data:", e);
    return { cpu: {} };
  }
}

// Separate update functions for different types of data
async function updateFastMetrics() {
  try {
    const [mem, load, time] = await Promise.all([
      si.mem(),
      si.currentLoad(),
      si.time()
    ]);
    
    const staticInfo = await getStaticData();
    
    latestMetrics.cpu = {
      ...staticInfo.cpu,
      load: load.currentLoad
    };
    latestMetrics.memory = {
      total: mem.total,
      free: mem.free,
      used: mem.used,
      active: mem.active,
      percentage: (mem.used / mem.total) * 100
    };
    latestMetrics.uptime = time.uptime;
    
    io.emit('metrics', latestMetrics);
  } catch (e) {
    console.error("Error updating fast metrics:", e);
  }
}

async function updateNetworkMetrics() {
  try {
    const networkStats = await si.networkStats();
    latestMetrics.network = networkStats.map(iface => ({
      iface: iface.iface,
      rx_sec: iface.rx_sec,
      tx_sec: iface.tx_sec
    }));
    // We don't emit here to avoid too many small updates, 
    // it will be sent with the next fast metrics update
  } catch (e) {
    console.error("Error updating network metrics:", e);
  }
}

async function updateDiskMetrics() {
  try {
    const fsSize = await si.fsSize();
    latestMetrics.disk = fsSize.map(disk => ({
      fs: disk.fs,
      type: disk.type,
      size: disk.size,
      used: disk.used,
      available: disk.available,
      use: disk.use
    }));
  } catch (e) {
    console.error("Error updating disk metrics:", e);
  }
}

// Record history every 1 minute
function recordHistory() {
  try {
    const totalRx = latestMetrics.network.reduce((acc, curr) => acc + (curr.rx_sec || 0), 0);
    const totalTx = latestMetrics.network.reduce((acc, curr) => acc + (curr.tx_sec || 0), 0);
    const diskUsage = latestMetrics.disk[0]?.use || 0;

    const stmt = db.prepare(`
      INSERT INTO metrics (cpu_load, mem_percentage, net_rx, net_tx, disk_usage)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      latestMetrics.cpu.load || 0,
      latestMetrics.memory.percentage || 0,
      totalRx,
      totalTx,
      diskUsage
    );
  } catch (e) {
    console.error("Error recording history:", e);
  }
}

// Cleanup history older than 7 days
function cleanupHistory() {
  try {
    db.prepare("DELETE FROM metrics WHERE timestamp < datetime('now', '-7 days')").run();
  } catch (e) {
    console.error("Error cleaning up history:", e);
  }
}

// Background Loops
async function startBackgroundTasks() {
  await getStaticData();
  
  // Update fast metrics every 1s
  setInterval(updateFastMetrics, 1000);
  
  // Update network metrics every 1s (it has its own 1s delay internal)
  setInterval(updateNetworkMetrics, 1000);
  
  // Update disk metrics every 10s (slowly changing)
  updateDiskMetrics();
  setInterval(updateDiskMetrics, 10000);

  // Record history every 1 minute
  setInterval(recordHistory, 60000);
  
  // Cleanup history every hour
  setInterval(cleanupHistory, 3600000);
  
  // Initial calls
  updateFastMetrics();
  updateNetworkMetrics();
}

startBackgroundTasks();

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.emit('metrics', latestMetrics);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
