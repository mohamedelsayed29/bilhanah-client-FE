/** Who is signed in, on the desktop app bar: an initial, the name and the email. */
export function UserChip({ name, email }: { name: string | undefined; email: string | undefined }) {
  return <div className="appbar-user">
    <span className="user-avatar" aria-hidden="true">{name?.trim().charAt(0)}</span>
    <span><strong>{name}</strong><small className="ltr">{email}</small></span>
  </div>;
}
