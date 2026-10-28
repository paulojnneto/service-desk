import { Form, Outlet } from "react-router";
import { useEmployee } from "../../lib/use-employee";

// Minimal shell; the sidebar and top bar from Screens 2 and 3 arrive in a later commit.
export function EmployeeLayout() {
  const user = useEmployee();
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-rule px-6 py-3">
        <span>{user.name}</span>
        <Form method="post" action="/sign-out">
          <button type="submit">Sair</button>
        </Form>
      </header>
      <Outlet />
    </div>
  );
}
