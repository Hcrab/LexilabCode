// englishpractice/frontend/src/pages/_app.tsx
import "../styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider } from "../contexts/AuthContext";
import Nav from "../components/Nav";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Nav />
      <Component {...pageProps} />
    </AuthProvider>
  );
}