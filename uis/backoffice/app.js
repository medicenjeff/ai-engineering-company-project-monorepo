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
  const routeLinks = [...document.querySelectorAll('.nav-item[href="#analysis"], .nav-item[href="#suppliers"]')];
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
    rateLabel.className = "visually-hidden";
    rateLabel.textContent = `Tarifa por hora en USD para ${supplier.name}`;
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

  function syncDirectoryRoute() {
    const hash = window.location.hash;
    if (hash !== "#analysis" && hash !== "#suppliers") return;

    const showSuppliers = hash === "#suppliers";
    analysisView.hidden = showSuppliers;
    suppliersView.hidden = !showSuppliers;
    breadcrumb.textContent = showSuppliers ? "Directorio de proveedores" : "Análisis de incidencias";
    document.title = showSuppliers ? "Pulse Desk | Proveedores" : "Pulse Desk | Análisis de incidencias";
    routeLinks.forEach((link) => {
      const active = link.hash === hash;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    if (showSuppliers && !suppliersLoaded) loadSuppliers();
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
  syncDirectoryRoute();
})();
