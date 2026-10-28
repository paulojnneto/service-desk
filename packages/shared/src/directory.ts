// Sample data: Nexo's employees and analysts.
// Sign-in accepts any of these emails with any password (challenge rule).

export type AvatarColors = { bg: string; fg: string };

export type Employee = {
  id: string;
  role: "employee";
  name: string;
  email: string;
  department: string;
  avatar: AvatarColors;
};

export type Analyst = {
  id: string;
  role: "analyst";
  name: string;
  email: string;
  level: "N1" | "N2";
  avatar: AvatarColors;
};

export type Person = Employee | Analyst;
export type Role = Person["role"];

// The narrow view of the signed-in person that the API sends to the UI.
export type SessionUser = {
  id: string;
  role: Role;
  name: string;
  firstName: string;
  email: string;
  initials: string;
};

// The employees and avatar colors come from the analyst console in the prototype.
export const PEOPLE: readonly Person[] = [
  employee("ana.souza", "Ana Souza", "Financeiro", { bg: "#DCE9F7", fg: "#0062C4" }),
  employee("carla.mendes", "Carla Mendes", "Comercial", { bg: "#F6E3D3", fg: "#9A4A12" }),
  employee("bruno.tavares", "Bruno Tavares", "Marketing", { bg: "#E6E1F7", fg: "#5B3FC4" }),
  employee("diego.ramos", "Diego Ramos", "Operações", { bg: "#DDF0E6", fg: "#1E7A4C" }),
  employee("elisa.prado", "Elisa Prado", "Jurídico", { bg: "#F7E1E6", fg: "#A3324F" }),
  employee("fabio.nunes", "Fábio Nunes", "Logística", { bg: "#E5E8EC", fg: "#3D4656" }),
  employee("gabriela.rocha", "Gabriela Rocha", "Engenharia", { bg: "#FBEFD0", fg: "#8A6100" }),
  analyst("rafael.lima", "Rafael Lima", "N2"),
  analyst("julia.castro", "Júlia Castro", "N1"),
];

export function findPersonByEmail(email: string): Person | undefined {
  const normalized = email.trim().toLowerCase();
  return PEOPLE.find((person) => person.email === normalized);
}

export function findPersonById(id: string): Person | undefined {
  return PEOPLE.find((person) => person.id === id);
}

// First letter of the first and last names: "Ana Souza" -> "AS".
export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function employee(id: string, name: string, department: string, avatar: AvatarColors): Employee {
  return { id, role: "employee", name, email: `${id}@nexo.com.br`, department, avatar };
}

function analyst(id: string, name: string, level: Analyst["level"]): Analyst {
  return {
    id,
    role: "analyst",
    name,
    email: `${id}@nexo.com.br`,
    level,
    avatar: { bg: "#0285F712", fg: "#0069C7" },
  };
}
