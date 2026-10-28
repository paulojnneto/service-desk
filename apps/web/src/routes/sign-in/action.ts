import { redirect, type ActionFunctionArgs } from "react-router";
import { signIn } from "../../lib/api";
import { homePath } from "../../lib/guards";

export type SignInActionData = { error: string; email: string };

const MESSAGES = {
  missingEmail: "Informe seu e-mail corporativo.",
  missingPassword: "Informe sua senha.",
  unknown_email: "Não encontramos esse e-mail. Use seu e-mail corporativo @nexo.com.br.",
  invalid_input: "Confira o e-mail e a senha.",
  unavailable: "Não foi possível entrar agora. Tente de novo em instantes.",
};

export async function signInAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  if (!email.trim()) return { error: MESSAGES.missingEmail, email } satisfies SignInActionData;
  if (!password) return { error: MESSAGES.missingPassword, email } satisfies SignInActionData;

  const result = await signIn({ email, password, remember: form.get("remember") === "on" });
  if ("error" in result) return { error: MESSAGES[result.error], email } satisfies SignInActionData;

  return redirect(homePath(result.user.role));
}
