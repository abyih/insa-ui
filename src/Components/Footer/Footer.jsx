import React from 'react';
import { FaFacebook, FaLinkedin, FaTwitter } from "react-icons/fa";

function Footer() {
  return (
    <footer className="w-full bg-zinc-950 border-t border-zinc-900 text-zinc-400 py-8 mt-12">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          
          {/* Logo / Platform Info */}
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-bold text-zinc-200 tracking-tight">PNTC Control Panel</h3>
            <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
              Software Defined Network orchestration, telemetry, and automated security threat protection platform.
            </p>
          </div>

          {/* Contact Us */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">Contact Info</h4>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li>
                <span className="text-zinc-500 font-medium">Email:</span>{' '}
                <a href="mailto:contact@insa.gov.et" className="hover:text-zinc-200 transition-colors">
                  contact@insa.gov.et
                </a>
              </li>
              <li>
                <span className="text-zinc-500 font-medium">Phone:</span>{' '}
                <a href="tel:+251113717114" className="hover:text-zinc-200 transition-colors">
                  +251-113-71-71-14
                </a>
              </li>
              <li>
                <span className="text-zinc-500 font-medium">Address:</span>{' '}
                <a
                  href="https://www.google.com/maps/place/Wello+Sefer,+Addis+Ababa,+Ethiopia"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-zinc-200 transition-colors"
                >
                  Wello Sefer, Addis Ababa
                </a>
              </li>
            </ul>
          </div>

          {/* Social Media */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">Follow Us</h4>
            <div className="flex space-x-4">
              <a 
                href="https://web.facebook.com/INSA.ETHIOPIA" 
                target="_blank" 
                rel="noreferrer"
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all duration-200"
              >
                <FaFacebook className="text-lg" />
              </a>
              <a 
                href="https://www.linkedin.com/in/insa-%E1%8A%A2%E1%88%98%E1%8B%B0%E1%8A%A0-649987269/?originalSubdomain=et" 
                target="_blank" 
                rel="noreferrer"
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all duration-200"
              >
                <FaLinkedin className="text-lg" />
              </a>
              <a 
                href="https://x.com/INSAEthio" 
                target="_blank" 
                rel="noreferrer"
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all duration-200"
              >
                <FaTwitter className="text-lg" />
              </a>
            </div>
          </div>

        </div>

        <hr className="my-8 border-zinc-900" />
        
        <div className="flex flex-col sm:flex-row justify-between items-center text-xs text-zinc-500 gap-4">
          <p>© {new Date().getFullYear()} PNTC Dashboard. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-sm shadow-green-500/50"></span>
            <span>Connected to ODL @ 10.0.1.2 | v1.3 | OK</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
