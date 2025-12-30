import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FiMenu, FiX } from 'react-icons/fi';
import UnifiedNavPanel from './UnifiedNavPanel';

const AdminLayout = ({ children, setToken }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();

    useEffect(() => {
        if (sidebarOpen) {
            setSidebarOpen(false);
        }
    }, [location.pathname]);

    const navItems = [
        { to: "/admin/dashboard", label: "Home" }
    ];
    
    const currentPage = navItems.find(item => item.to === location.pathname);

    return (
        <div className="flex h-screen bg-gray-50">
            <UnifiedNavPanel role="admin" setToken={setToken} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

            {/* Floating open button for desktop when sidebar closed */}
            {!sidebarOpen && (
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="hidden md:block fixed top-4 left-4 z-40 bg-white border rounded-full shadow p-2 text-gray-600 hover:text-gray-800"
                    aria-label="Open navigation"
                >
                    <FiMenu size={20} />
                </button>
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Mobile Top Bar */}
                <header className="md:hidden bg-white shadow-sm z-40">
                    <div className="p-4 flex justify-between items-center">
                        <button onClick={() => setSidebarOpen(true)} className="text-gray-600 hover:text-gray-800">
                            <FiMenu size={24} />
                        </button>
                        <h1 className="text-lg font-semibold text-gray-700">{currentPage?.label || 'Menu'}</h1>
                        <div className="w-8"></div> {/* Spacer */}
                    </div>
                </header>
                
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 sm:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;
