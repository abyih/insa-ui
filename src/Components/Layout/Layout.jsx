import React from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "../Sidebar/Sidebar";
import Header from "../Header/Header";
import Footer from "../Footer/Footer";

const Layout = ({ children }) => {
	const location = useLocation();

	// Check if the current route is the login page
	const isLoginPage = location.pathname === "/";
  const isDashboard = location.pathname === "/dashboard";
  return (
     <div className="flex flex-col min-h-screen">
      <Header />

      <div className="flex flex-1">
        {/* {!isLoginPage && <Sidebar />} */}
        <div className="flex-1 mt-20 bg-gray-50">
          <main className="p-4">{children}</main>
        </div>
      </div>
 {isDashboard && <Footer />}
      
    </div>
  );
};

export default Layout;
