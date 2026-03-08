import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import '../styles.css';
import StrictFooter from '../components/StrictFooter';

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const pendingRequestsRef = useRef(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);

  useEffect(() => {
    const onRouteStart = () => setRouteLoading(true);
    const onRouteEnd = () => setRouteLoading(false);

    router.events.on('routeChangeStart', onRouteStart);
    router.events.on('routeChangeComplete', onRouteEnd);
    router.events.on('routeChangeError', onRouteEnd);

    return () => {
      router.events.off('routeChangeStart', onRouteStart);
      router.events.off('routeChangeComplete', onRouteEnd);
      router.events.off('routeChangeError', onRouteEnd);
    };
  }, [router]);

  useEffect(() => {
    const onLoadingStart = () => {
      pendingRequestsRef.current += 1;
      setRequestLoading(true);
    };

    const onLoadingEnd = () => {
      pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
      setRequestLoading(pendingRequestsRef.current > 0);
    };

    window.addEventListener('nexogo:loading:start', onLoadingStart);
    window.addEventListener('nexogo:loading:end', onLoadingEnd);

    return () => {
      window.removeEventListener('nexogo:loading:start', onLoadingStart);
      window.removeEventListener('nexogo:loading:end', onLoadingEnd);
    };
  }, []);

  return (
    <>
      {(routeLoading || requestLoading) && (
        <div className="brand-loader-screen brand-loader-screen-global" aria-live="polite" aria-busy="true">
          <div className="brand-loader-card brand-loader-card-global">
            <div className="brand-loader-mark">NG</div>
            <strong>NexoGo</strong>
            <p>Preparando tu siguiente paso dentro de la comunidad...</p>
            <div className="brand-loader-orbit">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      )}
      <Component {...pageProps} />
      {!Component.hideFooter && <StrictFooter />}
    </>
  );
}
