import { useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AuthContext from '../contexts/AuthContext';

const withAuth = (WrappedComponent: React.ComponentType) => {
  const Wrapper = (props: any) => {
    const { user } = useContext(AuthContext);
    const router = useRouter();
    const [isVerifying, setIsVerifying] = useState(true);

    useEffect(() => {
      // Wait for the user object from the context to be loaded.
      if (user === null) {
        const storedAuth = localStorage.getItem('auth');
        if (!storedAuth) {
          router.replace('/login'); // Redirect to login if no auth info at all
          return;
        }
        setIsVerifying(true);
        return;
      }

      // Once the user object is available, verification is done.
      setIsVerifying(false);

    }, [user, router]);

    if (isVerifying) {
      return <div>Verifying access...</div>; // Or a proper loading spinner
    }

    if (!user) {
      // This case handles when the user explicitly logs out, user becomes null
      // after the initial check.
      return null; // Or redirect again, though useEffect should handle it.
    }

    return <WrappedComponent {...props} />;
  };

  Wrapper.displayName = `withAuth(${(WrappedComponent.displayName || WrappedComponent.name || 'Component')})`;

  return Wrapper;
};

export default withAuth;
