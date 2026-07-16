const API_URL = "https://dev-nanbyodata.dbcls.jp/sparqlist/api/nanbyodata_get_variant_by_nando_id";
const TOGOSTANZA_THEME_URL = "https://togostanza.github.io/togostanza-themes/contrib/nanbyodata.css";

const columns = {
  clinvar: [
    { id: "Clinvar_id", label: "Clinvar_ID", link: "Clinvar_link" },
    { id: "title", label: "HGVS" },
    { id: "Interpretation", label: "Interpretation" },
    { id: "type", label: "Variant type" },
    { id: "position", label: "Chr:Position" },
    { id: "tgv_id", label: "TogoVar_ID", link: "tgv_link" },
    { id: "MedGen_id", label: "MedGen_ID", link: "MedGen_link" },
    { id: "mondo_id", label: "MONDO_ID", link: "mondo" },
    { id: "genotype_count_alt_alt", label: "Alt/Alt count" },
    { id: "genotype_count_alt_ref", label: "Ref/Alt count" },
    { id: "mgend_id", label: "MGeND ID", link: "mgend_url" }
  ],
  mgend: [
    { id: "hgvs", label: "HGVS" },
    { id: "significance", label: "Interpretation" },
    { id: "vtype", label: "Variant type" },
    { id: "ch", label: "Chr" },
    { id: "position", label: "Position" },
    { id: "genelabel", label: "Gene_symbol" },
    { id: "hgncID", label: "HGNC ID", link: "hgncurl" },
    { id: "omim_id", label: "OMIM ID", link: "omim_url" },
    { id: "mondo_label", label: "MONDO", link: "mondo_url" },
    { id: "tgv_id", label: "TogoVar_ID", link: "tgv_link" },
    { id: "genotype_count_alt_alt", label: "Alt/Alt count" },
    { id: "genotype_count_alt_ref", label: "Ref/Alt count" },
    { id: "mgend_id", label: "MGeND ID", link: "mgend_url" }
  ]
};

const state = {
  active: "clinvar",
  objectUrls: {
    clinvar: null,
    mgend: null
  },
  data: {
    clinvar: [],
    mgend: []
  }
};

const nandoInput = document.getElementById("nando-id");
const loadButton = document.getElementById("load-button");
const statusEl = document.getElementById("status");
const updatedAtEl = document.getElementById("updated-at");
const tableView = document.getElementById("table-view");
const clinvarCount = document.getElementById("clinvar-count");
const mgendCount = document.getElementById("mgend-count");
const tabButtons = [...document.querySelectorAll(".tab-button")];
const statusBar = document.querySelector(".status-bar");

function buildUrl(nandoId, target) {
  const url = new URL(API_URL);
  url.searchParams.set("nando_id", nandoId.replace(/^NANDO:/i, ""));
  url.searchParams.set("target", target);
  return url;
}

async function fetchVariants(nandoId, target) {
  const response = await fetch(buildUrl(nandoId, target));
  if (!response.ok) {
    throw new Error(`${target} request failed: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`${target} response was not an array`);
  }

  return data;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusBar.classList.toggle("error", isError);
}

function setLoading(loading) {
  loadButton.disabled = loading;
  loadButton.textContent = loading ? "Loading..." : "Load variants";
}

function render() {
  const activeColumns = columns[state.active];
  const rows = state.data[state.active];

  clinvarCount.textContent = state.data.clinvar.length;
  mgendCount.textContent = state.data.mgend.length;
  renderStanza(rows, activeColumns);
}

function renderStanza(rows, activeColumns) {
  revokeObjectUrl(state.active);
  state.objectUrls[state.active] = URL.createObjectURL(
    new Blob([JSON.stringify(rows)], { type: "application/json" })
  );

  tableView.replaceChildren();
  const table = document.createElement("togostanza-pagination-table");
  table.setAttribute("data-url", state.objectUrls[state.active]);
  table.setAttribute("data-type", "json");
  table.setAttribute("custom-css-url", TOGOSTANZA_THEME_URL);
  table.setAttribute("fixed-columns", "1");
  table.setAttribute("page-size-option", "10,20,50,100");
  table.setAttribute("page-slider", "false");
  table.setAttribute("data-unavailable_message", "No variants found.");
  table.setAttribute("columns", JSON.stringify(activeColumns));
  tableView.append(table);
}

function revokeObjectUrl(target) {
  if (state.objectUrls[target]) {
    URL.revokeObjectURL(state.objectUrls[target]);
    state.objectUrls[target] = null;
  }
}

async function load() {
  const nandoId = nandoInput.value.trim() || "1200216";
  setLoading(true);
  setStatus(`Loading variants for NANDO:${nandoId.replace(/^NANDO:/i, "")}...`);
  updatedAtEl.textContent = "";

  try {
    const [clinvar, mgend] = await Promise.all([
      fetchVariants(nandoId, "clinvar"),
      fetchVariants(nandoId, "mgend")
    ]);
    state.data.clinvar = clinvar;
    state.data.mgend = mgend;
    setStatus("Loaded ClinVar and MGeND variants.");
    updatedAtEl.textContent = new Date().toLocaleString();
    render();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
}

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    state.active = button.dataset.target;
    for (const tab of tabButtons) {
      tab.classList.toggle("active", tab === button);
    }
    render();
  });
}

loadButton.addEventListener("click", load);
nandoInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    load();
  }
});

render();
load();
