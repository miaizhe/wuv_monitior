import React, { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Cpu, 
  Database, 
  Activity, 
  Network, 
  Clock,
  HardDrive,
  Settings,
  Plus,
  Server as ServerIcon,
  Trash2,
  X,
  RefreshCw,
  Sun,
  Moon
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Metrics {
  cpu: {
    manufacturer: string;
    brand: string;
    speed: number;
    cores: number;
    load: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    active: number;
    percentage: number;
  };
  network: Array<{
    iface: string;
    rx_sec: number;
    tx_sec: number;
  }>;
  disk: Array<{
    fs: string;
    type: string;
    size: number;
    used: number;
    available: number;
    use: number;
  }>;
  uptime: number;
}

interface ServerConfig {
  id: string;
  name: string;
  url: string;
}

const App: React.FC = () => {
  const [servers, setServers] = useState<ServerConfig[]>(() => {
    const saved = localStorage.getItem('vps_servers');
    const defaultUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    return saved ? JSON.parse(saved) : [{ id: 'default', name: '默认服务器', url: defaultUrl }];
  });
  
  const [activeServerId, setActiveServerId] = useState<string>(servers[0].id);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history'>('dashboard');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [longHistory, setLongHistory] = useState<any[]>([]);
  const [historyRange, setHistoryRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', url: '' });
  const [isConnected, setIsConnected] = useState(false);
  const [bgImage, setBgImage] = useState<string | null>(() => {
    return localStorage.getItem('vps_bg_image');
  });
  const [themeColor, setThemeColor] = useState<string>(() => {
    return localStorage.getItem('vps_theme_color') || '#3b82f6';
  });
  const [cardOpacity, setCardOpacity] = useState<number>(() => {
    const saved = localStorage.getItem('vps_card_opacity');
    return saved ? parseFloat(saved) : 1;
  });
  const [maskOpacity, setMaskOpacity] = useState<number>(() => {
    const saved = localStorage.getItem('vps_mask_opacity');
    return saved ? parseFloat(saved) : 0.8;
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('vps_dark_mode');
    return saved ? saved === 'true' : true;
  });
  const [netUnit, setNetUnit] = useState<'Auto' | 'KB/s' | 'MB/s' | 'Mbps'>(() => {
    return (localStorage.getItem('vps_net_unit') as any) || 'Auto';
  });

  const activeServer = servers.find(s => s.id === activeServerId) || servers[0];

  useEffect(() => {
    localStorage.setItem('vps_net_unit', netUnit);
  }, [netUnit]);

  useEffect(() => {
    localStorage.setItem('vps_servers', JSON.stringify(servers));
  }, [servers]);

  useEffect(() => {
    if (bgImage) {
      localStorage.setItem('vps_bg_image', bgImage);
    } else {
      localStorage.removeItem('vps_bg_image');
    }
  }, [bgImage]);

  useEffect(() => {
    localStorage.setItem('vps_theme_color', themeColor);
  }, [themeColor]);

  useEffect(() => {
    localStorage.setItem('vps_card_opacity', cardOpacity.toString());
  }, [cardOpacity]);

  useEffect(() => {
    localStorage.setItem('vps_mask_opacity', maskOpacity.toString());
  }, [maskOpacity]);

  useEffect(() => {
    localStorage.setItem('vps_dark_mode', isDarkMode.toString());
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, activeServerId, historyRange, activeServer.url]);

  const fetchHistory = async () => {
    setIsHistoryLoading(true);
    try {
      const response = await fetch(`${activeServer.url}/api/history?range=${historyRange}`);
      if (response.ok) {
        const data = await response.json();
        setLongHistory(data);
      }
    } catch (e) {
      console.error("Error fetching history:", e);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const connectToSocket = useCallback((url: string) => {
    if (socket) {
      socket.close();
    }

    const newSocket = io(url, {
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    setSocket(newSocket);
    setIsConnected(false);
    setMetrics(null);
    setHistory([]);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to', url);
    });

    newSocket.on('metrics', (data: Metrics) => {
      setMetrics(data);
      setHistory(prev => {
        const lastTime = prev.length > 0 ? prev[prev.length - 1].time : '';
        const currentTime = new Date().toLocaleTimeString();
        
        // Only update history if the time has changed to avoid redundant points
        if (currentTime === lastTime) return prev;
        
        // Calculate total network traffic
        const totalRx = data.network.reduce((acc, curr) => acc + (curr.rx_sec || 0), 0);
        const totalTx = data.network.reduce((acc, curr) => acc + (curr.tx_sec || 0), 0);
        
        const newHistory = [...prev, {
          time: currentTime,
          cpu: Math.round(data.cpu.load),
          mem: Math.round(data.memory.percentage),
          rx: totalRx,
          tx: totalTx
        }];
        return newHistory.slice(-30); // Increased history a bit for better chart view
      });
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('connect_error', () => {
      setIsConnected(false);
    });

    return newSocket;
  }, [socket]);

  useEffect(() => {
    const s = connectToSocket(activeServer.url);
    return () => {
      s.close();
    };
  }, [activeServerId, activeServer.url]);

  const addServer = () => {
    if (newServer.name && newServer.url) {
      const id = Math.random().toString(36).substr(2, 9);
      setServers([...servers, { ...newServer, id }]);
      setNewServer({ name: '', url: '' });
      setActiveServerId(id);
    }
  };

  const deleteServer = (id: string) => {
    if (servers.length > 1) {
      const filtered = servers.filter(s => s.id !== id);
      setServers(filtered);
      if (activeServerId === id) {
        setActiveServerId(filtered[0].id);
      }
    }
  };

  const updateActiveServer = (updates: Partial<ServerConfig>) => {
    setServers(prev => prev.map(s => 
      s.id === activeServerId ? { ...s, ...updates } : s
    ));
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatNetValue = (bytes: number, unit: 'Auto' | 'KB/s' | 'MB/s' | 'Mbps') => {
    if (unit === 'Auto') return formatBytes(bytes) + '/s';
    if (unit === 'KB/s') return (bytes / 1024).toFixed(2) + ' KB/s';
    if (unit === 'MB/s') return (bytes / (1024 * 1024)).toFixed(2) + ' MB/s';
    if (unit === 'Mbps') return ((bytes * 8) / (1000 * 1000)).toFixed(2) + ' Mbps';
    return formatBytes(bytes) + '/s';
  };

  const getNetValue = (bytes: number, unit: 'Auto' | 'KB/s' | 'MB/s' | 'Mbps') => {
    if (unit === 'Auto') return bytes; // For Auto, we keep raw bytes and format at the end
    if (unit === 'KB/s') return bytes / 1024;
    if (unit === 'MB/s') return bytes / (1024 * 1024);
    if (unit === 'Mbps') return (bytes * 8) / (1000 * 1000);
    return bytes;
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBgImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div 
      className={cn(
        "min-h-screen flex relative transition-colors duration-300",
        isDarkMode ? "bg-[#0f172a] text-slate-100" : "bg-slate-50 text-slate-900"
      )}
      style={{
        ...(bgImage ? {
          backgroundImage: `linear-gradient(${isDarkMode ? 'rgba(15, 23, 42,' : 'rgba(248, 250, 252,'} ${maskOpacity}), ${isDarkMode ? 'rgba(15, 23, 42,' : 'rgba(248, 250, 252,'} ${maskOpacity})), url(${bgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        } : {}),
        '--theme-color': themeColor,
      } as React.CSSProperties}
    >
      {/* Sidebar */}
      <aside 
        className={cn(
          "w-64 border-r flex flex-col hidden lg:flex transition-colors duration-300",
          isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
        )}
        style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
      >
        <div className={cn("p-6 border-b transition-colors", isDarkMode ? "border-slate-700" : "border-slate-200")}>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity style={{ color: themeColor }} />
            VPS Monitor
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-500 uppercase px-2 mb-2">监控视图</div>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg transition-all",
                activeTab === 'dashboard' 
                  ? "text-white shadow-lg" 
                  : isDarkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-100 text-slate-500"
              )}
              style={activeTab === 'dashboard' ? { backgroundColor: themeColor } : {}}
            >
              <Activity size={18} />
              <span className="font-medium">实时面板</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg transition-all",
                activeTab === 'history' 
                  ? "text-white shadow-lg" 
                  : isDarkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-100 text-slate-500"
              )}
              style={activeTab === 'history' ? { backgroundColor: themeColor } : {}}
            >
              <Clock size={18} />
              <span className="font-medium">历史数据</span>
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-500 uppercase px-2 mb-2">服务器列表</div>
            {servers.map(server => (
              <button
                key={server.id}
                onClick={() => setActiveServerId(server.id)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg transition-all group",
                  activeServerId === server.id 
                    ? "text-white shadow-lg border" 
                    : isDarkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-100 text-slate-500"
                )}
                style={activeServerId === server.id ? { 
                  borderColor: `${themeColor}40`,
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                  color: isDarkMode ? '#f8fafc' : '#0f172a'
                } : {}}
              >
                <div className="flex items-center gap-3">
                  <ServerIcon size={18} className={activeServerId === server.id ? "" : "text-slate-500"} style={activeServerId === server.id ? { color: themeColor } : {}} />
                  <span className="font-medium truncate max-w-[120px]">{server.name}</span>
                </div>
                {activeServerId === server.id && <div className="size-2 rounded-full" style={{ backgroundColor: themeColor }} />}
              </button>
            ))}
            
            <button 
              onClick={() => setShowAddServer(true)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg transition-all mt-4 border border-dashed",
                isDarkMode ? "text-slate-500 hover:bg-slate-700 border-slate-700" : "text-slate-400 hover:bg-slate-100 border-slate-300"
              )}
              style={{ '--theme-hover-color': themeColor } as React.CSSProperties}
            >
              <Plus size={18} />
              <span>添加服务器</span>
            </button>
          </div>
        </div>

        <div className={cn("p-4 border-t space-y-2", isDarkMode ? "border-slate-700" : "border-slate-200")}>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-lg transition-all",
              isDarkMode ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-100"
            )}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            <span>{isDarkMode ? '亮色模式' : '暗色模式'}</span>
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-lg transition-all",
              isDarkMode ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-100"
            )}
          >
            <Settings size={18} />
            <span>系统设置</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{activeTab === 'dashboard' ? activeServer.name : '历史统计数据'}</h1>
              {activeTab === 'dashboard' && (
                <div className={cn(
                  "flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase",
                  isConnected ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500 animate-pulse"
                )}>
                  <div className={cn("size-2 rounded-full", isConnected ? "bg-emerald-500" : "bg-red-500")} />
                  {isConnected ? "已连接" : "断开连接"}
                </div>
              )}
            </div>
            <p className="text-slate-400 mt-1 font-mono text-sm">{activeServer.url}</p>
          </div>
          
          <div className="flex items-center gap-4">
            {activeTab === 'history' && (
              <div className={cn(
                "flex p-1 rounded-xl border transition-colors duration-300",
                isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
              )}>
                {(['1h', '6h', '24h', '7d'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setHistoryRange(r)}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                      historyRange === r 
                        ? "text-white shadow-md" 
                        : isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"
                    )}
                    style={historyRange === r ? { backgroundColor: themeColor } : {}}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            {metrics && activeTab === 'dashboard' && (
              <div 
                className={cn(
                  "flex items-center gap-4 p-3 rounded-xl border shadow-xl transition-colors duration-300",
                  isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
                )}
                style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
              >
                <Clock className="text-slate-500 size-5" />
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider">UPTIME</div>
                  <div className={cn("font-mono text-sm font-bold", isDarkMode ? "text-slate-100" : "text-slate-900")}>{formatUptime(metrics.uptime)}</div>
                </div>
              </div>
            )}
          </div>
        </header>

        {activeTab === 'dashboard' ? (
          /* Dashboard Content */
          <>
            {!metrics && !isConnected ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <div 
              className={cn(
                "p-8 rounded-2xl border shadow-2xl transition-colors duration-300",
                isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
              )}
              style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
            >
              <RefreshCw className="size-12 animate-spin mx-auto mb-4" style={{ color: themeColor }} />
              <h2 className={cn("text-xl font-bold mb-2", isDarkMode ? "text-slate-100" : "text-slate-900")}>正在尝试连接服务器...</h2>
              <p className="text-slate-400 max-w-xs">请确保后端程序已在 {activeServer.url} 启动并允许跨域请求。</p>
              <button 
                onClick={() => connectToSocket(activeServer.url)}
                className="mt-6 px-6 py-2 rounded-lg font-bold transition-all text-white"
                style={{ backgroundColor: themeColor }}
              >
                重试连接
              </button>
            </div>
          </div>
        ) : !metrics ? (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-xl animate-pulse text-slate-500">正在获取实时数据...</div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* CPU Card */}
              <div 
                className={cn(
                  "p-6 rounded-2xl border shadow-xl relative overflow-hidden group transition-colors duration-300",
                  isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
                )}
                style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
              >
                <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: themeColor }} />
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${themeColor}1a` }}>
                    <Cpu style={{ color: themeColor }} size={24} />
                  </div>
                  <span className="text-3xl font-black" style={{ color: themeColor }}>{Math.round(metrics.cpu.load)}%</span>
                </div>
                <h3 className="text-slate-400 font-bold uppercase text-xs tracking-widest">CPU LOAD</h3>
                <p className={cn("text-sm mt-1 font-medium truncate", isDarkMode ? "text-slate-200" : "text-slate-700")}>{metrics.cpu.brand}</p>
                <div className={cn("mt-4 w-full h-2 rounded-full overflow-hidden", isDarkMode ? "bg-slate-800" : "bg-slate-100")}>
                  <div 
                    className="h-full transition-all duration-700 ease-out" 
                    style={{ 
                      width: `${metrics.cpu.load}%`,
                      backgroundColor: themeColor,
                      boxShadow: `0 0 8px ${themeColor}80`
                    }}
                  />
                </div>
              </div>

              {/* Memory Card */}
              <div 
                className={cn(
                  "p-6 rounded-2xl border shadow-xl relative overflow-hidden group transition-colors duration-300",
                  isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
                )}
                style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
              >
                <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: themeColor }} />
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${themeColor}1a` }}>
                    <Database style={{ color: themeColor }} size={24} />
                  </div>
                  <span className="text-3xl font-black" style={{ color: themeColor }}>{Math.round(metrics.memory.percentage)}%</span>
                </div>
                <h3 className="text-slate-400 font-bold uppercase text-xs tracking-widest">RAM USAGE</h3>
                <p className={cn("text-sm mt-1 font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>
                  {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
                </p>
                <div className={cn("mt-4 w-full h-2 rounded-full overflow-hidden", isDarkMode ? "bg-slate-800" : "bg-slate-100")}>
                  <div 
                    className="h-full transition-all duration-700 ease-out" 
                    style={{ 
                      width: `${metrics.memory.percentage}%`,
                      backgroundColor: themeColor,
                      boxShadow: `0 0-8px ${themeColor}80`
                    }}
                  />
                </div>
              </div>

              {/* Disk Card */}
              <div 
                className={cn(
                  "p-6 rounded-2xl border shadow-xl relative overflow-hidden group transition-colors duration-300",
                  isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
                )}
                style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
              >
                <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: themeColor }} />
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${themeColor}1a` }}>
                    <HardDrive style={{ color: themeColor }} size={24} />
                  </div>
                  <span className="text-3xl font-black" style={{ color: themeColor }}>{Math.round(metrics.disk[0]?.use || 0)}%</span>
                </div>
                <h3 className="text-slate-400 font-bold uppercase text-xs tracking-widest">DISK SPACE</h3>
                <p className={cn("text-sm mt-1 font-medium", isDarkMode ? "text-slate-200" : "text-slate-700")}>
                  {formatBytes(metrics.disk[0]?.used || 0)} / {formatBytes(metrics.disk[0]?.size || 0)}
                </p>
                <div className={cn("mt-4 w-full h-2 rounded-full overflow-hidden", isDarkMode ? "bg-slate-800" : "bg-slate-100")}>
                  <div 
                    className="h-full transition-all duration-700 ease-out" 
                    style={{ 
                      width: `${metrics.disk[0]?.use || 0}%`,
                      backgroundColor: themeColor,
                      boxShadow: `0 0 8px ${themeColor}80`
                    }}
                  />
                </div>
              </div>

              {/* Network Card */}
              <div 
                className={cn(
                  "p-6 rounded-2xl border shadow-xl relative overflow-hidden group transition-colors duration-300",
                  isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
                )}
                style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
              >
                <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: themeColor }} />
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${themeColor}1a` }}>
                    <Network style={{ color: themeColor }} size={24} />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-bold" style={{ color: themeColor }}>TRAFFIC</span>
                    <span className="text-xs text-slate-500 font-mono uppercase">{metrics.network[0]?.iface}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase">Upload</span>
                    <span className="text-sm font-mono font-bold" style={{ color: themeColor }}>{formatBytes(metrics.network[0]?.tx_sec || 0)}/s</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase">Download</span>
                    <span className="text-sm font-mono font-bold" style={{ color: themeColor }}>{formatBytes(metrics.network[0]?.rx_sec || 0)}/s</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div 
                className={cn(
                  "lg:col-span-2 p-8 rounded-2xl border shadow-xl transition-colors duration-300",
                  isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
                )}
                style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                  <h3 className={cn("text-xl font-black tracking-tight", isDarkMode ? "text-slate-100" : "text-slate-900")}>负载历史趋势</h3>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="size-3 rounded-full" style={{ backgroundColor: themeColor }} />
                      <span className="text-xs font-bold text-slate-400 uppercase">CPU</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="size-3 rounded-full opacity-50" style={{ backgroundColor: themeColor }} />
                      <span className="text-xs font-bold text-slate-400 uppercase">MEM</span>
                    </div>
                  </div>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history}>
                      <defs>
                        <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={themeColor} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={themeColor} stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={themeColor} stopOpacity={0.1}/>
                          <stop offset="95%" stopColor={themeColor} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#e2e8f0"} vertical={false} />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} hide />
                      <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: isDarkMode ? '#0f172a' : '#fff', 
                          border: isDarkMode ? '1px solid #334155' : '1px solid #e2e8f0', 
                          borderRadius: '12px', 
                          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                          color: isDarkMode ? '#f1f5f9' : '#0f172a'
                        }}
                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                      />
                      <Area type="monotone" dataKey="cpu" stroke={themeColor} strokeWidth={3} fillOpacity={1} fill="url(#colorCpu)" name="CPU %" animationDuration={500} />
                      <Area type="monotone" dataKey="mem" stroke={themeColor} strokeDasharray="5 5" strokeWidth={2} fillOpacity={1} fill="url(#colorMem)" name="内存 %" animationDuration={500} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div 
                className={cn(
                  "p-8 rounded-2xl border shadow-xl overflow-hidden transition-colors duration-300",
                  isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
                )}
                style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
              >
                <h3 className={cn("text-xl font-black tracking-tight mb-8", isDarkMode ? "text-slate-100" : "text-slate-900")}>文件系统详情</h3>
                <div className="space-y-6">
                  {metrics.disk.map((disk, idx) => (
                    <div key={idx} className="group">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-2">
                          <HardDrive size={14} className="text-slate-500" />
                          <span className={cn("text-xs font-bold truncate max-w-[120px]", isDarkMode ? "text-slate-200" : "text-slate-700")}>{disk.fs}</span>
                        </div>
                        <span 
                           className="px-2 py-0.5 rounded text-[10px] font-black tracking-tighter"
                           style={{ backgroundColor: `${themeColor}1a`, color: themeColor }}
                         >
                           {Math.round(disk.use)}%
                         </span>
                      </div>
                      <div className={cn("w-full h-1.5 rounded-full overflow-hidden", isDarkMode ? "bg-slate-800" : "bg-slate-100")}>
                        <div 
                          className="h-full transition-all duration-1000"
                          style={{ 
                            width: `${disk.use}%`,
                            backgroundColor: themeColor,
                            boxShadow: `0 0 8px ${themeColor}40`
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">USED: {formatBytes(disk.used)}</span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">TOTAL: {formatBytes(disk.size)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Network History Chart */}
              <div 
                className={cn(
                  "lg:col-span-3 p-8 rounded-2xl border shadow-xl transition-colors duration-300",
                  isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
                )}
                style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                  <div className="flex items-center gap-4">
                    <h3 className={cn("text-xl font-black tracking-tight", isDarkMode ? "text-slate-100" : "text-slate-900")}>网络历史趋势</h3>
                    <div className={cn("flex items-center p-1 rounded-lg border", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200")}>
                      {(['Auto', 'KB/s', 'MB/s', 'Mbps'] as const).map(unit => (
                        <button
                          key={unit}
                          onClick={() => setNetUnit(unit)}
                          className={cn(
                            "px-2 py-0.5 text-[10px] font-bold rounded transition-all",
                            netUnit === unit 
                              ? "text-white shadow-sm" 
                              : (isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700")
                          )}
                          style={netUnit === unit ? { backgroundColor: themeColor } : {}}
                        >
                          {unit}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="size-3 rounded-full" style={{ backgroundColor: '#10b981' }} />
                      <span className="text-xs font-bold text-slate-400 uppercase">下载 (RX)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="size-3 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                      <span className="text-xs font-bold text-slate-400 uppercase">上传 (TX)</span>
                    </div>
                  </div>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart 
                      data={history.map(h => ({
                        ...h,
                        rx_val: getNetValue(h.rx, netUnit),
                        tx_val: getNetValue(h.tx, netUnit)
                      }))}
                    >
                      <defs>
                        <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#e2e8f0"} vertical={false} />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} hide />
                      <YAxis 
                        stroke="#64748b" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(value) => netUnit === 'Auto' ? formatBytes(value).replace('/s', '') : value}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: isDarkMode ? '#0f172a' : '#fff', 
                          border: isDarkMode ? '1px solid #334155' : '1px solid #e2e8f0', 
                          borderRadius: '12px', 
                          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                          color: isDarkMode ? '#f1f5f9' : '#0f172a'
                        }}
                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                        formatter={(value: any) => [
                          netUnit === 'Auto' ? formatNetValue(value as number, 'Auto') : `${(value as number).toFixed(2)} ${netUnit}`, 
                          ''
                        ]}
                      />
                      <Area type="monotone" dataKey="rx_val" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRx)" name="下载 (RX)" animationDuration={500} />
                      <Area type="monotone" dataKey="tx_val" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorTx)" name="上传 (TX)" animationDuration={500} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    ) : (
      /* History Content */
      <div className="space-y-8">
        {isHistoryLoading ? (
              <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
                <RefreshCw className="size-12 animate-spin text-slate-500" />
                <p className="text-slate-500 font-bold">正在加载历史数据...</p>
              </div>
            ) : longHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
                <Activity className="size-12 text-slate-500 opacity-20" />
                <p className="text-slate-500 font-bold">暂无历史数据，请等待服务器记录...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* CPU History */}
                <div 
                  className={cn(
                    "p-8 rounded-2xl border shadow-xl transition-colors duration-300",
                    isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
                  )}
                  style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
                >
                  <h3 className={cn("text-xl font-black tracking-tight mb-8", isDarkMode ? "text-slate-100" : "text-slate-900")}>CPU 负载历史</h3>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={longHistory}>
                        <defs>
                          <linearGradient id="colorCpuHist" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={themeColor} stopOpacity={0.2}/>
                            <stop offset="95%" stopColor={themeColor} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#e2e8f0"} vertical={false} />
                        <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: isDarkMode ? '#0f172a' : '#fff', 
                            border: isDarkMode ? '1px solid #334155' : '1px solid #e2e8f0', 
                            borderRadius: '12px',
                            color: isDarkMode ? '#f1f5f9' : '#0f172a'
                          }}
                        />
                        <Area type="monotone" dataKey="cpu" stroke={themeColor} strokeWidth={3} fillOpacity={1} fill="url(#colorCpuHist)" name="CPU 负载" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Memory History */}
                <div 
                  className={cn(
                    "p-8 rounded-2xl border shadow-xl transition-colors duration-300",
                    isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
                  )}
                  style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
                >
                  <h3 className={cn("text-xl font-black tracking-tight mb-8", isDarkMode ? "text-slate-100" : "text-slate-900")}>内存使用率历史</h3>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={longHistory}>
                        <defs>
                          <linearGradient id="colorMemHist" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={themeColor} stopOpacity={0.2}/>
                            <stop offset="95%" stopColor={themeColor} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#e2e8f0"} vertical={false} />
                        <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: isDarkMode ? '#0f172a' : '#fff', 
                            border: isDarkMode ? '1px solid #334155' : '1px solid #e2e8f0', 
                            borderRadius: '12px',
                            color: isDarkMode ? '#f1f5f9' : '#0f172a'
                          }}
                        />
                        <Area type="monotone" dataKey="mem" stroke={themeColor} strokeWidth={3} fillOpacity={1} fill="url(#colorMemHist)" name="内存使用率" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Network History */}
                <div 
                  className={cn(
                    "lg:col-span-2 p-8 rounded-2xl border shadow-xl transition-colors duration-300",
                    isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
                  )}
                  style={{ backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})` }}
                >
                  <div className="flex justify-between items-center mb-8">
                    <h3 className={cn("text-xl font-black tracking-tight", isDarkMode ? "text-slate-100" : "text-slate-900")}>网络流量历史</h3>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <div className="size-3 rounded-full bg-emerald-500" />
                        <span className="text-xs font-bold text-slate-500 uppercase">下载</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="size-3 rounded-full bg-amber-500" />
                        <span className="text-xs font-bold text-slate-500 uppercase">上传</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={longHistory.map(h => ({
                        ...h,
                        rx_val: getNetValue(h.rx, netUnit),
                        tx_val: getNetValue(h.tx, netUnit)
                      }))}>
                        <defs>
                          <linearGradient id="colorRxHist" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorTxHist" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#e2e8f0"} vertical={false} />
                        <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis 
                          stroke="#64748b" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                          tickFormatter={(value) => netUnit === 'Auto' ? formatBytes(value).replace('/s', '') : value}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: isDarkMode ? '#0f172a' : '#fff', 
                            border: isDarkMode ? '1px solid #334155' : '1px solid #e2e8f0', 
                            borderRadius: '12px',
                            color: isDarkMode ? '#f1f5f9' : '#0f172a'
                          }}
                          formatter={(value: any) => [
                            netUnit === 'Auto' ? formatNetValue(value as number, 'Auto') : `${(value as number).toFixed(2)} ${netUnit}`, 
                            ''
                          ]}
                        />
                        <Area type="monotone" dataKey="rx_val" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRxHist)" name="下载" />
                        <Area type="monotone" dataKey="tx_val" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorTxHist)" name="上传" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {showAddServer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div 
            className={cn(
              "w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 my-auto",
              isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
            )}
            style={{ 
              backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})`,
              borderColor: `${themeColor}40`
            }}
          >
            <div className={cn("p-8 border-b flex justify-between items-center", isDarkMode ? "border-slate-700" : "border-slate-100")}>
              <div>
                <h2 className="text-2xl font-black tracking-tight" style={{ color: themeColor }}>服务器管理</h2>
                <p className="text-slate-400 text-sm mt-1">添加或删除需要监控的 VPS 节点</p>
              </div>
              <button onClick={() => setShowAddServer(false)} className={cn("p-2 rounded-xl transition-all", isDarkMode ? "hover:bg-slate-700" : "hover:bg-slate-100")}>
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8">
              <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 p-6 rounded-2xl border", isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200")}>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">服务器名称</label>
                  <input 
                    type="text" 
                    placeholder="例如: 香港 VPS"
                    className={cn("w-full rounded-xl px-4 py-3 focus:ring-2 outline-none transition-all border", isDarkMode ? "bg-[#0f172a] border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900")}
                    style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                    value={newServer.name}
                    onChange={e => setNewServer({...newServer, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">API 地址 (Socket.io)</label>
                  <input 
                    type="text" 
                    placeholder="http://ip:port"
                    className={cn("w-full rounded-xl px-4 py-3 focus:ring-2 outline-none transition-all border", isDarkMode ? "bg-[#0f172a] border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900")}
                    style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                    value={newServer.url}
                    onChange={e => setNewServer({...newServer, url: e.target.value})}
                  />
                </div>
                <button 
                  onClick={addServer}
                  className="md:col-span-2 w-full text-white font-black py-4 rounded-xl transition-all flex items-center justify-center gap-2 mt-2 shadow-lg"
                  style={{ 
                    backgroundColor: themeColor,
                    boxShadow: `0 10px 15px -3px ${themeColor}33`
                  }}
                >
                  <Plus size={20} />
                  添加新服务器
                </button>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">现有服务器 ({servers.length})</label>
                {servers.map(server => (
                  <div key={server.id} className={cn("flex items-center justify-between p-4 rounded-2xl border group transition-all", isDarkMode ? "bg-slate-800/30 border-slate-700 hover:border-slate-500" : "bg-slate-50 border-slate-200 hover:border-slate-300")}>
                    <div className="flex items-center gap-4">
                      <div 
                        className={cn("p-2.5 rounded-xl transition-all", isDarkMode ? "bg-slate-700" : "bg-slate-200")}
                        style={activeServerId === server.id ? { backgroundColor: themeColor } : {}}
                      >
                        <ServerIcon size={20} className={cn("transition-all", activeServerId === server.id ? "text-white" : (isDarkMode ? "text-slate-300" : "text-slate-500"))} />
                      </div>
                      <div>
                        <div className={cn("font-bold", isDarkMode ? "text-slate-100" : "text-slate-900")}>{server.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{server.url}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => deleteServer(server.id)}
                      disabled={servers.length <= 1}
                      className="p-2.5 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all disabled:opacity-0"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className={cn("p-8 border-t flex justify-end", isDarkMode ? "bg-slate-800/30 border-slate-700" : "bg-slate-50 border-slate-100")}>
              <button 
                onClick={() => setShowAddServer(false)}
                className="px-8 py-3 hover:bg-opacity-80 text-white rounded-xl font-bold transition-all"
                style={{ backgroundColor: themeColor }}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div 
            className={cn(
              "w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 my-auto",
              isDarkMode ? "bg-[#1e293b] border-slate-700" : "bg-white border-slate-200"
            )}
            style={{ 
              backgroundColor: isDarkMode ? `rgba(30, 41, 59, ${cardOpacity})` : `rgba(255, 255, 255, ${cardOpacity})`,
              borderColor: `${themeColor}40`
            }}
          >
            <div className={cn("p-8 border-b flex justify-between items-center", isDarkMode ? "border-slate-700" : "border-slate-100")}>
              <div>
                <h2 className="text-2xl font-black tracking-tight" style={{ color: themeColor }}>系统设置</h2>
                <p className="text-slate-400 text-sm mt-1">自定义您的监控面板外观</p>
              </div>
              <button onClick={() => setShowSettings(false)} className={cn("p-2 rounded-xl transition-all", isDarkMode ? "hover:bg-slate-700" : "hover:bg-slate-100")}>
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8">
              {/* Server Settings */}
              <div className={cn("mb-8 p-6 rounded-2xl border", isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200")}>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1 block mb-4">当前服务器设置</label>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">服务器名称</label>
                      <input 
                        type="text" 
                        className={cn("w-full rounded-xl px-4 py-3 focus:ring-2 outline-none transition-all border", isDarkMode ? "bg-[#0f172a] border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900")}
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                        value={activeServer.name}
                        onChange={e => updateActiveServer({ name: e.target.value })}
                        placeholder="例如：我的生产服务器"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">后端连接地址</label>
                      <input 
                        type="text" 
                        className={cn("w-full rounded-xl px-4 py-3 focus:ring-2 outline-none transition-all border", isDarkMode ? "bg-[#0f172a] border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900")}
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                        value={activeServer.url}
                        onChange={e => updateActiveServer({ url: e.target.value })}
                        placeholder="http://localhost:3001"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 italic px-1">修改后端地址后，系统将尝试自动重连。</p>
                </div>
              </div>

              <div className={cn("mb-8 p-6 rounded-2xl border", isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200")}>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1 block mb-4">自定义背景</label>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <input 
                      type="text" 
                      placeholder="输入背景图片 URL"
                      className={cn("flex-1 rounded-xl px-4 py-3 focus:ring-2 outline-none transition-all border", isDarkMode ? "bg-[#0f172a] border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900")}
                      style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                      value={bgImage && !bgImage.startsWith('data:') ? bgImage : ''}
                      onChange={e => setBgImage(e.target.value)}
                    />
                    <label className={cn("cursor-pointer px-4 py-3 rounded-xl font-bold transition-all flex items-center gap-2", isDarkMode ? "bg-slate-700 hover:bg-slate-600" : "bg-slate-200 hover:bg-slate-300")}>
                      <Plus size={18} />
                      <span>上传图片</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                    </label>
                  </div>
                  {bgImage && (
                    <button 
                      onClick={() => setBgImage(null)}
                      className="text-xs text-red-400 hover:text-red-300 font-bold flex items-center gap-1 transition-all"
                    >
                      <Trash2 size={14} />
                      清除自定义背景
                    </button>
                  )}
                </div>
              </div>

              <div className={cn("mb-8 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-2xl border", isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200")}>
                <div className="space-y-4">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1 block">主题色</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="color" 
                      className="size-12 rounded-lg bg-transparent cursor-pointer border-none"
                      value={themeColor}
                      onChange={e => setThemeColor(e.target.value)}
                    />
                    <input 
                      type="text" 
                      className={cn("flex-1 rounded-xl px-4 py-2 font-mono text-sm focus:ring-2 outline-none transition-all border", isDarkMode ? "bg-[#0f172a] border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900")}
                      style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                      value={themeColor}
                      onChange={e => setThemeColor(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                      {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'].map(color => (
                        <button 
                          key={color}
                          onClick={() => setThemeColor(color)}
                          className={cn("size-8 rounded-full border-2 transition-all hover:scale-110", isDarkMode ? "border-slate-700" : "border-slate-300")}
                          style={{ backgroundColor: color, borderColor: themeColor === color ? (isDarkMode ? '#fff' : '#000') : 'transparent' }}
                        />
                      ))}
                    </div>
                </div>

                <div className="space-y-4 flex flex-col justify-center">
                  <div className="space-y-4">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1 block">卡片透明度 ({Math.round(cardOpacity * 100)}%)</label>
                    <input 
                      type="range" 
                      min="0.1" 
                      max="1" 
                      step="0.05"
                      className={cn("w-full h-2 rounded-lg appearance-none cursor-pointer", isDarkMode ? "bg-slate-700" : "bg-slate-200")}
                      style={{ accentColor: themeColor }}
                      value={cardOpacity}
                      onChange={e => setCardOpacity(parseFloat(e.target.value))}
                    />
                  </div>
 
                  <div className="space-y-4">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1 block">背景遮罩透明度 ({Math.round(maskOpacity * 100)}%)</label>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.05"
                      className={cn("w-full h-2 rounded-lg appearance-none cursor-pointer", isDarkMode ? "bg-slate-700" : "bg-slate-200")}
                      style={{ accentColor: themeColor }}
                      value={maskOpacity}
                      onChange={e => setMaskOpacity(parseFloat(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className={cn("p-8 border-t flex justify-end", isDarkMode ? "bg-slate-800/30 border-slate-700" : "bg-slate-50 border-slate-100")}>
              <button 
                onClick={() => setShowSettings(false)}
                className="px-8 py-3 hover:bg-opacity-80 text-white rounded-xl font-bold transition-all"
                style={{ backgroundColor: themeColor }}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
