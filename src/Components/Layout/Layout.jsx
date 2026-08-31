import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "../Sidebar/Sidebar";
import Header from "../Header/Header";
import Footer from "../Footer/Footer";
import GlobalAttackAlert from "../GlobalAttackAlert";
import ToastContainer from "../Notifications/ToastContainer";
import NotificationDrawer from "../Notifications/NotificationDrawer";

const Layout = ({ children }) => {
	const location = useLocation();

	// Check if the current route is the login page
	const isLoginPage = location.pathname === "/";
  const isDashboard = location.pathname === "/dashboard";

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);
  return (
     <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50">
      <Header />
      <GlobalAttackAlert />
      <ToastContainer />
      <NotificationDrawer />

      <div className="flex flex-1">
        <div className="flex-1 mt-20 bg-zinc-950">
          <main className="p-4 sm:p-6 md:p-8">{children}</main>
        </div>
      </div>
      {isDashboard && <Footer />}
    </div>
  );
};

export default Layout;
