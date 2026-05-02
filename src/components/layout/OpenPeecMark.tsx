import { cn } from "@/lib/utils";

type OpenPeecMarkProps = React.SVGProps<SVGSVGElement> & {
  title?: string;
};

export function OpenPeecMark({
  className,
  title,
  ...props
}: OpenPeecMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={cn("size-5", className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M13 23V18C13 15.239 15.239 13 18 13H23"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M41 13H46C48.761 13 51 15.239 51 18V23"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M51 41V46C51 48.761 48.761 51 46 51H41"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M23 51H18C15.239 51 13 48.761 13 46V41"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M16 32C19.971 24.887 25.304 21.25 32 21.25C38.696 21.25 44.029 24.887 48 32C44.029 39.113 38.696 42.75 32 42.75C25.304 42.75 19.971 39.113 16 32Z"
        fill="currentColor"
      />
      <circle cx="32" cy="32" r="9" fill="var(--background)" />
      <circle cx="32" cy="32" r="5" fill="#2563EB" />
      <rect x="42.5" y="18" width="4" height="7" rx="1.5" fill="#93C5FD" />
      <rect x="48.5" y="15" width="4" height="10" rx="1.5" fill="#60A5FA" />
      <rect x="54.5" y="11" width="4" height="14" rx="1.5" fill="#2563EB" />
    </svg>
  );
}
