import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiHome, FiBookOpen, FiUser, FiLogOut, FiAward, FiBarChart2, FiX } from 'react-icons/fi';

const NavItem = ({ icon, to, children }) => {
    const location = useLocation();
    const isActive = location.pathname === to || (to === '/admin/class-stats-overview' && location.pathname.startsWith('/admin/class/'));

    return (
        <Link
            to={to}
            className={`w-full flex items-center p-3 rounded-lg transition-colors ${
                isActive
                ? 'bg-purple-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
        >
            {React.cloneElement(icon, { className: 'mr-4' })}
            {children}
        </Link>
    );
};

const UnifiedNavPanel = ({ role, setToken, sidebarOpen, setSidebarOpen }) => {
    const navigate = useNavigate();

    const handleLogout = () => {
        try {
            localStorage.removeItem('wp_last_session');
            localStorage.removeItem('wp_resume_v1');
        } catch {}
        localStorage.removeItem('token');
        setToken(null);
        navigate('/login');
    };

    const adminNavItems = [
        { icon: <FiHome />, to: "/admin/dashboard", label: "Dashboard" },
        { icon: <FiBarChart2 />, to: "/admin/class-stats-overview", label: "Platform Overview" },
        { icon: <FiBookOpen />, to: "/admin/quizzes", label: "Quizzes" },
        { icon: <FiUser />, to: "/admin/profile", label: "My Profile" },
        { icon: <FiBookOpen />, to: "/admin/secret-box", label: "Secret Wordbook Box" }
    ];

    const superAdminNavItems = [
        { icon: <FiHome />, to: "/superadmin/dashboard", label: "Platform Overview" },
        { icon: <FiUser />, to: "/superadmin/dashboard#pending-teachers", label: "Pending Teachers" },
        { icon: <FiBookOpen />, to: "/superadmin/word-list", label: "Dictionary" },
        { icon: <FiBookOpen />, to: "/superadmin/wordbooks", label: "Wordbooks" }
    ];

    const studentNavItems = [
        { icon: <FiHome />, to: "/student/dashboard", label: "Dashboard" },
        { icon: <FiUser />, to: "/student/profile", label: "My Profile" },
        { icon: <FiAward />, to: "/student/word-practice", label: "Word Practice" },
        { icon: <FiBookOpen />, to: "/student/word-overview", label: "Word Overview" },
        { icon: <FiBookOpen />, to: "/student/quizzes", label: "Quiz List" },
        { icon: <FiBookOpen />, to: "/student/my-wordbooks", label: "My Wordbooks" },
        { icon: <FiBookOpen />, to: "/student/bookmarks", label: "My Bookmarks" },
        { icon: <FiBarChart2 />, to: "/student/stats", label: "Progress Tracker" },
        { icon: <FiBookOpen />, to: "/review", label: "Review" }
    ];

    const navItems = role === 'admin' ? adminNavItems : (role === 'superadmin' ? superAdminNavItems : studentNavItems);
    const titleMap = { admin: 'Admin Dashboard', superadmin: 'Superadmin', user: 'Student Center' };
    const title = titleMap[role] || 'App';

    return (
        <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-md flex flex-col transition-transform duration-300 ease-in-out transform ${sidebarOpen ? 'translate-x-0 md:translate-x-0 md:relative' : '-translate-x-full md:-translate-x-full md:absolute'}`}>
            <div className="p-6 text-2xl font-bold text-purple-700 border-b flex justify-between items-center">
                <span>{title}</span>
                <button onClick={() => setSidebarOpen(false)} className="text-gray-500 hover:text-gray-800" aria-label="Close navigation">
                    <FiX size={24} />
                </button>
            </div>
            <nav className="flex-1 p-4 space-y-2">
                {navItems.map(item => (
                    <NavItem key={item.to} icon={item.icon} to={item.to}>
                        {item.label}
                    </NavItem>
                ))}
            </nav>
            <div className="p-4 border-t">
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center text-gray-600 hover:bg-gray-100 p-3 rounded-lg"
                >
                    <FiLogOut className="mr-4" />
                    Logout
                </button>
            </div>
        </aside>
    );
};

export default UnifiedNavPanel;
