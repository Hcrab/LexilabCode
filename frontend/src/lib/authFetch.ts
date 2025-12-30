export const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  
  // Use a flexible header type
  const headers: HeadersInit = {
    ...options.headers,
  };

  // Do not set Content-Type for FormData, the browser does it with the correct boundary.
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-access-token'] = token; // Add fallback for misconfigured proxies
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle token expiration gracefully
  if (response.status === 401) {
    try {
      const errorData = await response.clone().json(); // Clone to read body safely
      if (errorData.message && errorData.message.includes('expired')) {
        console.error('Session expired. Redirecting to login.');
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('english_name');
        // Redirect to login page with a message
        window.location.href = `/admin/login?message=${encodeURIComponent('Session expired, please log in again.')}`;
        // Return a promise that will not resolve to prevent further processing
        return new Promise(() => {});
      }
    } catch (e) {
      // The 401 response was not JSON, handle as a generic error
      console.error('Received a non-JSON 401 error.', e);
    }
  }

  return response;
};
