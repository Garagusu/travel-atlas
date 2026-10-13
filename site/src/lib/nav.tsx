import { forwardRef, useEffect, type AnchorHTMLAttributes } from "react";
import { Link as RRLink, useLocation, useNavigate, useSearchParams as useRRSearchParams } from "react-router";

/** next/link-style API on top of react-router (keeps the ported components unchanged). */
export const Link = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(function Link(
  { href, ...rest },
  ref,
) {
  return <RRLink ref={ref} to={href} {...rest} />;
});

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (to: string) => navigate(to),
    replace: (to: string) => navigate(to, { replace: true }),
    back: () => navigate(-1),
    /** Data is live in the browser store, so there is nothing to refresh. */
    refresh: () => {},
  };
}

export const usePathname = () => useLocation().pathname;

/** URL query parameters (read-only), like next/navigation's useSearchParams. */
export function useSearchParams() {
  return useRRSearchParams()[0];
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title === "Travel Atlas" ? title : `${title} · Travel Atlas`;
  }, [title]);
}
