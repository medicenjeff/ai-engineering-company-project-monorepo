import { test, expect } from "@playwright/test";
import { account, token, authenticatePage } from "./session";

for (const path of ["/", "/account", "/account/profile", "/suppliers", "/analysis"]) {
  for (const session of ["absent", "invalid"]) {
    test(`ruta ${path} requiere sesion ${session}`, async ({ page }) => {
      if (session === "invalid") {
        await page.addInitScript(() => localStorage.setItem("nexova.access_token", "invalid-jwt"));
        await page.route("**/api/backend/auth/me", (route) => {
          expect(route.request().headers().authorization).toBe("Bearer invalid-jwt");
          return route.fulfill({ status: 401, json: { detail: "Invalid token" } });
        });
      }
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.locator("iframe")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Iniciar sesion" })).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("nexova.access_token"))).toBeNull();
    });
  }
}

test("login y registro no solicitan validacion sin token", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/backend/")) calls.push(request.url());
  });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Iniciar sesion" })).toBeVisible();
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Crear cuenta" })).toBeVisible();
  expect(calls).toEqual([]);
});

test("la ruta nueva espera su validacion sin mostrar contenido protegido", async ({ page }) => {
  await authenticatePage(page);
  await page.goto("/");
  await expect(page.locator("iframe")).toBeVisible();
  let release = () => {};
  const validation = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/backend/auth/me", async (route) => {
    await validation;
    await route.fulfill({ status: 401, json: { detail: "Invalid token" } });
  });
  await page.getByRole("link", { name: "Mi perfil", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(page.getByRole("status")).toHaveText("Comprobando sesion...");
  await expect(page.getByRole("heading", { name: "Mi perfil", exact: true })).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  release();
  await expect(page).toHaveURL(/\/login$/);
});

test("registro, sesion persistente, perfil y cierre de sesion", async ({ page }, testInfo) => {
  let current = structuredClone(account);
  await page.route("**/api/backend/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/auth/login")) {
      expect(request.postDataJSON()).toEqual({ email: account.email, password: "secure-password" });
      return route.fulfill({ json: { access_token: token, token_type: "bearer" } });
    }
    if (url.pathname.endsWith("/users") && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ email: account.email, password: "secure-password", name: "Miembro", phone: "+34 612345678", address: "Valencia" });
      return route.fulfill({ status: 201, json: { id: "user-1" } });
    }
    expect(request.headers().authorization).toBe(`Bearer ${token}`);
    if (url.pathname.endsWith("/profiles/me")) {
      current.profile = request.postDataJSON();
      return route.fulfill({ json: current.profile });
    }
    if (url.pathname.endsWith("/users/user-1")) {
      current.email = request.postDataJSON().email;
      return route.fulfill({ json: current });
    }
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({ json: current });
    return route.fulfill({ json: [] });
  });

  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("link", { name: "Crear una cuenta" }).click();
  await page.locator("#auth-name").fill("Miembro");
  await page.locator("#auth-phone").fill("+34 612345678");
  await page.locator("#auth-address").fill("Valencia");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Contraseña", { exact: true }).fill("secure-password");
  await page.getByRole("button", { name: "Registrarme" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("iframe")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("nexova.access_token"))).toBe(token);
  await page.reload();
  await expect(page.getByRole("link", { name: "Mi cuenta" })).toBeVisible();
  await page.getByRole("link", { name: "Mi cuenta" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Nombre actualizado");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByRole("status")).toHaveText("Perfil actualizado.");
  await page.getByLabel("Email", { exact: true }).fill("updated@example.com");
  await page.getByRole("button", { name: "Guardar cuenta" }).click();
  await expect(page.getByRole("status")).toHaveText("Cuenta actualizada.");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-account-mobile.png`, fullPage: true });
  await page.getByRole("button", { name: "Cerrar sesion" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem("nexova.access_token"))).toBeNull();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("perfil carga auth/me y guarda nombre y contacto con Bearer", async ({ page }) => {
  await authenticatePage(page);
  const profile = { name: "Perfil actualizado", phone: "+34 612345678", address: "Calle Principal 1" };
  let saved = false;
  await page.route("**/api/backend/profiles/me", (route) => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    expect(route.request().postDataJSON()).toEqual(profile);
    saved = true;
    return route.fulfill({ json: { id: "profile-1", user_id: "user-1", ...profile } });
  });
  await page.goto("/account/profile");
  await expect(page.getByRole("heading", { name: "Mi perfil", exact: true })).toBeVisible();
  await expect(page.locator("dd")).toHaveText(account.email);
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue(account.profile.name);
  await expect(page.getByLabel("Telefono")).toHaveValue(account.profile.phone);
  await expect(page.getByLabel("Direccion")).toHaveValue(account.profile.address);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guardar cuenta" })).toHaveCount(0);
  await page.getByLabel("Nombre", { exact: true }).fill(profile.name);
  await page.getByLabel("Telefono").fill(profile.phone);
  await page.getByLabel("Direccion").fill(profile.address);
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByRole("status")).toHaveText("Perfil actualizado.");
  expect(saved).toBe(true);
});

test("cada llamada de perfil lee el token actual de localStorage", async ({ page }) => {
  await authenticatePage(page);
  await page.goto("/account/profile");
  await expect(page.getByRole("button", { name: "Guardar perfil" })).toBeVisible();
  const renewedToken = `${token}-renewed`;
  await page.evaluate((value) => localStorage.setItem("nexova.access_token", value), renewedToken);
  const calls: string[] = [];
  await page.route("**/api/backend/auth/me", (route) => {
    calls.push("me");
    expect(route.request().headers().authorization).toBe(`Bearer ${renewedToken}`);
    return route.fulfill({ json: account });
  });
  await page.route("**/api/backend/profiles/me", (route) => {
    calls.push("profile");
    expect(route.request().headers().authorization).toBe(`Bearer ${renewedToken}`);
    return route.fulfill({ json: account.profile });
  });
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByRole("status")).toHaveText("Perfil actualizado.");
  expect(calls).toEqual(["profile", "me"]);
});

test("un 401 al guardar perfil elimina el token y redirige al login", async ({ page }) => {
  await authenticatePage(page);
  await page.goto("/account/profile");
  await expect(page.getByRole("button", { name: "Guardar perfil" })).toBeVisible();
  await page.route("**/api/backend/profiles/me", (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    return route.fulfill({ status: 401, json: { detail: "Expired token" } });
  });
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem("nexova.access_token"))).toBeNull();
  await expect(page.getByRole("heading", { name: "Iniciar sesion" })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("las llamadas operativas leen el token vigente y limpian la sesion ante 401", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Iniciar sesion" })).toBeVisible();
  await page.route("**/api/backend/auth/me", (route) => route.fulfill({ json: account }));
  await page.evaluate((value) => localStorage.setItem("nexova.access_token", value), token);
  await page.goto("/");
  await expect(page.locator("iframe")).toBeVisible();
  const renewedToken = `${token}-renewed`;
  await page.evaluate((value) => localStorage.setItem("nexova.access_token", value), renewedToken);
  await page.route("**/api/backend/suppliers", (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${renewedToken}`);
    return route.fulfill({ status: 401, json: { detail: "Expired token" } });
  });
  const frame = await page.locator("iframe").contentFrame();
  await frame.locator("body").evaluate(() => { void fetch("/suppliers"); });
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem("nexova.access_token"))).toBeNull();
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("errores de login y JWT expirado no permiten vistas internas", async ({ page }) => {
  await page.route("**/api/backend/auth/login", (route) => route.fulfill({ status: 401, json: { detail: "Invalid email or password" } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Contraseña").fill("incorrect");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator(".auth-error")).toContainText("Email o contraseña incorrectos.");
  expect(await page.evaluate(() => localStorage.getItem("nexova.access_token"))).toBeNull();
  await page.evaluate((value) => localStorage.setItem("nexova.access_token", value), token);
  await page.route("**/api/backend/auth/me", (route) => route.fulfill({ status: 401, json: { detail: "Expired token" } }));
  await page.goto("/account/profile");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("nexova.access_token"))).toBeNull();
});

test("errores 422 del registro se muestran sin crear sesion", async ({ page }) => {
  let loginCalled = false;
  await page.route("**/api/backend/auth/login", (route) => {
    loginCalled = true;
    return route.fulfill({ status: 500 });
  });
  await page.route("**/api/backend/users", (route) => route.fulfill({ status: 422, json: { detail: [
    { loc: ["body", "password"], msg: "Password rejected" },
    { loc: ["body", "phone"], msg: "Phone rejected" },
  ] } }));
  await page.goto("/register");
  await page.locator("#auth-name").fill("Miembro");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Contraseña", { exact: true }).fill("secure-password");
  await page.getByRole("button", { name: "Registrarme" }).click();
  await expect(page.locator("#auth-password-error")).toHaveText("Password rejected");
  await expect(page.locator("#auth-phone-error")).toHaveText("Phone rejected");
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#auth-phone")).toHaveAttribute("aria-describedby", "auth-phone-error");
  expect(loginCalled).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("nexova.access_token"))).toBeNull();
});

test("registro informa del codigo HTTP si el servidor responde sin JSON", async ({ page }) => {
  await page.route("**/api/backend/users", (route) => route.fulfill({
    status: 500, contentType: "text/plain", body: "Internal Server Error",
  }));
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Contraseña", { exact: true }).fill("secure-password");
  await page.getByRole("button", { name: "Registrarme" }).click();
  await expect(page.locator(".auth-error")).toContainText("/users (HTTP 500)");
  expect(await page.evaluate(() => localStorage.getItem("nexova.access_token"))).toBeNull();
});

test("login sin access_token no guarda una sesion invalida", async ({ page }) => {
  await page.route("**/api/backend/auth/login", (route) => route.fulfill({ json: {} }));
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Contraseña", { exact: true }).fill("secure-password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator(".auth-error")).toContainText("no devolvio un token valido");
  expect(await page.evaluate(() => localStorage.getItem("nexova.access_token"))).toBeNull();
});

test("registro sin perfil opcional inicia sesion con las mismas credenciales", async ({ page }) => {
  const credentials = { email: account.email, password: "secure-password" };
  const sequence: string[] = [];
  await page.route("**/api/backend/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/users")) {
      sequence.push("register");
      expect(request.postDataJSON()).toEqual(credentials);
      return route.fulfill({ status: 201, json: { id: "user-1" } });
    }
    if (path.endsWith("/auth/login")) {
      sequence.push("login");
      expect(request.postDataJSON()).toEqual(credentials);
      return route.fulfill({ json: { access_token: token } });
    }
    return route.fulfill({ json: path.endsWith("/auth/me") ? account : [] });
  });
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Registrarme" }).click();
  await expect(page.locator("iframe")).toBeVisible();
  expect(sequence).toEqual(["register", "login"]);
  expect(await page.evaluate(() => localStorage.getItem("nexova.access_token"))).toBe(token);
});

test("directorio protegido envia Bearer al filtrar y editar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "backoffice");
  await authenticatePage(page);
  const supplier = {
    id: 1, name: "Proveedor test", country: "España", product_categories: ["corporate_training"],
    rate: "125.00", status: "active", updated_at: "2026-10-10T12:00:00Z",
  };
  const calls: string[] = [];
  await page.route("**/api/backend/suppliers**", (route) => {
    const request = route.request();
    expect(request.headers().authorization).toBe(`Bearer ${token}`);
    calls.push(request.url());
    if (request.method() === "PATCH") {
      Object.assign(supplier, request.postDataJSON());
      return route.fulfill({ json: supplier });
    }
    return route.fulfill({ json: [supplier] });
  });
  await page.goto("/");
  const view = page.frameLocator("iframe");
  await view.getByRole("link", { name: "Proveedores" }).click();
  await expect(view.locator("#supplier-rows tr")).toHaveCount(1);
  await view.locator("#supplier-country-filter").selectOption("España");
  await expect.poll(() => calls.some((url) => url.includes("country="))).toBe(true);
  await view.locator(".rate-editor input").fill("150.25");
  await view.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(view.locator(".rate-editor input")).toHaveValue("150.25");
  await view.getByRole("button", { name: "Suspender a Proveedor test" }).click();
  await expect(view.locator(".status-badge")).toHaveText("Suspendido");
});

for (const width of [1440, 390]) {
  test(`login accesible ${width}px sin errores de navegador`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesion" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/${testInfo.project.name}-login-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}