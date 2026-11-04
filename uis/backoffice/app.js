function resolveApiBaseUrl() {
  if (window.location.pathname.startsWith("/backoffice/")) return window.location.origin;
  const { hostname, protocol } = window.location;
  const forwardedHost = hostname.replace(/-5173(?=\.)/, "-8000");
  if (forwardedHost !== hostname) return `${protocol}//${forwardedHost}`;
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://127.0.0.1:8000";
  }
  return `${protocol}//${hostname}:8000`;
}

const API_BASE_URL = resolveApiBaseUrl();
const API_URL = `${API_BASE_URL}/api/incidents/analyze`;
const EXPORT_URL = `${API_BASE_URL}/api/incidents/results/export`;

const dropZone = document.querySelector("#drop-zone");
const fileInput = document.querySelector("#file-input");
const browseButton = document.querySelector("#browse-button");
const analyzeButton = document.querySelector("#analyze-button");
const selectedFile = document.querySelector("#selected-file");
const dropTitle = document.querySelector("#drop-title");
const fileMeta = document.querySelector("#file-meta");
const errorBanner = document.querySelector("#error-banner");
const metricGrid = document.querySelector("#metric-grid");
const detailGrid = document.querySelector("#detail-grid");
const resultState = document.querySelector("#result-state");
const downloadButton = document.querySelector("#download-button");
let selectedCsv = null;

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

function escapeHtml(str) {
  if (str == null) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function clearError() {
  errorBanner.hidden = true;
  errorBanner.textContent = "";
}

function selectFile(file) {
  clearError();
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".csv")) {
    showError("Selecciona un fichero con extensión .csv.");
    return;
  }
  selectedCsv = file;
  selectedFile.textContent = `${file.name} · ${formatBytes(file.size)}`;
  dropTitle.textContent = "Fichero listo para analizar";
  fileMeta.textContent = "Revisa el nombre y lanza el análisis cuando quieras.";
  analyzeButton.disabled = false;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function metricCard(label, value, note, muted = false) {
  return `<article class="metric-card${muted ? " muted" : ""}"><span>${label}</span><strong>${value ?? "—"}</strong><small>${note}</small></article>`;
}

function listRows(values) {
  const entries = Object.entries(values || {});
  if (!entries.length) return "<div class=\"empty-state\">No hay registros válidos</div>";
  const max = Math.max(...entries.map(([, value]) => value), 1);
  return entries.map(([label, count]) => `<div class="bar-row"><span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div><span class="bar-count">${count}</span></div>`).join("");
}

function issueRows(issues) {
  const entries = Object.entries(issues || {});
  if (!entries.length) return "<div class=\"empty-state valid-state\">No hay registros inválidos</div>";
  return entries.map(([issue, detail]) => `<div class="issue-row"><span>${issue}</span><strong>${detail.count}</strong><small>fila(s): ${detail.rows.join(", ")}</small></div>`).join("");
}

function renderResults(summary) {
  const satisfaction = summary.average_satisfaction_closed === null ? "—" : Number(summary.average_satisfaction_closed).toFixed(2);
  metricGrid.innerHTML = [
    metricCard("Total procesados", summary.total_processed, "todos los registros"),
    metricCard("Registros válidos", summary.valid_records, "listos para métricas"),
    metricCard("Registros inválidos", summary.invalid_records, `${Object.keys(summary.validation_issues || {}).length} tipo(s) de problema`),
    metricCard("Satisfacción media", satisfaction, `${summary.satisfaction_scored_closed_cases} caso(s) cerrado(s) puntuado(s)`),
  ].join("");
  detailGrid.innerHTML = `<article class="detail-card"><div class="card-title"><span>Por categoría</span><span class="card-label">VALIDADOS</span></div>${listRows(summary.by_category)}</article><article class="detail-card"><div class="card-title"><span>Por estado</span><span class="card-label">VALIDADOS</span></div>${listRows(summary.by_status)}</article><article class="detail-card issues-card"><div class="card-title"><span>Registros inválidos</span><span class="card-label warning-label">REVISIÓN</span></div>${issueRows(summary.validation_issues)}</article>`;
  resultState.textContent = `${summary.total_processed} registros analizados`;
  resultState.style.color = "var(--teal)";
  resultState.style.background = "var(--mint)";
  downloadButton.disabled = false;
}

async function downloadResults() {
  clearError();
  downloadButton.disabled = true;
  downloadButton.innerHTML = "<span aria-hidden=\"true\">↻</span> Preparando...";
  try {
    const response = await fetch(EXPORT_URL);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || "No hay resultados disponibles para descargar.");
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "results.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    showError(error.message || "No se pudo descargar el CSV.");
  } finally {
    downloadButton.disabled = false;
    downloadButton.innerHTML = "<span aria-hidden=\"true\">↓</span> Descargar CSV";
  }
}

async function analyzeFile() {
  if (!selectedCsv) return;
  clearError();
  analyzeButton.disabled = true;
  analyzeButton.innerHTML = "<span class=\"button-arrow\">↻</span>Analizando...";
  resultState.textContent = "Procesando fichero";
  try {
    const formData = new FormData();
    formData.append("file", selectedCsv);
    const response = await fetch(API_URL, { method: "POST", body: formData });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "La API no pudo procesar el fichero.");
    renderResults(payload);
    document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    resultState.textContent = "Análisis fallido";
    showError(error.message || "No se pudo conectar con la API.");
  } finally {
    analyzeButton.disabled = !selectedCsv;
    analyzeButton.innerHTML = "<span class=\"button-arrow\">↗</span>Analizar fichero";
  }
}

browseButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (event) => selectFile(event.target.files[0]));
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
});
["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add("dragging"); }));
["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove("dragging"); }));
dropZone.addEventListener("drop", (event) => selectFile(event.dataTransfer.files[0]));
analyzeButton.addEventListener("click", analyzeFile);
downloadButton.addEventListener("click", downloadResults);

(() => {
  const suppliersUrl = `${API_BASE_URL}/suppliers`;
  const analysisView = document.querySelector("#analysis-view");
  const suppliersView = document.querySelector("#suppliers-view");
  const breadcrumb = document.querySelector("#page-breadcrumb");
  const supplierCount = document.querySelector("#supplier-count");
  const supplierRows = document.querySelector("#supplier-rows");
  const supplierTableWrap = document.querySelector("#supplier-table-wrap");
  const supplierStatus = document.querySelector("#supplier-status");
  const supplierError = document.querySelector("#supplier-error");
  const refreshSuppliersButton = document.querySelector("#refresh-suppliers");
  const countryFilter = document.querySelector("#supplier-country-filter");
  const categoryFilter = document.querySelector("#supplier-category-filter");
  const createSupplierForm = document.querySelector("#supplier-create-form");
  const createSupplierButton = document.querySelector("#create-supplier-button");
  const supplierFormError = document.querySelector("#supplier-form-error");
  const supplierFormSuccess = document.querySelector("#supplier-form-success");

  const incidentFormView = document.querySelector("#incident-form-view");
  const incidentForm = document.querySelector("#incident-form");
  const incidentTitle = document.querySelector("#incident-title");
  const incidentDescription = document.querySelector("#incident-description");
  const incidentCategory = document.querySelector("#incident-category");
  const incidentOrigin = document.querySelector("#incident-origin");
  const incidentBranch = document.querySelector("#incident-branch");
  const incidentBranchContainer = document.querySelector("#incident-branch-container");
  const incidentBranchHint = document.querySelector("#branch-hint");
  const incidentCreateButton = document.querySelector("#create-incident-button");
  const incidentBtnArrow = document.querySelector("#incident-btn-arrow");
  const incidentBtnText = document.querySelector("#incident-btn-text");
  const incidentFormError = document.querySelector("#incident-form-error");
  const incidentSuccess = document.querySelector("#incident-success");
  const incidentSuccessMsg = document.querySelector("#incident-success-msg");
  const incidentTitleError = document.querySelector("#incident-title-error");
  const incidentDescriptionError = document.querySelector("#incident-description-error");
  const incidentBranchError = document.querySelector("#incident-branch-error");
  const incidentCategoryError = document.querySelector("#incident-category-error");
  const incidentOriginError = document.querySelector("#incident-origin-error");

  const incidentListView = document.querySelector("#incident-list-view");
  const incidentCount = document.querySelector("#incident-count");
  const incidentRefreshButton = document.querySelector("#refresh-incidents");
  const incidentListError = document.querySelector("#incident-list-error");
  const incidentFilterStatus = document.querySelector("#incident-filter-status");
  const incidentFilterOrigin = document.querySelector("#incident-filter-origin");
  const incidentFilterBranch = document.querySelector("#incident-filter-branch");
  const incidentLoading = document.querySelector("#incident-loading");
  const incidentEmpty = document.querySelector("#incident-empty");
  const incidentEmptyMsg = document.querySelector("#incident-empty-msg");
  const incidentTableWrap = document.querySelector("#incident-table-wrap");
  const incidentRows = document.querySelector("#incident-rows");

  const summaryView = document.querySelector("#summary-view");

  const routeLinks = [...document.querySelectorAll('.nav-item[href="#summary"], .nav-item[href="#analysis"], .nav-item[href="#suppliers"], .nav-item[href="#incident-form"], .nav-item[href="#incident-list"]')];
  const categoryLabels = {
    executive_search: "Headhunting ejecutivo",
    customer_service_outsourcing: "Outsourcing de atención al cliente",
    corporate_training: "Formación corporativa",
  };
  const categoryFormLabels = {
    executive_search: "Headhunting ejecutivo",
    customer_service_outsourcing: "Outsourcing de atención al cliente",
    corporate_training: "Formación corporativa",
  };
  let suppliers = [];
  let suppliersLoaded = false;
  let loadController = null;

  function apiErrorMessage(payload, fallback) {
    const detail = payload?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((issue) => {
        const field = Array.isArray(issue.loc)
          ? issue.loc.filter((part) => part !== "body").join(".")
          : "";
        return `${field ? `${field}: ` : ""}${issue.msg || "Entrada no válida"}`;
      }).join("; ");
    }
    return fallback;
  }

  function clearSupplierError() {
    supplierError.hidden = true;
    supplierError.textContent = "";
  }

  function showSupplierError(message) {
    supplierError.textContent = message;
    supplierError.hidden = false;
  }

  function replaceSupplier(updatedSupplier) {
    const index = suppliers.findIndex((supplier) => supplier.id === updatedSupplier.id);
    if (index === -1) return;
    suppliers[index] = updatedSupplier;
    supplierRows.replaceChildren(...suppliers.map(renderSupplier));
  }

  function createCell(row, value, className = "") {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = value;
    row.append(cell);
    return cell;
  }

  function renderSupplier(supplier) {
    const row = document.createElement("tr");
    createCell(row, supplier.name, "supplier-name");
    createCell(row, supplier.country);

    const categoryCell = document.createElement("td");
    const categoryList = document.createElement("ul");
    categoryList.className = "category-list";
    supplier.product_categories.forEach((category) => {
      const item = document.createElement("li");
      item.textContent = categoryLabels[category] || category;
      categoryList.append(item);
    });
    categoryCell.append(categoryList);
    row.append(categoryCell);

    const rateCell = document.createElement("td");
    rateCell.className = "supplier-rate";
    const rateEditor = document.createElement("form");
    rateEditor.className = "rate-editor";
    rateEditor.dataset.supplierId = supplier.id;
    const rateLabel = document.createElement("label");
    const rateDescription = document.createElement("span");
    rateDescription.className = "visually-hidden";
    rateDescription.textContent = `Tarifa por hora en USD para ${supplier.name}`;
    rateLabel.append(rateDescription);
    const rateInput = document.createElement("input");
    rateInput.type = "number";
    rateInput.name = "rate";
    rateInput.min = "0.01";
    rateInput.step = "0.01";
    rateInput.required = true;
    rateInput.inputMode = "decimal";
    rateInput.value = String(supplier.rate);
    rateLabel.append(rateInput);
    const saveRateButton = document.createElement("button");
    saveRateButton.type = "submit";
    saveRateButton.className = "row-action rate-save";
    saveRateButton.textContent = "Guardar";
    rateEditor.append(rateLabel, saveRateButton);
    rateCell.append(rateEditor);
    row.append(rateCell);

    const statusCell = document.createElement("td");
    const statusBadge = document.createElement("span");
    statusBadge.className = `status-badge ${supplier.status === "active" ? "is-active" : "is-suspended"}`;
    statusBadge.textContent = supplier.status === "active" ? "Activo" : "Suspendido";
    statusCell.append(statusBadge);
    row.append(statusCell);

    const actionCell = document.createElement("td");
    const statusButton = document.createElement("button");
    statusButton.type = "button";
    statusButton.className = "row-action status-action";
    statusButton.dataset.action = "status";
    statusButton.dataset.supplierId = supplier.id;
    statusButton.dataset.status = supplier.status === "active" ? "suspended" : "active";
    statusButton.textContent = supplier.status === "active" ? "Suspender" : "Activar";
    statusButton.setAttribute("aria-label", `${statusButton.textContent} a ${supplier.name}`);
    actionCell.append(statusButton);
    row.append(actionCell);
    return row;
  }

  async function loadSuppliers() {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    clearSupplierError();
    refreshSuppliersButton.disabled = true;
    refreshSuppliersButton.setAttribute("aria-busy", "true");
    if (!suppliersLoaded) {
      supplierStatus.textContent = "Cargando proveedores…";
      supplierStatus.hidden = false;
    }

    try {
      const params = new URLSearchParams();
      if (countryFilter.value) params.set("country", countryFilter.value);
      if (categoryFilter.value) params.set("category", categoryFilter.value);
      const query = params.size ? `?${params}` : "";
      const response = await fetch(`${suppliersUrl}${query}`, { signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, "No se pudo cargar el directorio."));
      }

      suppliers = payload;
      supplierRows.replaceChildren(...suppliers.map(renderSupplier));
      suppliersLoaded = true;
      supplierCount.textContent = `${suppliers.length} ${suppliers.length === 1 ? "proveedor" : "proveedores"}`;
      supplierTableWrap.hidden = suppliers.length === 0;
      supplierStatus.textContent = "No hay proveedores con estos filtros.";
      supplierStatus.hidden = suppliers.length > 0;
    } catch (error) {
      if (error.name === "AbortError") return;
      supplierStatus.hidden = true;
      showSupplierError(error.message?.toLowerCase().includes("fetch")
        ? "No se pudo conectar con la API. Comprueba que FastAPI esté activo y que el puerto 8000 esté disponible."
        : error.message || "No se pudo conectar con la API.");
    } finally {
      if (loadController === controller) {
        loadController = null;
        refreshSuppliersButton.disabled = false;
        refreshSuppliersButton.removeAttribute("aria-busy");
      }
    }
  }

  async function createSupplier(event) {
    event.preventDefault();
    supplierFormError.hidden = true;
    supplierFormSuccess.hidden = true;
    const formData = new FormData(createSupplierForm);
    const productCategories = formData.getAll("product_categories");
    if (productCategories.length === 0) {
      supplierFormError.textContent = "Selecciona al menos una categoría de servicio.";
      supplierFormError.hidden = false;
      return;
    }

    const payload = {
      name: formData.get("name"),
      country: formData.get("country"),
      product_categories: productCategories,
      rate: formData.get("rate"),
      status: formData.get("status"),
    };
    createSupplierButton.disabled = true;
    createSupplierButton.textContent = "Registrando…";
    try {
      const response = await fetch(suppliersUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(apiErrorMessage(result, "La API rechazó los datos del proveedor."));
      }

      createSupplierForm.reset();
      await loadSuppliers();
      supplierFormSuccess.textContent = `Proveedor «${result.name}» registrado correctamente.`;
      supplierFormSuccess.hidden = false;
    } catch (error) {
      supplierFormError.textContent = error.message?.toLowerCase().includes("fetch")
        ? "No se pudo conectar con la API. Comprueba que FastAPI esté activo e inténtalo de nuevo."
        : error.message || "No se pudo registrar el proveedor.";
      supplierFormError.hidden = false;
    } finally {
      createSupplierButton.disabled = false;
      createSupplierButton.textContent = "Registrar proveedor";
    }
  }

  async function updateSupplierRate(form) {
    const supplierId = form.dataset.supplierId;
    const input = form.elements.rate;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    clearSupplierError();
    try {
      const response = await fetch(`${suppliersUrl}/${supplierId}/rate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: input.value }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(apiErrorMessage(result, "No se pudo actualizar la tarifa."));
      }
      replaceSupplier(result);
    } catch (error) {
      showSupplierError(error.message || "No se pudo actualizar la tarifa.");
    } finally {
      button.disabled = false;
    }
  }

  async function updateSupplierStatus(button) {
    const supplierId = button.dataset.supplierId;
    const nextStatus = button.dataset.status;
    button.disabled = true;
    clearSupplierError();
    try {
      const response = await fetch(`${suppliersUrl}/${supplierId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(apiErrorMessage(result, "No se pudo cambiar el estado."));
      }
      replaceSupplier(result);
    } catch (error) {
      showSupplierError(error.message || "No se pudo cambiar el estado.");
      button.disabled = false;
    }
  }

  /* ───── Registro de incidencias ───── */

  const INCIDENTS_API_URL = `${API_BASE_URL}/api/incidents`;

  function hideIncidentError() {
    incidentFormError.hidden = true;
    incidentFormError.textContent = "";
  }

  function showIncidentFieldError(element, message) {
    element.textContent = message;
    element.hidden = false;
  }

  function clearIncidentFieldErrors() {
    [incidentTitleError, incidentDescriptionError, incidentCategoryError, incidentOriginError, incidentBranchError].forEach((el) => { el.hidden = true; el.textContent = ""; });
  }

  function showIncidentApiErrors(payload) {
    const errors = Array.isArray(payload?.errors) ? payload.errors : Array.isArray(payload?.detail) ? payload.detail : [];
    const fields = {
      title: [incidentTitleError, "Revisa el título de la incidencia."],
      description: [incidentDescriptionError, "Completa la descripción de la incidencia."],
      category: [incidentCategoryError, "Selecciona una categoría válida."],
      origin: [incidentOriginError, "Selecciona un origen válido."],
      branch: [incidentBranchError, "Selecciona una sede válida."],
    };
    let found = false;
    errors.forEach((issue) => {
      const field = String(issue.field || issue.loc?.at(-1) || "").split(".").at(-1);
      const message = fields[field];
      if (!message) return;
      showIncidentFieldError(message[0], message[1]);
      found = true;
    });
    return found;
  }

  function hideIncidentSuccess() {
    incidentSuccess.hidden = true;
  }

  function showIncidentSuccess(message) {
    incidentSuccessMsg.textContent = message;
    incidentSuccess.hidden = false;
    incidentSuccess.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function highlightBranchField(highlight) {
    incidentBranchContainer.classList.toggle("highlight", highlight);
    incidentBranchHint.textContent = highlight
      ? "Informando desde una sucursal — indica la sede afectada"
      : "Selecciona la sede afectada";
  }

  function toggleIncidentLoading(loading) {
    incidentCreateButton.disabled = loading;
    incidentBtnArrow.textContent = loading ? "↻" : "↗";
    incidentBtnText.textContent = loading ? "Registrando…" : "Registrar incidencia";
    incidentForm.querySelectorAll("input, select, textarea").forEach((el) => el.toggleAttribute("disabled", loading));
  }

  async function submitIncident(event) {
    event.preventDefault();
    hideIncidentError();
    hideIncidentSuccess();
    clearIncidentFieldErrors();

    const title = incidentTitle.value.trim();
    const description = incidentDescription.value.trim();
    const category = incidentCategory.value;
    const origin = incidentOrigin.value;
    const branch = incidentBranch.value;

    let hasFieldError = false;

    if (!title) {
      showIncidentFieldError(incidentTitleError, "El título es obligatorio.");
      hasFieldError = true;
    } else if (title.length > 120) {
      showIncidentFieldError(incidentTitleError, "El título no puede superar los 120 caracteres.");
      hasFieldError = true;
    }
    if (!description) {
      showIncidentFieldError(incidentDescriptionError, "La descripción es obligatoria.");
      hasFieldError = true;
    }
    if (!category) {
      showIncidentFieldError(incidentCategoryError, "Selecciona una categoría.");
      hasFieldError = true;
    }
    if (!origin) {
      showIncidentFieldError(incidentOriginError, "Selecciona un origen.");
      hasFieldError = true;
    }
    if (!branch) {
      showIncidentFieldError(incidentBranchError, "Selecciona una sede.");
      hasFieldError = true;
    }

    if (hasFieldError) return;

    toggleIncidentLoading(true);

    try {
      const response = await fetch(INCIDENTS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, category, origin, branch }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        showIncidentApiErrors(payload);
        throw new Error("No se pudo registrar la incidencia. Revisa los campos indicados e inténtalo de nuevo.");
      }

      incidentForm.reset();
      incidentCategory.value = "other";
      highlightBranchField(incidentOrigin.value === "branch");
      showIncidentSuccess(`Incidencia «${payload.title}» registrada correctamente.`);
    } catch (error) {
      incidentFormError.textContent = !navigator.onLine || /failed to fetch|networkerror|load failed/i.test(error.message || "")
        ? "No se pudo conectar con el servicio. Comprueba tu conexión e inténtalo de nuevo."
        : error.message || "No se pudo registrar la incidencia. Comprueba los datos e inténtalo de nuevo.";
      incidentFormError.hidden = false;
    } finally {
      toggleIncidentLoading(false);
    }
  }

  /* ───── Event listeners ───── */

  incidentOrigin.addEventListener("change", () => {
    const isBranch = incidentOrigin.value === "branch";
    highlightBranchField(isBranch);
    if (isBranch) incidentBranchContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  incidentTitle.addEventListener("input", () => { incidentTitleError.hidden = true; hideIncidentError(); hideIncidentSuccess(); });
  incidentDescription.addEventListener("input", () => { incidentDescriptionError.hidden = true; hideIncidentError(); hideIncidentSuccess(); });
  incidentBranch.addEventListener("change", () => { incidentBranchError.hidden = true; hideIncidentError(); hideIncidentSuccess(); });
  incidentCategory.addEventListener("change", () => { hideIncidentError(); hideIncidentSuccess(); });
  incidentOrigin.addEventListener("change", () => { hideIncidentError(); hideIncidentSuccess(); });

  incidentForm.addEventListener("submit", submitIncident);

  function syncDirectoryRoute() {
    const hash = window.parent.location.hash;

    const isSummary = hash === "#summary" || hash === "#overview";
    const isAnalysis = hash === "#analysis" || (!hash || hash === "#requests" || hash === "#team" || hash === "#settings");
    const isSuppliers = hash === "#suppliers";
    const isIncidentForm = hash === "#incident-form";
    const isIncidentList = hash === "#incident-list";

    summaryView.hidden = !isSummary;
    analysisView.hidden = !isAnalysis;
    suppliersView.hidden = !isSuppliers;
    incidentFormView.hidden = !isIncidentForm;
    incidentListView.hidden = !isIncidentList;

    if (isSummary) breadcrumb.textContent = "Panel de resumen";
    else if (isAnalysis) breadcrumb.textContent = "Análisis de incidencias";
    else if (isSuppliers) breadcrumb.textContent = "Directorio de proveedores";
    else if (isIncidentForm) breadcrumb.textContent = "Registro de incidencias";
    else if (isIncidentList) breadcrumb.textContent = "Panel de incidencias";

    document.title = isSummary ? "Pulse Desk | Panel de resumen" : isSuppliers ? "Pulse Desk | Proveedores" : isIncidentForm ? "Pulse Desk | Incidencias" : isIncidentList ? "Pulse Desk | Panel de incidencias" : "Pulse Desk | Análisis de incidencias";
    routeLinks.forEach((link) => {
      const active = isSummary ? link.hash === "#summary" : link.hash === hash;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    if (isSummary) loadSummary();
    if (isSuppliers && !suppliersLoaded) loadSuppliers();
    if (isIncidentList) {
      loadIncidentBranchOptions();
      loadIncidents();
    }
  }

  refreshSuppliersButton.addEventListener("click", loadSuppliers);
  countryFilter.addEventListener("change", loadSuppliers);
  categoryFilter.addEventListener("change", loadSuppliers);
  createSupplierForm.addEventListener("submit", createSupplier);
  supplierRows.addEventListener("submit", (event) => {
    const rateForm = event.target.closest(".rate-editor");
    if (!rateForm) return;
    event.preventDefault();
    updateSupplierRate(rateForm);
  });
  supplierRows.addEventListener("click", (event) => {
    const statusButton = event.target.closest('button[data-action="status"]');
    if (statusButton) updateSupplierStatus(statusButton);
  });
  window.addEventListener("hashchange", syncDirectoryRoute);
  highlightBranchField(incidentOrigin.value === "branch");

  /* ───── Panel de incidencias: listado con filtros ───── */

  const INCIDENT_STATUS_LABELS = { open: "Abierta", in_progress: "En curso", resolved: "Resuelta", discarded: "Descartada" };
  const INCIDENT_CATEGORY_LABELS = { technical_failure: "Fallo técnico", process_error: "Error de proceso", client_complaint: "Queja de cliente", candidate_issue: "Problema de candidato", staff_issue: "Incidencia de personal", sla_breach: "Incumplimiento de SLA", data_quality: "Calidad de datos", other: "Otra incidencia" };
  const INCIDENT_ORIGIN_LABELS = { internal: "Interno", customer: "Cliente", branch: "Sucursal" };
  const INCIDENT_BRANCH_LABELS = { central: "Central — Sede Valencia", valencia_operations: "Valencia — Operaciones", miami_office: "Miami Office", remote: "Remoto (empleado sin sede fija)" };
  const INCIDENT_FALLBACK_BRANCHES = Object.keys(INCIDENT_BRANCH_LABELS);
  // Las transiciones replican la máquina de estados del backend para no ofrecer
  // acciones que la API vaya a rechazar.
  const INCIDENT_TRANSITIONS = {
    open: [
      { status: "in_progress", label: "Iniciar", className: "action-in-progress" },
      { status: "discarded", label: "Descartar", className: "action-discard" },
    ],
    in_progress: [
      { status: "resolved", label: "Resolver", className: "action-resolve" },
      { status: "discarded", label: "Descartar", className: "action-discard" },
    ],
  };

  const incidentPanel = incidentListView.querySelector("#incident-list-panel");
  const incidentListErrorMsg = incidentListError.querySelector("#incident-list-error-msg");
  const incidentRetryButton = incidentListError.querySelector("#incident-retry-btn");
  const incidentEmptyTitle = incidentEmpty.querySelector("#incident-empty-title");
  const incidentEmptyClear = incidentEmpty.querySelector("#incident-empty-clear");
  const incidentClearFilters = incidentListView.querySelector("#incident-clear-filters");
  const incidentNoticeSuccess = incidentListView.querySelector("#incident-notice-success");
  const incidentNoticeError = incidentListView.querySelector("#incident-notice-error");

  const incidentListState = {
    items: [],
    pendingIds: new Set(),
    controller: null,
    requestId: 0,
    total: null,
    branches: null,
    noticeTimer: null,
  };

  function statusLabel(status) {
    return INCIDENT_STATUS_LABELS[status] || status || "—";
  }

  function branchLabel(branch) {
    return INCIDENT_BRANCH_LABELS[branch] || branch;
  }

  function readIncidentFilters() {
    return {
      status: incidentFilterStatus.value,
      origin: incidentFilterOrigin.value,
      branch: incidentFilterBranch.value,
    };
  }

  function hasActiveIncidentFilters(filters = readIncidentFilters()) {
    return Boolean(filters.status || filters.origin || filters.branch);
  }

  function describeIncidentFilters(filters) {
    const parts = [];
    if (filters.status) parts.push(`estado «${statusLabel(filters.status)}»`);
    if (filters.origin) parts.push(`origen «${INCIDENT_ORIGIN_LABELS[filters.origin] || filters.origin}»`);
    if (filters.branch) parts.push(`sede «${branchLabel(filters.branch)}»`);
    return parts;
  }

  function incidentMatchesFilters(incident, filters) {
    if (filters.status && incident.status !== filters.status) return false;
    if (filters.origin && incident.origin !== filters.origin) return false;
    if (filters.branch && incident.branch !== filters.branch) return false;
    return true;
  }

  function formatIncidentDate(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function setIncidentPanelState(state) {
    incidentPanel.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    incidentLoading.hidden = state !== "loading";
    incidentListError.hidden = state !== "error";
    incidentEmpty.hidden = state !== "empty";
    incidentTableWrap.hidden = state !== "table";
  }

  function showIncidentNotice(kind, message) {
    const target = kind === "error" ? incidentNoticeError : incidentNoticeSuccess;
    const other = kind === "error" ? incidentNoticeSuccess : incidentNoticeError;
    other.hidden = true;
    other.textContent = "";
    target.textContent = message;
    target.hidden = false;
    clearTimeout(incidentListState.noticeTimer);
    incidentListState.noticeTimer = setTimeout(() => {
      target.hidden = true;
      target.textContent = "";
    }, kind === "error" ? 8000 : 5000);
  }

  function clearIncidentNotices() {
    clearTimeout(incidentListState.noticeTimer);
    [incidentNoticeSuccess, incidentNoticeError].forEach((element) => {
      element.hidden = true;
      element.textContent = "";
    });
  }

  function updateIncidentCount() {
    const visible = incidentListState.items.length;
    const total = incidentListState.total;
    const filtered = hasActiveIncidentFilters();
    const showsTotal = filtered && typeof total === "number" && total > visible;
    incidentCount.textContent = showsTotal ? `${visible} de ${total}` : String(visible);
    incidentCount.title = showsTotal
      ? `${visible} incidencias visibles de ${total} registradas`
      : `${visible} incidencias visibles`;
  }

  function createIncidentRow(incident, options = {}) {
    const pending = Boolean(options.pending);
    const row = document.createElement("tr");
    row.dataset.incidentRow = incident.id;
    row.className = pending ? "is-pending" : "";
    row.setAttribute("aria-busy", pending ? "true" : "false");

    const titleCell = document.createElement("td");
    titleCell.className = "incident-cell-title";
    const title = document.createElement("strong");
    title.textContent = incident.title;
    const description = document.createElement("span");
    description.className = "incident-date";
    description.textContent = incident.description || "";
    description.title = incident.description || "";
    titleCell.append(title, description);

    const categoryCell = document.createElement("td");
    categoryCell.textContent = INCIDENT_CATEGORY_LABELS[incident.category] || incident.category || "—";

    const originCell = document.createElement("td");
    originCell.textContent = INCIDENT_ORIGIN_LABELS[incident.origin] || incident.origin || "—";

    const branchCell = document.createElement("td");
    branchCell.textContent = incident.branch ? branchLabel(incident.branch) : "—";

    const statusCell = document.createElement("td");
    statusCell.className = "incident-cell-status";
    const badge = document.createElement("span");
    badge.className = `status-badge status-${incident.status}`;
    badge.textContent = statusLabel(incident.status);
    statusCell.append(badge);
    if (pending) {
      const saving = document.createElement("span");
      saving.className = "incident-pending";
      saving.textContent = "Guardando…";
      statusCell.append(saving);
    } else {
      const transitions = INCIDENT_TRANSITIONS[incident.status] || [];
      if (transitions.length === 0) {
        const final = document.createElement("span");
        final.className = "status-final";
        final.textContent = "Estado final";
        statusCell.append(final);
      } else {
        const actions = document.createElement("div");
        actions.className = "incident-cell-actions";
        transitions.forEach((transition) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `action-btn ${transition.className}`;
          button.dataset.incidentId = incident.id;
          button.dataset.nextStatus = transition.status;
          button.textContent = transition.label;
          button.setAttribute(
            "aria-label",
            `${transition.label}: pasar «${incident.title}» a ${statusLabel(transition.status)}`,
          );
          actions.append(button);
        });
        statusCell.append(actions);
      }
    }

    const updatedCell = document.createElement("td");
    updatedCell.className = "incident-updated";
    updatedCell.textContent = formatIncidentDate(incident.updated_at || incident.created_at);

    row.append(titleCell, categoryCell, originCell, branchCell, statusCell, updatedCell);
    return row;
  }

  function findIncidentRow(incidentId) {
    return [...incidentRows.children].find((row) => row.dataset.incidentRow === incidentId) || null;
  }

  function replaceIncidentRow(incident, options = {}) {
    const current = findIncidentRow(incident.id);
    const next = createIncidentRow(incident, options);
    if (current) current.replaceWith(next);
    else incidentRows.append(next);
    return next;
  }

  function removeIncidentRow(incidentId) {
    findIncidentRow(incidentId)?.remove();
  }

  function renderIncidentTable() {
    incidentRows.replaceChildren(...incidentListState.items.map((incident) => createIncidentRow(incident, {
      pending: incidentListState.pendingIds.has(incident.id),
    })));
    setIncidentPanelState("table");
    updateIncidentCount();
  }

  function renderIncidentEmptyState() {
    const filters = readIncidentFilters();
    if (hasActiveIncidentFilters(filters)) {
      incidentEmptyTitle.textContent = "Ninguna incidencia coincide con los filtros";
      incidentEmptyMsg.textContent =
        `No hay resultados para ${describeIncidentFilters(filters).join(", ")}. ` +
        "Prueba con otro criterio o limpia los filtros para ver el listado completo.";
      incidentEmptyClear.hidden = false;
    } else {
      incidentEmptyTitle.textContent = "Todavía no hay incidencias";
      incidentEmptyMsg.textContent =
        "Cuando el equipo registre la primera incidencia aparecerá aquí, con su estado y su sede.";
      incidentEmptyClear.hidden = true;
    }
    incidentListState.items = [];
    updateIncidentCount();
    setIncidentPanelState("empty");
  }

  function describeIncidentLoadError(error) {
    const message = String(error?.message || "");
    if (!navigator.onLine) {
      return "Parece que no hay conexión a internet. Recupera la conexión y vuelve a intentarlo.";
    }
    if (/failed to fetch|networkerror|load failed|fetch/i.test(message)) {
      return "No se pudo conectar con la API. Comprueba tu conexión e inténtalo de nuevo.";
    }
    return "No se pudieron cargar las incidencias. Comprueba tu conexión e inténtalo de nuevo.";
  }

  function renderBranchOptions(branches) {
    const previous = incidentFilterBranch.value;
    const values = [...new Set(branches.filter(Boolean))].sort((left, right) =>
      branchLabel(left).localeCompare(branchLabel(right), "es"),
    );
    const options = [new Option("Todas las sedes", "")];
    values.forEach((value) => options.push(new Option(branchLabel(value), value)));
    incidentFilterBranch.replaceChildren(...options);
    incidentFilterBranch.value = values.includes(previous) ? previous : "";
  }

  async function loadIncidentBranchOptions() {
    if (incidentListState.branches !== null) return;
    renderBranchOptions(INCIDENT_FALLBACK_BRANCHES);
    try {
      const response = await fetch(INCIDENTS_API_URL, { headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const incidents = await response.json();
      if (!Array.isArray(incidents)) return;
      incidentListState.branches = incidents.map((incident) => incident.branch).filter(Boolean);
      incidentListState.total = incidents.length;
      renderBranchOptions([...INCIDENT_FALLBACK_BRANCHES, ...incidentListState.branches]);
      // Solo se refresca el contador si el listado ya está en pantalla;
      // durante la carga el indicador debe seguir mostrando «…».
      if (!incidentTableWrap.hidden) updateIncidentCount();
    } catch {
      // El filtro de sede mantiene las opciones conocidas; el error real se
      // informa al cargar el listado.
    }
  }

  async function loadIncidents() {
    incidentListState.controller?.abort();
    const controller = new AbortController();
    incidentListState.controller = controller;
    const requestId = ++incidentListState.requestId;

    const filters = readIncidentFilters();
    setIncidentPanelState("loading");
    incidentCount.textContent = "…";

    try {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.origin) params.set("origin", filters.origin);
      if (filters.branch) params.set("branch", filters.branch);
      const query = params.size ? `?${params}` : "";

      const response = await fetch(`${INCIDENTS_API_URL}${query}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (requestId !== incidentListState.requestId) return;
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, `El servidor respondió con un error (HTTP ${response.status}).`),
        );
      }
      if (!Array.isArray(payload)) {
        throw new Error("La API devolvió una respuesta inesperada al listar incidencias.");
      }

      incidentListState.items = payload;
      if (!hasActiveIncidentFilters(filters)) incidentListState.total = payload.length;

      if (payload.length === 0) {
        renderIncidentEmptyState();
      } else {
        renderIncidentTable();
      }
    } catch (error) {
      if (error?.name === "AbortError" || requestId !== incidentListState.requestId) return;
      incidentListState.items = [];
      incidentListErrorMsg.textContent = describeIncidentLoadError(error);
      incidentCount.textContent = "—";
      setIncidentPanelState("error");
    } finally {
      if (incidentListState.controller === controller) incidentListState.controller = null;
    }
  }

  async function updateIncidentStatus(button) {
    const incidentId = button.dataset.incidentId;
    const nextStatus = button.dataset.nextStatus;
    if (!incidentId || !nextStatus) return;
    if (incidentListState.pendingIds.has(incidentId)) return;

    const index = incidentListState.items.findIndex((incident) => incident.id === incidentId);
    if (index === -1) return;

    const previous = incidentListState.items[index];

    // Actualización optimista: el estado se refleja al instante y se revierte si
    // la API rechaza el cambio.
    incidentListState.pendingIds.add(incidentId);
    incidentListState.items[index] = { ...previous, status: nextStatus };
    replaceIncidentRow(incidentListState.items[index], { pending: true });
    clearIncidentNotices();

    try {
      const response = await fetch(`${INCIDENTS_API_URL}/${encodeURIComponent(incidentId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, `No se pudo actualizar el estado (HTTP ${response.status}).`));
      }
      if (!payload || payload.id !== incidentId || payload.status !== nextStatus) {
        throw new Error("La API devolvió una respuesta inesperada al actualizar la incidencia.");
      }

      const currentIndex = incidentListState.items.findIndex((incident) => incident.id === incidentId);
      const stillVisible = incidentMatchesFilters(payload, readIncidentFilters());
      if (stillVisible) {
        if (currentIndex === -1) incidentListState.items.push(payload);
        else incidentListState.items[currentIndex] = payload;
        replaceIncidentRow(payload);
      } else {
        removeIncidentRow(incidentId);
        if (currentIndex !== -1) incidentListState.items.splice(currentIndex, 1);
      }
      incidentListState.pendingIds.delete(incidentId);
      if (incidentListState.controller) await loadIncidents();
      else if (incidentListState.items.length === 0) renderIncidentEmptyState();
      else { setIncidentPanelState("table"); updateIncidentCount(); }

      showIncidentNotice(
        "success",
        stillVisible
          ? `Incidencia «${payload.title}» actualizada a «${statusLabel(payload.status)}».`
          : `Incidencia «${payload.title}» actualizada a «${statusLabel(payload.status)}» y ya no coincide con los filtros aplicados.`,
      );
    } catch (error) {
      // Rollback: se restaura el estado anterior y se avisa al usuario.
      const currentIndex = incidentListState.items.findIndex((incident) => incident.id === incidentId);
      if (currentIndex !== -1 && incidentMatchesFilters(previous, readIncidentFilters())) {
        incidentListState.items[currentIndex] = previous;
        const restored = replaceIncidentRow(previous);
        restored.classList.add("is-restored");
        const restoredButton = [...restored.querySelectorAll("button")].find(
          (candidate) => candidate.dataset.nextStatus === nextStatus,
        );
        (restoredButton || restored.querySelector("button"))?.focus();
      }
      showIncidentNotice(
        "error",
        `No se pudo actualizar «${previous.title}». Se ha restaurado el estado «${statusLabel(previous.status)}». Inténtalo de nuevo.`,
      );
    } finally {
      incidentListState.pendingIds.delete(incidentId);
    }
  }

  /* ───── Panel de incidencias: eventos ───── */

  incidentFilterStatus.addEventListener("change", () => { clearIncidentNotices(); loadIncidents(); });
  incidentFilterOrigin.addEventListener("change", () => { clearIncidentNotices(); loadIncidents(); });
  incidentFilterBranch.addEventListener("change", () => { clearIncidentNotices(); loadIncidents(); });
  incidentRefreshButton.addEventListener("click", () => { clearIncidentNotices(); loadIncidents(); });
  incidentRetryButton.addEventListener("click", () => { clearIncidentNotices(); loadIncidents(); });

  function resetIncidentFilters() {
    incidentFilterStatus.value = "";
    incidentFilterOrigin.value = "";
    incidentFilterBranch.value = "";
    clearIncidentNotices();
    loadIncidents();
  }

  incidentClearFilters.addEventListener("click", resetIncidentFilters);
  incidentEmptyClear.addEventListener("click", resetIncidentFilters);

  incidentRows.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-incident-id][data-next-status]");
    if (!button) return;
    updateIncidentStatus(button);
  });

  /* ───── Panel de resumen: métricas agregadas de /api/incidents/summary ───── */

  const SUMMARY_URL = `${INCIDENTS_API_URL}/summary`;

  const SUMMARY_BRANCH_LABELS = INCIDENT_BRANCH_LABELS;
  const SUMMARY_GROUPS = [
    {
      key: "by_status",
      title: "Por estado",
      note: "Ciclo de vida de la incidencia",
      label: statusLabel,
      order: ["open", "in_progress", "resolved", "discarded"],
    },
    {
      key: "by_category",
      title: "Por categoría",
      note: "Línea de negocio u operativa",
      label: (value) => value === "none" ? "Sin categoría" : value,
      order: ["technical_failure", "process_error", "client_complaint", "candidate_issue", "staff_issue", "sla_breach", "data_quality", "other"],
    },
    {
      key: "by_origin",
      title: "Por origen",
      note: "Quién reporta la incidencia",
      label: (value) => INCIDENT_ORIGIN_LABELS[value] || value,
      order: ["customer", "branch", "internal"],
    },
    {
      key: "by_branch",
      title: "Por sede",
      note: "Oficina que atiende la incidencia",
      label: (value) => SUMMARY_BRANCH_LABELS[value] || value,
      order: Object.keys(SUMMARY_BRANCH_LABELS),
    },
  ];

  const summaryPanel = summaryView.querySelector("#summary-panel");
  const summaryTotal = summaryView.querySelector("#summary-total");
  const summaryUpdated = summaryView.querySelector("#summary-updated");
  const summaryLoading = summaryView.querySelector("#summary-loading");
  const summaryError = summaryView.querySelector("#summary-error");
  const summaryErrorMsg = summaryView.querySelector("#summary-error-msg");
  const summaryRetryButton = summaryView.querySelector("#summary-retry-btn");
  const summaryEmpty = summaryView.querySelector("#summary-empty");
  const summaryGroups = summaryView.querySelector("#summary-groups");
  const summaryRefreshButton = summaryView.querySelector("#refresh-summary");

  const summaryState = {
    controller: null,
    requestId: 0,
    loaded: false,
  };

  function formatSummaryTimestamp(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function setSummaryPanelState(state) {
    summaryPanel.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    summaryLoading.hidden = state !== "loading";
    summaryError.hidden = state !== "error";
    summaryEmpty.hidden = state !== "empty";
    summaryGroups.hidden = state !== "data";
    summaryRefreshButton.disabled = state === "loading";
  }

  function orderSummaryEntries(values, order) {
    const rank = new Map(order.map((key, index) => [key, index]));
    return Object.entries(values || {}).sort((left, right) => {
      const leftRank = rank.has(left[0]) ? rank.get(left[0]) : Number.MAX_SAFE_INTEGER;
      const rightRank = rank.has(right[0]) ? rank.get(right[0]) : Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left[0].localeCompare(right[0], "es");
    });
  }

  function buildSummaryGroup(group, values, total) {
    const entries = orderSummaryEntries({
      ...Object.fromEntries(group.order.map((value) => [value, 0])),
      ...values,
    }, group.order);
    const groupTotal = entries.reduce((sum, [, count]) => sum + count, 0);
    const card = document.createElement("article");
    card.className = "summary-group";
    card.dataset.summaryGroup = group.key;

    const heading = document.createElement("div");
    heading.className = "summary-group-heading";
    const title = document.createElement("span");
    title.className = "summary-group-title";
    title.textContent = group.title;
    const badge = document.createElement("span");
    badge.className = "card-label";
    badge.textContent = `${groupTotal} total`;
    heading.append(title, badge);

    const note = document.createElement("p");
    note.className = "summary-group-note";
    note.textContent = group.note;

    card.append(heading, note);

    if (entries.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "empty-state summary-group-empty";
      placeholder.textContent = "Sin datos";
      card.append(placeholder);
      return card;
    }

    const list = document.createElement("div");
    list.className = "summary-bars";
    const max = Math.max(...entries.map(([, count]) => count), 1);
    entries.forEach(([value, count]) => {
      const row = document.createElement("div");
      row.className = "bar-row summary-bar-row";
      row.dataset.summaryValue = value;

      const label = document.createElement("span");
      label.className = "summary-bar-label";
      label.textContent = group.label(value);
      label.title = group.label(value);

      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = `${(count / max) * 100}%`;
      track.append(fill);

      const amount = document.createElement("span");
      amount.className = "bar-count";
      amount.textContent = String(count);
      const share = total > 0 ? Math.round((count / total) * 100) : 0;
      amount.title = `${count} de ${total} incidencias (${share}%)`;

      row.append(label, track, amount);
      list.append(row);
    });
    card.append(list);
    return card;
  }

  function renderSummary(summary) {
    const total = Object.values(summary.by_status || {}).reduce((sum, count) => sum + count, 0);

    summaryGroups.replaceChildren(
      ...SUMMARY_GROUPS.map((group) => buildSummaryGroup(group, summary[group.key], total)),
    );

    summaryTotal.textContent = String(total);
    summaryTotal.title = `${total} incidencias registradas`;
    summaryUpdated.textContent = `Actualizado ${formatSummaryTimestamp(new Date())}`;

    setSummaryPanelState(total === 0 ? "empty" : "data");
  }

  function describeSummaryLoadError(error) {
    const message = String(error?.message || "");
    if (!navigator.onLine) {
      return "Parece que no hay conexión a internet. Recupera la conexión y vuelve a intentarlo.";
    }
    if (/failed to fetch|networkerror|load failed|fetch/i.test(message)) {
      return "No se pudo conectar con la API. Comprueba tu conexión e inténtalo de nuevo.";
    }
    return "No se pudieron cargar las métricas. Comprueba tu conexión e inténtalo de nuevo.";
  }

  async function loadSummary(force = false) {
    if (summaryState.loaded && !force) return;

    summaryState.controller?.abort();
    const controller = new AbortController();
    summaryState.controller = controller;
    const requestId = ++summaryState.requestId;

    setSummaryPanelState("loading");
    summaryTotal.textContent = "…";
    summaryUpdated.textContent = "";

    try {
      const response = await fetch(SUMMARY_URL, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (requestId !== summaryState.requestId) return;
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, `El servidor respondió con un error (HTTP ${response.status}).`),
        );
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("La API devolvió una respuesta inesperada al calcular el resumen.");
      }
      for (const group of SUMMARY_GROUPS) {
        const values = payload[group.key];
        if (!values || typeof values !== "object" || Array.isArray(values) ||
            !Object.values(values).every((count) => Number.isSafeInteger(count) && count >= 0)) {
          throw new Error("La API devolvió métricas incompletas o no válidas. Vuelve a intentarlo.");
        }
      }
      const totals = SUMMARY_GROUPS.map((group) => Object.values(payload[group.key]).reduce((sum, count) => sum + count, 0));
      if (!totals.every((total) => Number.isSafeInteger(total) && total === totals[0])) {
        throw new Error("Los totales del resumen no coinciden entre dimensiones. Vuelve a intentarlo.");
      }

      renderSummary(payload);
      summaryState.loaded = true;
    } catch (error) {
      if (error?.name === "AbortError" || requestId !== summaryState.requestId) return;
      summaryState.loaded = false;
      summaryErrorMsg.textContent = describeSummaryLoadError(error);
      summaryTotal.textContent = "—";
      summaryUpdated.textContent = "";
      setSummaryPanelState("error");
    } finally {
      if (summaryState.controller === controller) summaryState.controller = null;
    }
  }

  summaryRefreshButton.addEventListener("click", () => loadSummary(true));
  summaryRetryButton.addEventListener("click", () => loadSummary(true));

  /* ───── Init ───── */

  syncDirectoryRoute();
})();
