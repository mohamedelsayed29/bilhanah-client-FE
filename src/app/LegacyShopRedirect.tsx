import { Navigate, useLocation } from 'react-router';

/** /shop… → /products…, keeping the rest of the path, the query (Paymob's result) and the hash. */
export function LegacyShopRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate replace to={`${pathname.replace(/^\/shop/, '/products')}${search}${hash}`} />;
}
