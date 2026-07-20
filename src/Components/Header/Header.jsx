import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  FaTachometerAlt,
  FaNetworkWired,
  FaMicrochip,
  FaProjectDiagram,
  FaChartBar,
  FaTools,
  FaBars,
  FaTimes,
  FaShieldAlt,
  FaCloud,
} from "react-icons/fa";
import logo from "../../assets/images/insa_logo.png";

function Header() {
  const location = useLocation();
  const isLoginPage = location.pathname === "/";
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { label: "Dashboard", icon: <FaTachometerAlt />, to: "/dashboard" },
    { label: "Topology", icon: <FaNetworkWired />, to: "/topology" },
    { label: "Devices", icon: <FaMicrochip />, to: "/nodes" },
    { label: "Flows", icon: <FaProjectDiagram />, to: "/flows" },
    { label: "Flow Manager", icon: <FaProjectDiagram />, to: "/flow-manager" },
    { label: "Stats", icon: <FaChartBar />, to: "/stats" },
    { label: "Anomaly", icon: <FaShieldAlt />, to: "/anomaly" },
    { label: "Cloud", icon: <FaCloud />, to: "/cloud" },
    { label: "Tools", icon: <FaTools />, to: "/api-tester" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 bg-blue-900 text-white h-20 px-4 sm:px-6 flex items-center justify-between z-50 shadow-md">
      {/* Logo and title */}
      <div className="flex items-center gap-3">
        <img
          className="w-14 h-14 p-1 bg-gray-200 rounded-full"
          src={logo}
          alt="insa-logo"
        />
        <h1 className="text-2xl font-bold">PNTC</h1>
      </div>

      {/* Desktop Navigation */}
      {!isLoginPage && (
        <nav className="hidden md:flex items-center gap-6 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={`flex items-center gap-2 hover:text-yellow-400 transition ${
                location.pathname === item.to
                  ? "text-yellow-400 font-semibold"
                  : ""
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
          <Link
            to="/"
            onClick={() => localStorage.removeItem("isAuthenticated")}
            className="ml-4 py-1 px-3 bg-white text-blue-800 rounded hover:bg-gray-100 transition"
          >
            Logout
          </Link>
        </nav>
      )}

      {/* Mobile Menu Toggle */}
      {!isLoginPage && (
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden text-xl"
        >
          {menuOpen ? <FaTimes /> : <FaBars />}
        </button>
      )}

      {/* Mobile Menu */}
      {menuOpen && !isLoginPage && (
        <div className="absolute top-20 left-0 right-0 bg-blue-900 border-t border-blue-800 md:hidden">
          <nav className="flex flex-col px-4 py-4 gap-4 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 hover:text-yellow-400 transition ${
                  location.pathname === item.to
                    ? "text-yellow-400 font-semibold"
                    : ""
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
            <Link
              to="/"
              onClick={() => { localStorage.removeItem("isAuthenticated"); setMenuOpen(false); }}
              className="py-1 px-3 mt-2 bg-white text-blue-800 rounded hover:bg-gray-100 transition w-max"
            >
              Logout
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

export default Header;
