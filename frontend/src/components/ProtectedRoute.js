import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
//will be posted?
//1
//2
//3
//4
const getRoleFromToken = (token) => {
  if (!token) return null;
  try {
    const decoded = jwtDecode(token);
    return decoded.role;
  } catch (error) {
    console.error("Invalid token:", error);
    return null;
  }
};

const ProtectedRoute = ({ allowedRoles, children }) => {
  const token = localStorage.getItem('token');
  const userRole = getRoleFromToken(token);

  if (!token || !userRole) {
    // 用户未登录或令牌无效
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(userRole)) {
    // 用户角色不匹配
    // 根据角色重定向到各自的主页
    if (userRole === 'admin') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    if (userRole === 'superadmin') {
      return <Navigate to="/superadmin/dashboard" replace />;
    }
    if (userRole === 'user') {
      return <Navigate to="/student/dashboard" replace />;
    }
    // 如果角色未知，则返回登录页
    return <Navigate to="/login" replace />;
  }

  // 如果是布局组件，直接渲染 children
  if (children) {
    return children;
  }

  // 如果没有 children，则渲染嵌套路由
  return <Outlet />;
};

export default ProtectedRoute;
