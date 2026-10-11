"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const TOKEN_KEY = "nexova.access_token";
const PASSWORD_RESET_MESSAGE_KEY = "nexova.password_reset_success";
type Profile = { name: string | null; phone: string | null; address: string | null };
type Account = { email: string; role: string; profile: Profile | null };

class ApiError extends Error {
  constructor(message: string, readonly fields: Record<string, string> = {}, readonly status?: number) {
    super(message);
  }
}

function errorMessage(payload: { detail?: unknown }) {
  if (typeof payload.detail === "string") return payload.detail;
  if (Array.isArray(payload.detail)) {
    return payload.detail.map((issue) => `${issue.loc?.slice(1).join(".") || "Datos"}: ${issue.msg}`).join("; ");
  }
  return "No se pudo completar la solicitud.";
}

export default function Workspace({ application, document }: { application: string; document: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkedPath, setCheckedPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [height, setHeight] = useState(1000);
  const [resetToken, setResetToken] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  const [invalidReset, setInvalidReset] = useState(false);
  const recoverySubmitting = useRef(false);
  const passwordSubmitting = useRef(false);
  const changePasswordView = pathname === "/account/change-password";
  const recoveryView = pathname === "/forgot-password" || pathname === "/reset-password";
  const publicView = pathname === "/login" || pathname === "/register" || recoveryView;

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setAccount(null);
    router.replace("/login");
  }

  async function request(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    const token = localStorage.getItem(TOKEN_KEY);
    const recoveryRequest = path === "/auth/forgot-password" || path === "/auth/reset-password";
    if (token && !recoveryRequest) headers.set("Authorization", `Bearer ${token}`);
    if (options.body) headers.set("Content-Type", "application/json");
    const response = await fetch(`/api/backend${path}`, { ...options, headers, cache: "no-store" });
    if (response.status === 401 && path !== "/auth/login" && !recoveryRequest) logout();
    const payload = await response.json().catch(() => {
      throw new ApiError(`El servidor devolvio una respuesta inesperada en ${path} (HTTP ${response.status}). Recarga la pagina e intentalo de nuevo; si persiste, informa de este codigo.`);
    });
    if (!response.ok) {
      const fields: Record<string, string> = {};
      if (Array.isArray(payload.detail)) {
        for (const issue of payload.detail) {
          const field = issue.loc?.[0] === "body" ? issue.loc[1] : undefined;
          if (["email", "password", "current_password", "new_password", "name", "phone", "address"].includes(field)) {
            fields[field] = issue.msg || "Valor no valido.";
          }
        }
      }
      if (path === "/users" && response.status === 409) {
        fields.email = "Este email ya esta registrado.";
      }
      throw new ApiError(errorMessage(payload), fields, response.status);
    }
    return payload;
  }

  useEffect(() => {
    let active = true;
    setError("");
    setFieldErrors({});
    setMessage("");
    setChecking(true);
    setBusy(false);
    setRecoverySent(false);
    setInvalidReset(false);
    recoverySubmitting.current = false;
    passwordSubmitting.current = false;
    if (recoveryView) {
      const token = new URLSearchParams(window.location.search).get("token") || "";
      setResetToken(token);
      if (pathname === "/reset-password" && !token.trim()) {
        setInvalidReset(true);
        setError("El enlace de restablecimiento no contiene un token válido. Solicita un nuevo enlace.");
      }
      setChecking(false);
      setCheckedPath(pathname);
      return;
    }
    if (pathname === "/login" && sessionStorage.getItem(PASSWORD_RESET_MESSAGE_KEY)) {
      setMessage("Tu contraseña se ha restablecido. Ya puedes iniciar sesión.");
      sessionStorage.removeItem(PASSWORD_RESET_MESSAGE_KEY);
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setAccount(null);
      setChecking(false);
      setCheckedPath(pathname);
      if (!publicView) router.replace("/login");
      return;
    }
    request("/auth/me").then((data: Account) => {
      if (!active) return;
      setAccount(data);
      setChecking(false);
      setCheckedPath(pathname);
      if (publicView) router.replace("/");
    }).catch((reason: Error) => {
      if (!active) return;
      setAccount(null);
      setError(reason.message);
      setChecking(false);
      setCheckedPath(pathname);
    });
    return () => { active = false; };
  }, [pathname]);

  useEffect(() => {
    function sessionChanged(event: StorageEvent) {
      if (event.key === TOKEN_KEY && !event.newValue) logout();
    }
    function resize(event: MessageEvent) {
      if (event.source === frame.current?.contentWindow && event.data?.type === "nexova:height") {
        setHeight(Math.max(600, Math.min(20000, Number(event.data.height) || 1000)));
      }
    }
    window.addEventListener("storage", sessionChanged);
    window.addEventListener("message", resize);
    return () => {
      window.removeEventListener("storage", sessionChanged);
      window.removeEventListener("message", resize);
    };
  }, []);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setFieldErrors({});
    let registrationCreated = false;
    try {
      const credentials = { email: String(form.get("email")), password: String(form.get("password")) };
      if (pathname === "/register") {
        const profile: Record<string, string> = {};
        for (const field of ["name", "phone", "address"]) {
          const value = String(form.get(field) || "").trim();
          if (value) profile[field] = value;
        }
        await request("/users", { method: "POST", body: JSON.stringify({ ...credentials, ...profile }) });
        registrationCreated = true;
      }
      const result = await request("/auth/login", { method: "POST", body: JSON.stringify(credentials) });
      if (typeof result.access_token !== "string" || !result.access_token.trim()) {
        throw new ApiError("La API de login no devolvio un token valido. No se ha iniciado sesion.");
      }
      localStorage.setItem(TOKEN_KEY, result.access_token);
      setAccount(await request("/auth/me"));
      router.replace("/");
    } catch (reason) {
      if (pathname === "/register" && reason instanceof ApiError && Object.keys(reason.fields).length) {
        setFieldErrors(reason.fields);
      } else {
        const detail = reason instanceof Error ? reason.message : "No se pudo conectar con la API. Intentalo de nuevo.";
        setError(registrationCreated ? `Tu cuenta fue creada, pero no se pudo completar el inicio de sesion. Ve al login. ${detail}` : detail === "Invalid email or password" ? "Email o contraseña incorrectos." : detail);
      }
    } finally { setBusy(false); }
  }

  async function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoverySubmitting.current || recoverySent || invalidReset) return;
    const form = new FormData(event.currentTarget);
    setError("");
    setFieldErrors({});
    const newPassword = String(form.get("new_password") || "");
    if (pathname === "/reset-password") {
      if (newPassword !== String(form.get("confirm_password"))) {
        setFieldErrors({ confirm_password: "Las contraseñas no coinciden." });
        return;
      }
      if (new TextEncoder().encode(newPassword).length > 72) {
        setFieldErrors({ new_password: "La contraseña no puede superar los 72 bytes UTF-8." });
        return;
      }
    }
    recoverySubmitting.current = true;
    setBusy(true);
    try {
      if (pathname === "/forgot-password") {
        await request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: String(form.get("email")) }) });
        setRecoverySent(true);
        setMessage("Si esa dirección está registrada, recibirás un enlace en breve");
      } else {
        await request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token: resetToken, new_password: newPassword }) });
        localStorage.removeItem(TOKEN_KEY);
        setAccount(null);
        sessionStorage.setItem(PASSWORD_RESET_MESSAGE_KEY, "true");
        router.replace("/login");
        return;
      }
    } catch (reason) {
      if (pathname === "/reset-password" && reason instanceof ApiError && reason.status === 400) {
        setInvalidReset(true);
        setError("El enlace de restablecimiento es inválido, ha expirado o ya se ha utilizado. Solicita un nuevo enlace.");
      } else if (reason instanceof ApiError && Object.keys(reason.fields).length) {
        setFieldErrors(reason.fields);
      } else {
        setError("No se pudo completar la solicitud. Comprueba tu conexión e inténtalo de nuevo.");
      }
    }
    recoverySubmitting.current = false;
    setBusy(false);
  }

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordSubmitting.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("new_password") || "");
    setError("");
    setMessage("");
    setFieldErrors({});
    if (newPassword !== String(form.get("confirm_password"))) {
      setFieldErrors({ confirm_password: "Las contraseñas no coinciden." });
      return;
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setFieldErrors({ new_password: "La contraseña no puede superar los 72 bytes UTF-8." });
      return;
    }
    passwordSubmitting.current = true;
    setBusy(true);
    try {
      await request("/auth/change-password", { method: "POST", body: JSON.stringify({
        current_password: String(form.get("current_password")), new_password: newPassword,
      }) });
      formElement.reset();
      setMessage("Tu contraseña se ha actualizado correctamente.");
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 400) {
        setFieldErrors({ current_password: "La contraseña actual es incorrecta." });
      } else if (reason instanceof ApiError && Object.keys(reason.fields).length) {
        setFieldErrors(reason.fields);
      } else if (!(reason instanceof ApiError && reason.status === 401)) {
        setError("No se pudo cambiar la contraseña. Comprueba tu conexión e inténtalo de nuevo.");
      }
    } finally {
      passwordSubmitting.current = false;
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request("/profiles/me", { method: "PUT", body: JSON.stringify({
        name: String(form.get("name")), phone: String(form.get("phone")), address: String(form.get("address")),
      }) });
      setAccount(await request("/auth/me"));
      setMessage("Perfil actualizado.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el perfil."); }
    finally { setBusy(false); }
  }

  async function saveCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const token = localStorage.getItem(TOKEN_KEY)!;
      const segment = token.split(".")[1];
      if (!segment) throw new Error("Sesion no valida. Inicia sesion de nuevo.");
      const encoded = segment.replace(/-/g, "+").replace(/_/g, "/");
      const userId = JSON.parse(atob(encoded)).sub;
      const password = String(form.get("password"));
      await request(`/users/${encodeURIComponent(userId)}`, { method: "PUT", body: JSON.stringify({
        email: String(form.get("email")), ...(password ? { password } : {}),
      }) });
      setAccount(await request("/auth/me"));
      setMessage("Cuenta actualizada.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la cuenta."); }
    finally { setBusy(false); }
  }

  if (checking || checkedPath !== pathname) return <main className="auth-loading" role="status">Comprobando sesion...</main>;

  function authField(name: string, label: string, type = "text", autocomplete = name) {
    const passwordField = ["password", "current_password", "new_password", "confirm_password"].includes(name);
    const required = name === "email" || passwordField;
    return <div className="auth-field" key={name}>
      <label htmlFor={`auth-${name}`}>{label}{!required && <small> (opcional)</small>}</label>
      <input id={`auth-${name}`} name={name} type={type} required={required} autoComplete={autocomplete}
        minLength={passwordField && name !== "current_password" && (pathname === "/register" || recoveryView || changePasswordView) ? 8 : undefined}
        aria-invalid={Boolean(fieldErrors[name])} aria-describedby={fieldErrors[name] ? `auth-${name}-error` : undefined}
        onChange={() => setFieldErrors((previous) => {
          const next = { ...previous };
          delete next[name];
          return next;
        })} />
      {fieldErrors[name] && <p id={`auth-${name}-error`} className="auth-field-error" role="alert">{fieldErrors[name]}</p>}
    </div>;
  }

  if (publicView) return <main className="auth-screen">
    <section className="auth-panel">
      <p className="auth-brand">Nexova <span>{application}</span></p>
      <h1>{pathname === "/forgot-password" ? "Recuperar contraseña" : pathname === "/reset-password" ? "Restablecer contraseña" : pathname === "/register" ? "Crear cuenta" : "Iniciar sesion"}</h1>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {message && <p className="auth-success" role="status">{message}</p>}
      {recoveryView ? <>
        <form onSubmit={submitRecovery}>
          <fieldset className="auth-recovery-fields" disabled={busy || recoverySent || invalidReset}>
            {pathname === "/forgot-password" ? authField("email", "Email", "email") : <>
              {authField("new_password", "Nueva contraseña", "password", "new-password")}
              {authField("confirm_password", "Confirmar contraseña", "password", "new-password")}
            </>}
            <button type="submit">{busy ? "Procesando..." : recoverySent ? "Enlace solicitado" : pathname === "/forgot-password" ? "Enviar enlace" : "Restablecer contraseña"}</button>
          </fieldset>
        </form>
        {pathname === "/reset-password" && <p><Link href="/forgot-password">Solicitar un nuevo enlace</Link></p>}
        <Link href="/login">Volver al login</Link>
      </> : <><form onSubmit={authenticate}>
        {authField("email", "Email", "email")}
        {authField("password", "Contraseña", "password", pathname === "/register" ? "new-password" : "current-password")}
        {pathname === "/register" && <>
          {authField("name", "Nombre", "text", "name")}
          {authField("phone", "Telefono", "tel", "tel")}
          {authField("address", "Direccion", "text", "street-address")}
        </>}
        <button disabled={busy} type="submit">{busy ? "Procesando..." : pathname === "/register" ? "Registrarme" : "Entrar"}</button>
      </form>
      <Link href={pathname === "/register" ? "/login" : "/register"}>{pathname === "/register" ? "Ya tengo cuenta" : "Crear una cuenta"}</Link>
      {pathname === "/login" && <p><Link href="/forgot-password">¿Olvidaste tu contraseña?</Link></p>}
      </>}
    </section>
  </main>;

  if (!account) return <main className="auth-loading">{error && <p role="alert">{error}</p>}<Link href="/login">Ir al login</Link></main>;

  return <>
    <header className="session-bar"><Link href="/">Nexova · {application}</Link><nav aria-label="Cuenta"><span>{account.email}</span><Link href="/account">Mi cuenta</Link><Link href="/account/profile">Mi perfil</Link><Link href="/account/change-password">Cambiar contraseña</Link><button onClick={logout}>Cerrar sesion</button></nav></header>
    {pathname === "/account" || pathname === "/account/profile" || changePasswordView ? <main className="account-page">
      <h1>{changePasswordView ? "Cambiar contraseña" : pathname === "/account/profile" ? "Mi perfil" : "Mi cuenta"}</h1>
      <p>{account.email} · {account.role}</p>
      {pathname === "/account/profile" && <dl><dt>Email</dt><dd>{account.email}</dd></dl>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {message && <p className="auth-success" role="status">{message}</p>}
      {changePasswordView ? <>
        <form onSubmit={submitPasswordChange}>
          <fieldset className="auth-recovery-fields" disabled={busy}>
            {authField("current_password", "Contraseña actual", "password", "current-password")}
            {authField("new_password", "Nueva contraseña", "password", "new-password")}
            {authField("confirm_password", "Confirmar contraseña", "password", "new-password")}
            <button type="submit">{busy ? "Procesando..." : "Guardar contraseña"}</button>
          </fieldset>
        </form>
        <Link href="/account">Volver a mi cuenta</Link>
      </> : <><section><h2>Perfil</h2><form onSubmit={saveProfile}>
        <label>Nombre<input name="name" defaultValue={account.profile?.name || ""} autoComplete="name" /></label>
        <label>Telefono<input name="phone" defaultValue={account.profile?.phone || ""} autoComplete="tel" /></label>
        <label>Direccion<input name="address" defaultValue={account.profile?.address || ""} autoComplete="street-address" /></label>
        <button disabled={busy}>Guardar perfil</button>
      </form></section>
      {pathname === "/account" && <section><h2>Acceso</h2><form onSubmit={saveCredentials}>
        <label>Email<input name="email" type="email" required defaultValue={account.email} autoComplete="email" /></label>
        <label>Nueva contraseña<input name="password" type="password" minLength={8} autoComplete="new-password" /></label>
        <button disabled={busy}>Guardar cuenta</button>
      </form></section>}
      </>}
    </main> : <iframe ref={frame} title={`${application} de Nexova`} className="workspace-frame" style={{ height }} srcDoc={document} />}
  </>;
}