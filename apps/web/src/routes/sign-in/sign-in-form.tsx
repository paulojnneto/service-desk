import { useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import type { SignInActionData } from "./action";

export function SignInForm() {
  const result = useActionData() as SignInActionData | undefined;
  const pending = useNavigation().state !== "idle";
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordHelp, setShowPasswordHelp] = useState(false);
  const error = result?.error;

  return (
    <Form method="post" noValidate className="flex w-full max-w-[380px] flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[40px] leading-[1.1] tracking-[-0.8px] text-ink">
          Entrar
        </h2>
        <p className="text-[15.5px] leading-normal text-ink-3">
          Use seu e-mail corporativo e a senha da rede Nexo.
        </p>
      </div>

      <div className="flex flex-col gap-[18px]">
        <Field label="E-mail corporativo" htmlFor="email">
          <InputBox icon={<Mail className="size-4" />} invalid={Boolean(error)}>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              defaultValue={result?.email}
              placeholder="nome.sobrenome@nexo.com.br"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "sign-in-error" : undefined}
              className="h-full flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-3/70"
            />
          </InputBox>
        </Field>

        <Field
          label="Senha"
          htmlFor="password"
          aside={
            <button
              type="button"
              onClick={() => setShowPasswordHelp((open) => !open)}
              aria-expanded={showPasswordHelp}
              className="text-[13.5px] font-medium text-primary-text hover:underline"
            >
              Esqueci minha senha
            </button>
          }
        >
          <InputBox icon={<LockKeyhole className="size-4" />}>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="h-full flex-1 bg-transparent text-[14.5px] text-ink outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="flex size-[30px] items-center justify-center rounded-md text-ink-3 hover:bg-desk"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </InputBox>
        </Field>
        {showPasswordHelp && (
          <p className="-mt-2 text-[13px] text-ink-3">
            A senha é a mesma da rede Nexo. Para redefinir, ligue no ramal 4000.
          </p>
        )}

        <label className="flex cursor-pointer items-center gap-[9px] pt-0.5 text-[13.5px] text-ink-2">
          <span className="relative flex size-[18px]">
            <input
              type="checkbox"
              name="remember"
              defaultChecked
              className="peer size-[18px] cursor-pointer appearance-none rounded-md border border-ink/20 bg-paper checked:border-cta checked:bg-cta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta"
            />
            <Check className="pointer-events-none absolute inset-0 m-auto size-3 text-white opacity-0 peer-checked:opacity-100" />
          </span>
          Manter conectado neste computador
        </label>
      </div>

      {error && (
        <p
          id="sign-in-error"
          role="alert"
          className="-my-2 rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger-text"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-cta text-[15.5px] font-semibold text-white shadow-[0_1px_2px_#0062C433,0_6px_16px_#0062C426] transition-colors hover:bg-primary-hover disabled:opacity-70"
      >
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" /> Entrando…
          </>
        ) : (
          <>
            Entrar <ArrowRight className="size-4" />
          </>
        )}
      </button>

      {/* Demo hint in the prototype's empty note area (stage 3 PRD, decision 1). */}
      <p className="border-t border-rule pt-4 text-[13px] leading-normal text-ink-3">
        Ambiente de demonstração: entre com um e-mail de exemplo, como{" "}
        <span className="font-medium text-ink-2">ana.souza@nexo.com.br</span> (funcionária) ou{" "}
        <span className="font-medium text-ink-2">rafael.lima@nexo.com.br</span> (analista), e
        qualquer senha.
      </p>
    </Form>
  );
}

function Field({
  label,
  htmlFor,
  aside,
  children,
}: {
  label: string;
  htmlFor: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-[13.5px] font-medium text-ink">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

// Input frame: blue border and icon when focused, as in the prototype.
function InputBox({
  icon,
  invalid,
  children,
}: {
  icon: React.ReactNode;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`group flex h-11 items-center gap-2.5 rounded-lg border bg-paper pr-2 pl-3.5 shadow-[0_1px_2px_#1B24310A] focus-within:border-cta focus-within:ring-[0.5px] focus-within:ring-cta ${
        invalid ? "border-danger" : "border-ink/12"
      }`}
    >
      <span className="text-ink-3 group-focus-within:text-primary-text">{icon}</span>
      {children}
    </div>
  );
}
