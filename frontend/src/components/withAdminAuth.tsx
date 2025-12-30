import { useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AuthContext from '../contexts/AuthContext';

const withAdminAuth = (WrappedComponent: React.ComponentType) => {
  const Wrapper = (props: any) => {
    const { user } = useContext(AuthContext);
    const router = useRouter();
    const [isVerifying, setIsVerifying] = useState(true);

    useEffect(() => {
      // The AuthProvider is responsible for loading the user from localStorage.
      // We must wait for the user object from the context to be definitively loaded.
      // An initial state of `null` for the user object indicates that the AuthProvider
      // has not yet finished its own useEffect to load from localStorage.
      
      // We show a loading state as long as the user is null.
      if (user === null) {
        // To avoid a flicker on page reload, we can do a quick check of localStorage here.
        // If auth info isn't present, we can redirect immediately.
        const storedAuth = localStorage.getItem('auth');
        if (!storedAuth) {
          router.replace('/403');
          return; // Early exit
        }
        // If it is present, we still wait for the context to provide it,
        // to ensure we have a single source of truth.
        setIsVerifying(true);
        return;
      }

      // Once the user object is available from the context, we can verify the role.
      if (user.role === 'admin' || user.role === 'my admin') {
        setIsVerifying(false); // User is an admin, allow rendering.
      } else {
        router.replace('/403'); // User is not an admin.
      }
    }, [user, router]);

    if (isVerifying) {
      return <div>Verifying access...</div>; // Or a proper loading spinner
    }

    return <WrappedComponent {...props} />;
  };

  Wrapper.displayName = `withAdminAuth(${(WrappedComponent.displayName || WrappedComponent.name || 'Component')})`;

  return Wrapper;
};

export default withAdminAuth;
