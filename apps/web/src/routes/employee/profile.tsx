import { useEmployee } from "../../lib/use-employee";

// Minimal page; the profile layout arrives in a later commit.
export function ProfilePage() {
  const user = useEmployee();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold text-ink">Meu perfil</h1>
      <p>{user.name}</p>
      <p>{user.email}</p>
    </main>
  );
}
