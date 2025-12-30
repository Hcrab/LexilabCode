import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import UnifiedNavPanel from './UnifiedNavPanel';

const SuperAdminLayout = ({ children, setToken }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { if (sidebarOpen) setSidebarOpen(false); }, [location.pathname]);

  return (
    <div className="flex h-screen bg-gray-50">
      <UnifiedNavPanel role="superadmin" setToken={setToken} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      {/* Floating open button for desktop when sidebar closed */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="hidden md:block fixed top-4 left-4 z-40 bg-white border rounded-full shadow p-2 text-gray-600 hover:text-gray-800"
          aria-label="Open navigation"
        >
          {/* reuse FiMenu via dynamic import to keep light */}
          <span className="block w-5 h-5">☰</span>
        </button>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default SuperAdminLayout;
