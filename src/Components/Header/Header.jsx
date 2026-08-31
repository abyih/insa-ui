import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Network,
  Cpu,
  GitBranch,
  Activity,
  Shield,
  Cloud,
  Layers,
  Wrench,
  Menu,
  X,
  LogOut,
  FileCode,
  Sun,
  Moon,
  Bell,
} from "lucide-react";
import logo from "../../assets/images/insa_logo.png";
import { useNotifications } from "../../context/NotificationContext";

function Header() {
  const location = useLocation();
  const isLoginPage = location.pathname === "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.classList.contains("dark");
  });

  const { unreadCount, isDrawerOpen, setIsDrawerOpen } = useNotifications();

  // Keep state in sync with DOM class in case it is changed elsewhere
  useEffect(() => {
    const checkTheme = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkTheme();
    // Observe class changes on html element
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDarkMode(true);
    }
  };

  const navItems = [
    { label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, to: "/dashboard" },
    { label: "Topology", icon: <Network className="w-4 h-4" />, to: "/topology" },
    { label: "Devices", icon: <Cpu className="w-4 h-4" />, to: "/nodes" },
    { label: "Flows", icon: <GitBranch className="w-4 h-4" />, to: "/flows" },
    { label: "Flow Manager", icon: <FileCode className="w-4 h-4" />, to: "/flow-manager" },
    { label: "Stats", icon: <Activity className="w-4 h-4" />, to: "/stats" },
    { label: "Anomaly", icon: <Shield className="w-4 h-4" />, to: "/anomaly" },
    { label: "Cloud", icon: <Cloud className="w-4 h-4" />, to: "/cloud" },
    { label: "Slicing", icon: <Layers className="w-4 h-4" />, to: "/network-slicing" },
    { label: "Tools", icon: <Wrench className="w-4 h-4" />, to: "/api-tester" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 h-20 px-6 flex items-center justify-between z-50 backdrop-blur-md bg-zinc-950/75 border-b border-zinc-800/80 shadow-lg shadow-black/20">
      {/* Logo and title */}
      <div className="flex items-center gap-3">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full blur opacity-40 group-hover:opacity-75 transition duration-500"></div>
          <img
            className="relative w-12 h-12 p-0.5 bg-zinc-900 rounded-full border border-zinc-800"
            src={logo}
            alt="insa-logo"
          />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-zinc-50 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            PNTC
          </h1>
          <span className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase block -mt-1">
            SDN Control Panel
          </span>
        </div>
      </div>

      {/* Controls container (desktop nav + toggles) */}
      <div className="flex items-center gap-3">
        {/* Desktop Navigation */}
        {!isLoginPage && (
          <nav className="hidden xl:flex items-center gap-2 text-sm mr-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-zinc-800 text-zinc-50 border border-zinc-700/50 shadow-inner"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {/* Notifications Bell */}
        {!isLoginPage && (
          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="relative p-2 rounded-lg border border-zinc-850 hover:bg-zinc-900 text-zinc-450 hover:text-zinc-100 transition-all duration-200 focus:outline-none"
            title="View SLA Alerts & Notifications"
          >
            <Bell className="w-4 h-4 text-zinc-300" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center border-2 border-zinc-950 animate-pulse">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        )}

        {/* Theme switcher */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg border border-zinc-850 hover:bg-zinc-900 text-zinc-450 hover:text-zinc-100 transition-all duration-200 focus:outline-none"
          title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDarkMode ? (
            <Sun className="w-4 h-4 text-amber-500" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-400" />
          )}
        </button>

        {/* Logout (Desktop) */}
        {!isLoginPage && (
          <div className="hidden xl:flex items-center gap-3">
            <div className="h-4 w-px bg-zinc-850"></div>
            <Link
              to="/"
              onClick={() => localStorage.removeItem("isAuthenticated")}
              className="flex items-center gap-1.5 py-1.5 px-3 border border-zinc-850 hover:bg-red-950/20 hover:border-red-900/40 hover:text-red-400 text-zinc-400 rounded-lg text-xs font-semibold transition-all duration-200"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </Link>
          </div>
        )}

        {/* Mobile Menu Toggle */}
        {!isLoginPage && (
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="xl:hidden p-2 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-100 transition-all"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        )}
      </div>

      {/* Mobile Menu */}
      {menuOpen && !isLoginPage && (
        <div className="absolute top-20 left-0 right-0 bg-zinc-950/95 border-b border-zinc-800 xl:hidden backdrop-blur-xl animate-in fade-in slide-in-from-top-5 duration-200 shadow-2xl">
          <nav className="flex flex-col px-6 py-6 gap-2 text-sm">
            {navItems.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-zinc-800 text-zinc-50 border border-zinc-700/50"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className="h-px bg-zinc-850 my-2"></div>
            <Link
              to="/"
              onClick={() => {
                localStorage.removeItem("isAuthenticated");
                setMenuOpen(false);
              }}
              className="flex items-center justify-center gap-2 py-3 px-4 mt-1 border border-zinc-850 hover:bg-red-950/20 hover:border-red-900/40 hover:text-red-400 text-zinc-400 rounded-xl text-sm font-semibold transition-all"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

export default Header;
