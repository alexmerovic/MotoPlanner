const STORAGE_KEYS = {
  entries: "motoplanner.entries",
  config: "motoplanner.config",
  configHistory: "motoplanner.configHistory",
  analysisDate: "motoplanner.analysisDate",
  finance: "motoplanner.finance"
};

function getDefaultConfig() {
  return {
    controlStartDate: toDateInputValue(new Date()),
    plannedControlDays: 22,
    monthlyRevenueGoal: 6000,
    monthlyNetProfitGoal: 3000,
    monthlyOperationalProfitGoal: 4050,
    monthlyInstallment: 830,
    monthlyInsurance: 165,
    monthlyPhone: 60,
    monthlyOtherFixed: 0,
    monthlyFixedCostItems: [],
    purchaseInstallmentValue: 0,
    purchaseInstallments: 0,
    purchaseStartMonth: "",
    repairInstallmentValue: 0,
    repairInstallments: 0,
    repairStartMonth: "",
    oilPerKm: 0.043,
    tirePerKm: 0.043,
    chainPerKm: 0.013,
    brakePerKm: 0.008,
    reviewReservePerKm: 0.04,
    extraMaintenancePerKm: 0.03,
    tireSetValue: 650,
    tireLifeKm: 15000,
    oilChangeValue: 65,
    oilChangeIntervalKm: 1500,
    chainValue: 260,
    chainLifeKm: 20000,
    brakeValue: 90,
    brakeLifeKm: 12000,
    gasPricePerLiter: 5.9,
    consumptionKmPerLiter: 38,
    debtBalance: 0,
    remainingInstallments: 0,
    monthlyInterestRate: 2,
    amortizationSimulationAmount: 0
  };
}

const defaultConfig = getDefaultConfig();
const CONFIG_FIELDS = Object.keys(defaultConfig);
const FINANCE_DEFAULT_FIRST_DUE_DATE = "2026-05-26";

function getDefaultFinance() {
  const baseConfig = config || defaultConfig;

  return {
    downPayment: 0,
    financedAmount: Math.max(0, baseConfig.debtBalance || 0),
    totalInstallments: Math.max(0, Math.trunc(baseConfig.remainingInstallments || 0)),
    installmentAmount: Math.max(0, baseConfig.monthlyInstallment || 0),
    firstDueDate: FINANCE_DEFAULT_FIRST_DUE_DATE,
    cashOpeningBalance: 0,
    profitWithdrawal: 0,
    amortizations: []
  };
}

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3
});

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric"
});

const chartColors = {
  profit: "rgba(210, 216, 226, 0.82)",
  fuel: "rgba(142, 167, 255, 0.72)",
  wear: "rgba(216, 196, 123, 0.68)",
  fixed: "rgba(239, 125, 134, 0.66)",
  other: "rgba(180, 164, 255, 0.6)"
};

const distributionColors = {
  profit: "37, 217, 135",
  fuel: "139, 105, 205",
  wear: "66, 154, 225",
  financing: "126, 38, 49",
  insurance: "178, 82, 34",
  fixedOther: "72, 24, 34",
  other: "115, 121, 133"
};

const periodNames = {
  today: "Dia analisado",
  week: "Semana analisada",
  month: "Mes de analise",
  quarter: "Trimestre de analise",
  year: "Ano"
};

let entries = [];
let config = { ...defaultConfig };
let configHistory = [];
let selectedEntryIds = new Set();
let selectedFinanceInstallments = new Set();
let selectedPeriod = "month";
let selectedTrendRange = "last7";
let analysisDate = startOfDay(new Date());
let latestProjection = null;
let finance = null;
let lastSelectedFinanceInstallment = null;

document.addEventListener("DOMContentLoaded", () => {
  config = loadConfig();
  entries = loadEntries();
  configHistory = loadConfigHistory();
  finance = loadFinance();
  entries = entries.map(ensureEntryCostSnapshot);
  analysisDate = loadAnalysisDate();
  saveConfigHistory();
  saveConfig();
  saveFinance();
  saveEntries();

  setupDecimalInputs();
  setupInitialValues();
  bindEvents();
  setupAccordions();
  renderAll();
});

function setupDecimalInputs() {
  document.querySelectorAll('input[inputmode="decimal"], #kmCalculated').forEach((input) => {
    input.type = "text";
    input.inputMode = "decimal";
    input.dataset.decimalInput = "true";

    input.addEventListener("input", (event) => {
      event.target.value = normalizeDecimalInputText(event.target.value);
    });
  });
}

function setupInitialValues() {
  document.getElementById("entryDate").value = toBrazilDateValue(new Date());
  updateAnalysisMonthLabel();
  fillConfigForm();
  fillFinanceForm();
  updateKmTotal();
  renderConfig();
}

function bindEvents() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => switchPage(button.dataset.page));
  });

  document.querySelectorAll("[data-period]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPeriod = button.dataset.period;
      document.querySelectorAll("[data-period]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderDashboard();
    });
  });

  document.getElementById("entryForm").addEventListener("submit", saveEntry);
  document.getElementById("cancelEditBtn").addEventListener("click", resetEntryForm);
  document.getElementById("clearDataBtn").addEventListener("click", clearEntries);
  document.getElementById("toggleSelectAllBtn").addEventListener("click", toggleSelectAllEntries);
  document.getElementById("deleteSelectedBtn").addEventListener("click", deleteSelectedEntries);
  document.getElementById("monthPrevBtn").addEventListener("click", () => changeAnalysisMonth(-1));
  document.getElementById("monthNextBtn").addEventListener("click", () => changeAnalysisMonth(1));
  document.getElementById("monthTodayBtn").addEventListener("click", () => setAnalysisDate(new Date()));
  document.getElementById("configForm").addEventListener("input", updateConfig);
  document.getElementById("configForm").addEventListener("submit", (event) => event.preventDefault());
  document.getElementById("costsForm").addEventListener("input", updateConfig);
  document.getElementById("costsForm").addEventListener("submit", (event) => event.preventDefault());
  document.getElementById("addFixedCostItemBtn").addEventListener("click", addMonthlyFixedCostItemRow);
  document.getElementById("monthlyFixedCostItemsTable").addEventListener("click", (event) => {
    if (event.target.dataset.action === "remove-fixed-cost-item") {
      removeMonthlyFixedCostItemRow(event.target.closest("tr"));
      updateConfig();
    }
  });
  document.getElementById("financeForm").addEventListener("input", updateFinance);
  document.getElementById("financeForm").addEventListener("submit", (event) => event.preventDefault());
  document.getElementById("amortizationForm").addEventListener("submit", saveAmortization);
  document.getElementById("amortizationAmount").addEventListener("input", () => {
    renderSelectedInstallmentsSummary(calculateFinanceMetrics());
    renderInstallmentsTable(calculateFinanceMetrics());
  });
  document.getElementById("selectOpenInstallmentsBtn").addEventListener("click", selectOpenInstallments);
  document.getElementById("clearInstallmentSelectionBtn").addEventListener("click", clearInstallmentSelection);
  document.getElementById("restoreDefaultsBtn").addEventListener("click", restoreDefaults);
  document.getElementById("exportDataBtn").addEventListener("click", exportData);
  document.getElementById("importDataBtn").addEventListener("click", () => {
    document.getElementById("importFileInput").click();
  });
  document.getElementById("importFileInput").addEventListener("change", importData);
  document.getElementById("applySuggestedCostsBtn").addEventListener("click", applySuggestedCosts);
  document.getElementById("useProjectedProfitBtn").addEventListener("click", useProjectedProfitForAmortization);

  document.getElementById("trendRange").addEventListener("change", (event) => {
    selectedTrendRange = event.target.value;
    renderTrendChart();
  });

  ["entryDate", "controlStartDate", "financeFirstDueDate"].forEach((id) => {
    document.getElementById(id).addEventListener("input", (event) => {
      event.target.value = maskBrazilDate(event.target.value);
    });
  });

  document.getElementById("amortizationMonth").addEventListener("input", (event) => {
    event.target.value = maskBrazilMonth(event.target.value);
  });

  [
    "kmInitial",
    "kmFinal",
    "kmTotalManual",
    "kmPaid",
    "grossRevenue",
    "tips",
    "fuelCost",
    "fuelMode",
    "otherCosts",
    "maintenancePayments",
    "hoursOnline",
    "hoursEffective",
    "rides",
    "entryDate"
  ].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      updateKmTotal();
      renderEntryPreview();
    });
  });

  document.getElementById("fatigue").addEventListener("input", (event) => {
    document.getElementById("fatigueValue").textContent = event.target.value;
  });
}

function switchPage(page) {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  document.querySelectorAll("[data-page-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.pagePanel === page);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setAnalysisDate(date) {
  analysisDate = startOfDay(date);
  saveAnalysisDate();
  updateAnalysisMonthLabel();
  renderAll();
}

function changeAnalysisMonth(offset) {
  const nextDate = new Date(analysisDate.getFullYear(), analysisDate.getMonth() + offset, 1);
  setAnalysisDate(nextDate);
}

function updateAnalysisMonthLabel() {
  document.getElementById("currentMonthLabel").textContent = monthFormatter.format(analysisDate);
}

function loadAnalysisDate() {
  const savedValue = localStorage.getItem(STORAGE_KEYS.analysisDate);
  const savedDate = normalizeDateInputValue(savedValue);
  if (savedDate) {
    return parseLocalDate(savedDate);
  }

  const savedMonth = normalizeMonthInputValue(savedValue);
  if (savedMonth) {
    return parseLocalDate(`${savedMonth}-01`);
  }

  return startOfDay(new Date());
}

function saveAnalysisDate() {
  localStorage.setItem(STORAGE_KEYS.analysisDate, toDateInputValue(analysisDate));
}

function setupAccordions() {
  const panels = [...document.querySelectorAll(".panel")].filter((panel) => {
    return panel.querySelector(".panel-title") && !panel.classList.contains("form-panel") && !panel.classList.contains("config-hero");
  });
  let configSectionIndex = 0;

  panels.forEach((panel) => {
    if (panel.classList.contains("accordion-panel")) {
      return;
    }

    panel.classList.add("accordion-panel");
    const title = panel.querySelector(".panel-title");
    const toggle = document.createElement("button");
    toggle.className = "accordion-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Abrir ou fechar secao");
    toggle.textContent = "";
    title.appendChild(toggle);

    if (panel.classList.contains("config-section")) {
      configSectionIndex += 1;
      if (configSectionIndex > 1) {
        panel.classList.add("collapsed");
      }
    }

    const togglePanel = () => panel.classList.toggle("collapsed");
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePanel();
    });
    title.addEventListener("click", (event) => {
      if (event.target.closest("button, input, select, textarea, a, label")) {
        return;
      }

      togglePanel();
    });
  });
}

function loadEntries() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.entries) || "[]");
    return Array.isArray(stored) ? stored.map(normalizeEntry) : [];
  } catch (error) {
    console.warn("Nao foi possivel carregar os lancamentos.", error);
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries.map(normalizeEntry)));
}

function loadConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || "{}");
    return normalizeConfig(stored);
  } catch (error) {
    console.warn("Nao foi possivel carregar as configuracoes.", error);
    return getDefaultConfig();
  }
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(config));
}

function loadFinance() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.finance) || "{}");
    return normalizeFinance(stored);
  } catch (error) {
    console.warn("Nao foi possivel carregar o financiamento.", error);
    return getDefaultFinance();
  }
}

function saveFinance() {
  localStorage.setItem(STORAGE_KEYS.finance, JSON.stringify(normalizeFinance(finance)));
}

function normalizeFinance(storedFinance = {}) {
  const fallback = getDefaultFinance();
  const totalInstallments = Math.max(0, Math.trunc(toNumber(storedFinance.totalInstallments ?? fallback.totalInstallments)));
  const amortizations = Array.isArray(storedFinance.amortizations)
    ? storedFinance.amortizations
        .map((item) => normalizeAmortization(item, totalInstallments))
        .filter(Boolean)
    : [];

  const normalizedFirstDueDate = normalizeDateInputValue(storedFinance.firstDueDate) || fallback.firstDueDate;
  const isCurrentContract =
    totalInstallments === 48 ||
    Math.abs(toNumber(storedFinance.installmentAmount ?? fallback.installmentAmount) - 830.43) < 1 ||
    Math.abs(toNumber(storedFinance.financedAmount ?? fallback.financedAmount) - 19282.95) < 1;
  const shouldUseContractDueDate =
    isCurrentContract && normalizedFirstDueDate >= "2026-04-01" && normalizedFirstDueDate <= "2026-05-31";

  return {
    downPayment: Math.max(0, toNumber(storedFinance.downPayment ?? fallback.downPayment)),
    financedAmount: Math.max(0, toNumber(storedFinance.financedAmount ?? fallback.financedAmount)),
    totalInstallments,
    installmentAmount: Math.max(0, toNumber(storedFinance.installmentAmount ?? fallback.installmentAmount)),
    firstDueDate: shouldUseContractDueDate ? FINANCE_DEFAULT_FIRST_DUE_DATE : normalizedFirstDueDate,
    cashOpeningBalance: Math.max(0, toNumber(storedFinance.cashOpeningBalance ?? fallback.cashOpeningBalance)),
    profitWithdrawal: Math.max(0, toNumber(storedFinance.profitWithdrawal ?? fallback.profitWithdrawal)),
    amortizations
  };
}

function normalizeAmortization(item = {}, maxInstallments = finance?.totalInstallments || 0) {
  const month = normalizeMonthInputValue(item.month);
  if (!month) {
    return null;
  }

  const selectedInstallments = Array.isArray(item.selectedInstallments)
    ? item.selectedInstallments
        .map((number) => Math.trunc(toNumber(number)))
        .filter((number, index, numbers) => number > 0 && (!maxInstallments || number <= maxInstallments) && numbers.indexOf(number) === index)
        .sort((a, b) => a - b)
    : [];

  return {
    id: String(item.id || createEntryId()),
    month,
    amount: Math.max(0, toNumber(item.amount)),
    selectedInstallments,
    notes: item.notes || "",
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function loadConfigHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.configHistory) || "[]");
    const history = Array.isArray(stored)
      ? stored
          .filter((item) => item && isDateInputValue(item.effectiveDate))
          .map((item) => ({
            id: String(item.id || createEntryId()),
            effectiveDate: item.effectiveDate,
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
            config: normalizeConfig(item.config || {})
          }))
      : [];

    if (!history.length) {
      return createInitialConfigHistory();
    }

    return sortConfigHistory(history);
  } catch (error) {
    console.warn("Nao foi possivel carregar o historico de configuracoes.", error);
    return createInitialConfigHistory();
  }
}

function saveConfigHistory() {
  configHistory = sortConfigHistory(configHistory);
  localStorage.setItem(STORAGE_KEYS.configHistory, JSON.stringify(configHistory));
}

function createInitialConfigHistory() {
  const baselineDate = getBaselineConfigDate();
  return [
    {
      id: createEntryId(),
      effectiveDate: baselineDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: normalizeConfig(config)
    }
  ];
}

function upsertConfigHistory(effectiveDate = toDateInputValue(new Date())) {
  const date = isDateInputValue(effectiveDate) ? effectiveDate : toDateInputValue(new Date());
  const existingIndex = configHistory.findIndex((item) => item.effectiveDate === date);
  const item = {
    id: existingIndex >= 0 ? configHistory[existingIndex].id : createEntryId(),
    effectiveDate: date,
    createdAt: existingIndex >= 0 ? configHistory[existingIndex].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: normalizeConfig(config)
  };

  if (existingIndex >= 0) {
    configHistory[existingIndex] = item;
  } else {
    configHistory.push(item);
  }

  saveConfigHistory();
}

function sortConfigHistory(history) {
  return [...history].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

function getBaselineConfigDate() {
  const dates = entries.map((entry) => entry.date).filter(isDateInputValue).sort();
  return dates[0] || config.controlStartDate || toDateInputValue(new Date());
}

function normalizeMonthlyFixedCostItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      name: String(item.name || "").trim(),
      description: String(item.description || "").trim(),
      amount: Math.max(0, toNumber(item.amount))
    }))
    .filter((item) => item.name || item.description || item.amount > 0);
}

function normalizeConfig(storedConfig = {}) {
  const migrated = { ...storedConfig };

  if (storedConfig.monthlyProfitGoal !== undefined && storedConfig.monthlyNetProfitGoal === undefined) {
    migrated.monthlyNetProfitGoal = storedConfig.monthlyProfitGoal;
  }

  if (storedConfig.maintenanceReserve !== undefined && storedConfig.monthlyOtherFixed === undefined) {
    migrated.monthlyOtherFixed = storedConfig.maintenanceReserve;
  }

  return CONFIG_FIELDS.reduce((accumulator, key) => {
    if (key === "controlStartDate") {
      accumulator[key] = normalizeDateInputValue(migrated[key]) || defaultConfig[key];
      return accumulator;
    }

    if (key === "purchaseStartMonth" || key === "repairStartMonth") {
      accumulator[key] = normalizeMonthInputValue(migrated[key]) || defaultConfig[key];
      return accumulator;
    }

    if (key === "monthlyFixedCostItems") {
      accumulator[key] = normalizeMonthlyFixedCostItems(migrated[key] ?? defaultConfig[key]);
      return accumulator;
    }

    accumulator[key] = toNumber(migrated[key] ?? defaultConfig[key]);
    return accumulator;
  }, {});
}

function normalizeEntry(entry = {}) {
  const date = normalizeDateInputValue(entry.date) || toDateInputValue(new Date());
  const hasFuelMode = entry.fuelMode !== undefined;
  let fuelCost = toOptionalNumber(entry.fuelCost);
  const kmTotalManual = toOptionalNumber(entry.kmTotalManual ?? entry.kmTotal);
  if (!hasFuelMode && (!fuelCost || fuelCost <= 0)) {
    fuelCost = null;
  }
  const legacyFuelMode = fuelCost === null ? "auto" : "manual";
  const fuelMode = entry.fuelMode === "auto" || entry.fuelMode === "manual" ? entry.fuelMode : legacyFuelMode;

  return {
    id: String(entry.id || createEntryId()),
    date,
    dayType: entry.dayType || "util",
    hoursOnline: toNumber(entry.hoursOnline),
    hoursEffective: toNumber(entry.hoursEffective),
    kmInitial: toNumber(entry.kmInitial),
    kmFinal: toNumber(entry.kmFinal),
    kmTotalManual,
    kmPaid: toNumber(entry.kmPaid),
    grossRevenue: toNumber(entry.grossRevenue),
    tips: toNumber(entry.tips),
    fuelCost,
    fuelMode,
    otherCosts: toNumber(entry.otherCosts),
    maintenancePayments: toNumber(entry.maintenancePayments),
    rides: toNumber(entry.rides),
    weather: entry.weather || "seco",
    fatigue: clamp(toNumber(entry.fatigue) || 3, 1, 5),
    notes: entry.notes || "",
    costSnapshot: normalizeCostSnapshot(entry.costSnapshot, date),
    createdAt: entry.createdAt || entry.updatedAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString()
  };
}

function normalizeCostSnapshot(snapshot, date) {
  if (!snapshot) {
    return null;
  }

  const sourceConfig = normalizeConfig({ ...defaultConfig, ...snapshot });
  return createCostSnapshot(sourceConfig, snapshot.snapshotDate || date, snapshot.source || "entry");
}

function createCostSnapshot(sourceConfig, date, source = "config-history") {
  const normalizedConfig = normalizeConfig(sourceConfig);
  return {
    snapshotDate: isDateInputValue(date) ? date : toDateInputValue(new Date()),
    source,
    gasPricePerLiter: normalizedConfig.gasPricePerLiter,
    consumptionKmPerLiter: normalizedConfig.consumptionKmPerLiter,
    oilPerKm: normalizedConfig.oilPerKm,
    tirePerKm: normalizedConfig.tirePerKm,
    chainPerKm: normalizedConfig.chainPerKm,
    brakePerKm: normalizedConfig.brakePerKm,
    reviewReservePerKm: normalizedConfig.reviewReservePerKm,
    extraMaintenancePerKm: normalizedConfig.extraMaintenancePerKm,
    monthlyInstallment: normalizedConfig.monthlyInstallment,
    monthlyInsurance: normalizedConfig.monthlyInsurance,
    monthlyPhone: normalizedConfig.monthlyPhone,
    monthlyOtherFixed: normalizedConfig.monthlyOtherFixed,
    monthlyFixedCostItems: normalizedConfig.monthlyFixedCostItems
  };
}

function ensureEntryCostSnapshot(entry) {
  const normalized = normalizeEntry(entry);

  if (normalized.costSnapshot) {
    return normalized;
  }

  return {
    ...normalized,
    costSnapshot: createCostSnapshot(getConfigForDate(normalized.date), normalized.date, "migrated")
  };
}

function getConfigForDate(dateValue) {
  const date = isDateInputValue(dateValue) ? dateValue : toDateInputValue(new Date());
  const history = sortConfigHistory(configHistory);
  const selected = history.reduce((current, item) => {
    if (item.effectiveDate <= date) {
      return item;
    }

    return current;
  }, null);

  return normalizeConfig((selected || history[0] || { config }).config || config);
}

function getCalculationConfigForEntry(entry) {
  if (entry.costSnapshot) {
    return normalizeConfig({ ...defaultConfig, ...entry.costSnapshot });
  }

  return getConfigForDate(entry.date);
}

function calculateDailyEntry(entry) {
  const normalized = normalizeEntry(entry);
  const calcConfig = getCalculationConfigForEntry(normalized);
  const entryDate = parseLocalDate(normalized.date);
  const kmFromOdometer = Math.max(0, normalized.kmFinal - normalized.kmInitial);
  const kmTotal = normalized.kmTotalManual !== null && normalized.kmTotalManual > 0 ? normalized.kmTotalManual : kmFromOdometer;
  const kmPaid = clamp(normalized.kmPaid, 0, kmTotal);
  const kmDead = Math.max(0, kmTotal - kmPaid);
  const revenueTotal = normalized.grossRevenue + normalized.tips;
  const fuelEstimated = calcConfig.consumptionKmPerLiter > 0 ? (kmTotal / calcConfig.consumptionKmPerLiter) * calcConfig.gasPricePerLiter : 0;
  const fuelIsEstimated = normalized.fuelMode === "auto" || normalized.fuelCost === null;
  const fuelCostUsed = fuelIsEstimated ? fuelEstimated : normalized.fuelCost;
  const costPerKm = getVariableCostPerKm(calcConfig);
  const wearCost = kmTotal * costPerKm;
  const maintenanceReserve = wearCost;
  const variableCostTotal = fuelCostUsed + normalized.otherCosts + wearCost;
  const operationalProfit = revenueTotal - variableCostTotal;
  const maintenanceCashDelta = maintenanceReserve - normalized.maintenancePayments;
  const fixedCostDay = getFixedCostForDate(normalized.date, calcConfig);
  const netProfitProportional = operationalProfit - fixedCostDay;

  return {
    ...normalized,
    calcConfig,
    entryDate,
    kmFromOdometer,
    kmTotal,
    kmPaid,
    kmDead,
    deadKmPct: safeDivide(kmDead, kmTotal) * 100,
    revenueTotal,
    fuelEstimated,
    fuelIsEstimated,
    fuelCostUsed,
    costPerKm,
    wearCost,
    maintenanceReserve,
    maintenancePayments: normalized.maintenancePayments,
    maintenanceCashDelta,
    variableCostTotal,
    operationalProfit,
    fixedCostDay,
    netProfitProportional,
    operationalMargin: safeDivide(operationalProfit, revenueTotal) * 100,
    netMarginProportional: safeDivide(netProfitProportional, revenueTotal) * 100,
    revenuePerHour: safeDivide(revenueTotal, normalized.hoursOnline),
    operationalProfitPerHour: safeDivide(operationalProfit, normalized.hoursOnline),
    netProfitPerHour: safeDivide(netProfitProportional, normalized.hoursOnline),
    revenuePerKmTotal: safeDivide(revenueTotal, kmTotal),
    revenuePerKmPaid: safeDivide(revenueTotal, kmPaid),
    profitPerKmTotal: safeDivide(netProfitProportional, kmTotal),
    operationalProfitPerKmTotal: safeDivide(operationalProfit, kmTotal)
  };
}

function calculatePeriodMetrics(periodEntries = entries, referenceDate = analysisDate) {
  const referenceDateValue =
    referenceDate instanceof Date ? toDateInputValue(referenceDate) : normalizeDateInputValue(referenceDate) || toDateInputValue(analysisDate);
  const referenceDateObject = parseLocalDate(referenceDateValue);
  const dailyEntries = periodEntries.map(calculateDailyEntry);
  const fixedDates = new Set(dailyEntries.map((entry) => entry.date));
  const fixedCostByDate = dailyEntries.reduce((accumulator, entry) => {
    if (!accumulator.has(entry.date)) {
      accumulator.set(entry.date, entry.fixedCostDay);
    }

    return accumulator;
  }, new Map());
  const fixedCostProportional = [...fixedCostByDate.values()].reduce((sum, value) => sum + value, 0);
  const fixedCostParts = getMonthlyFixedCostParts(getConfigForDate(referenceDateValue), referenceDateObject);
  const metrics = {
    entries: dailyEntries.length,
    daysFilled: fixedDates.size,
    grossRevenue: 0,
    tips: 0,
    revenueTotal: 0,
    fuelCost: 0,
    fuelEstimated: 0,
    otherCosts: 0,
    wearCost: 0,
    maintenanceReserve: 0,
    maintenancePayments: 0,
    maintenanceCashDelta: 0,
    variableCostTotal: 0,
    operationalProfit: 0,
    availableProfit: 0,
    netProfitCompetence: 0,
    netProfitProportional: 0,
    fixedCostParts,
    fixedCostMonthly: fixedCostParts.total,
    fixedCostProportional,
    totalCostCompetence: 0,
    totalCostProportional: 0,
    kmTotal: 0,
    kmPaid: 0,
    kmDead: 0,
    hoursOnline: 0,
    hoursEffective: 0,
    rides: 0,
    operationalMargin: 0,
    realNetMargin: 0,
    proportionalNetMargin: 0,
    deadKmPct: 0,
    revenuePerHour: 0,
    operationalProfitPerHour: 0,
    availableProfitPerHour: 0,
    profitPerHour: 0,
    revenuePerKmTotal: 0,
    revenuePerKmPaid: 0,
    profitPerKmTotal: 0,
    operationalProfitPerKmTotal: 0
  };

  dailyEntries.forEach((entry) => {
    metrics.grossRevenue += entry.grossRevenue;
    metrics.tips += entry.tips;
    metrics.revenueTotal += entry.revenueTotal;
    metrics.fuelCost += entry.fuelCostUsed;
    metrics.fuelEstimated += entry.fuelEstimated;
    metrics.otherCosts += entry.otherCosts;
    metrics.wearCost += entry.wearCost;
    metrics.maintenanceReserve += entry.maintenanceReserve;
    metrics.maintenancePayments += entry.maintenancePayments;
    metrics.maintenanceCashDelta += entry.maintenanceCashDelta;
    metrics.variableCostTotal += entry.variableCostTotal;
    metrics.operationalProfit += entry.operationalProfit;
    metrics.kmTotal += entry.kmTotal;
    metrics.kmPaid += entry.kmPaid;
    metrics.hoursOnline += entry.hoursOnline;
    metrics.hoursEffective += entry.hoursEffective;
    metrics.rides += entry.rides;
  });

  metrics.kmDead = Math.max(0, metrics.kmTotal - metrics.kmPaid);
  metrics.netProfitCompetence = metrics.operationalProfit - metrics.fixedCostMonthly;
  metrics.availableProfit = Math.max(0, metrics.netProfitCompetence);
  metrics.netProfitProportional = metrics.operationalProfit - metrics.fixedCostProportional;
  metrics.totalCostCompetence = metrics.variableCostTotal + metrics.fixedCostMonthly;
  metrics.totalCostProportional = metrics.variableCostTotal + metrics.fixedCostProportional;
  metrics.operationalMargin = safeDivide(metrics.operationalProfit, metrics.revenueTotal) * 100;
  metrics.realNetMargin = safeDivide(metrics.netProfitCompetence, metrics.revenueTotal) * 100;
  metrics.proportionalNetMargin = safeDivide(metrics.netProfitProportional, metrics.revenueTotal) * 100;
  metrics.deadKmPct = safeDivide(metrics.kmDead, metrics.kmTotal) * 100;
  metrics.revenuePerHour = safeDivide(metrics.revenueTotal, metrics.hoursOnline);
  metrics.operationalProfitPerHour = safeDivide(metrics.operationalProfit, metrics.hoursOnline);
  metrics.availableProfitPerHour = safeDivide(metrics.availableProfit, metrics.hoursOnline);
  metrics.profitPerHour = safeDivide(metrics.netProfitProportional, metrics.hoursOnline);
  metrics.revenuePerKmTotal = safeDivide(metrics.revenueTotal, metrics.kmTotal);
  metrics.revenuePerKmPaid = safeDivide(metrics.revenueTotal, metrics.kmPaid);
  metrics.profitPerKmTotal = safeDivide(metrics.netProfitProportional, metrics.kmTotal);
  metrics.operationalProfitPerKmTotal = safeDivide(metrics.operationalProfit, metrics.kmTotal);

  return metrics;
}

function calculateMonthlyProjection() {
  const monthMetrics = calculatePeriodMetrics(getPeriodData("month"));
  const today = startOfDay(new Date());
  const daysInMonth = getDaysInMonth(analysisDate);
  const plannedDays = clamp(config.plannedControlDays || daysInMonth, 1, daysInMonth);
  const daysFilled = monthMetrics.daysFilled;
  const daysLeftInMonth = getDaysLeftInAnalysisMonth(today);
  const remainingPlannedDays = Math.max(0, plannedDays - daysFilled);
  const avgDailyRevenue = safeDivide(monthMetrics.revenueTotal, daysFilled);
  const avgDailyOperationalProfit = safeDivide(monthMetrics.operationalProfit, daysFilled);
  const avgDailyNetProfit = safeDivide(monthMetrics.netProfitProportional, daysFilled);
  const projectedRevenue = avgDailyRevenue * plannedDays;
  const projectedOperationalProfit = avgDailyOperationalProfit * plannedDays;
  const projectedNetProfit = projectedOperationalProfit - monthMetrics.fixedCostMonthly;
  const remainingRevenueForGoal = Math.max(0, config.monthlyRevenueGoal - monthMetrics.revenueTotal);
  const remainingNetForGoal = Math.max(0, config.monthlyNetProfitGoal - monthMetrics.netProfitCompetence);
  const remainingOperationalForGoal = Math.max(0, config.monthlyOperationalProfitGoal - monthMetrics.operationalProfit);

  latestProjection = {
    monthMetrics,
    daysInMonth,
    plannedDays,
    daysFilled,
    daysLeftInMonth,
    remainingPlannedDays,
    avgDailyRevenue,
    avgDailyOperationalProfit,
    avgDailyNetProfit,
    projectedRevenue,
    projectedOperationalProfit,
    projectedNetProfit,
    remainingRevenueForGoal,
    remainingNetForGoal,
    remainingOperationalForGoal,
    revenueGoalDiff: projectedRevenue - config.monthlyRevenueGoal,
    netProfitGoalDiff: projectedNetProfit - config.monthlyNetProfitGoal,
    operationalProfitGoalDiff: projectedOperationalProfit - config.monthlyOperationalProfitGoal,
    neededRevenuePerRemainingDay: safeDivide(remainingRevenueForGoal, Math.max(1, daysLeftInMonth)),
    neededNetProfitPerRemainingDay: safeDivide(remainingNetForGoal, Math.max(1, daysLeftInMonth)),
    neededOperationalPerRemainingDay: safeDivide(remainingOperationalForGoal, Math.max(1, daysLeftInMonth)),
    hoursForRevenueGoal: safeDivide(remainingRevenueForGoal, monthMetrics.revenuePerHour),
    hoursForNetGoal: safeDivide(remainingNetForGoal, Math.max(0, monthMetrics.operationalProfitPerHour))
  };

  return latestProjection;
}

function renderDashboard() {
  const monthMetrics = calculatePeriodMetrics(getPeriodData("month"));
  const projection = calculateMonthlyProjection();
  const hole = getMonthlyHole(monthMetrics);
  const maintenanceCash = calculateMaintenanceCash(analysisDate);
  const financeMetrics = calculateFinanceMetrics();
  const avgHoursPerDay = safeDivide(monthMetrics.hoursOnline, monthMetrics.daysFilled);

  setMoney("monthCompetenceHero", monthMetrics.netProfitCompetence);
  setMoney("monthProportionalHero", monthMetrics.netProfitProportional);
  setMoney("monthOperationalHero", monthMetrics.operationalProfit);
  setMoney("dashboardCashHero", financeMetrics.cashBalance);
  setText(
    "monthRealityNote",
    monthMetrics.netProfitCompetence < 0
      ? "O mes ainda esta no buraco por causa dos custos fixos."
      : "Custos fixos cobertos na visao competencia."
  );

  setMoney("competenceNetProfitMetric", monthMetrics.netProfitCompetence);
  setMoney("proportionalNetProfitMetric", monthMetrics.netProfitProportional);
  setMoney("operationalProfitMetric", monthMetrics.operationalProfit);
  setMoney("monthRevenueMetric", monthMetrics.revenueTotal);
  setText("daysFilledMetric", `${monthMetrics.daysFilled}`);
  setText("avgHoursPerDayMetric", `${formatNumber(avgHoursPerDay)} h`);
  setMoney("cashBalanceMetric", financeMetrics.cashBalance);
  setMoney("maintenanceReserveMetric", monthMetrics.maintenanceReserve);
  setMoney("maintenancePaymentsMetric", monthMetrics.maintenancePayments);
  setMoney("maintenanceCashMetric", maintenanceCash.balance);
  setMoney("monthHoleMetric", hole.remaining);
  setText("operationalMarginMetric", formatPercent(monthMetrics.operationalMargin));
  setText("realNetMarginMetric", formatPercent(monthMetrics.realNetMargin));
  setText("deadKmPctMetric", formatPercent(monthMetrics.deadKmPct));
  setMoney("revenueHourMetric", monthMetrics.revenuePerHour);
  setMoney("profitHourMetric", monthMetrics.operationalProfitPerHour);
  setMoney("monthProjectionMetric", projection.projectedNetProfit);

  [
    ["monthCompetenceHero", monthMetrics.netProfitCompetence],
    ["monthProportionalHero", monthMetrics.netProfitProportional],
    ["monthOperationalHero", monthMetrics.operationalProfit],
    ["dashboardCashHero", financeMetrics.cashBalance],
    ["competenceNetProfitMetric", monthMetrics.netProfitCompetence],
    ["proportionalNetProfitMetric", monthMetrics.netProfitProportional],
    ["operationalProfitMetric", monthMetrics.operationalProfit],
    ["maintenanceCashMetric", maintenanceCash.balance],
    ["profitHourMetric", monthMetrics.operationalProfitPerHour],
    ["monthProjectionMetric", projection.projectedNetProfit]
  ].forEach(([id, value]) => toggleValueTone(id, value));

  renderMonthlyHole(monthMetrics);
  renderDistributionChart(monthMetrics);
  renderProjectionCards(projection);
  renderPeriodSnapshot();
  renderTrendChart();
  renderInsights();
  renderDailyComparison();
}

function renderConfig() {
  const suggestions = getSuggestedPerKmCosts();
  setText("oilPerKmSuggestion", `Sugerido: ${formatPerKm(suggestions.oilPerKm)}`);
  setText("tirePerKmSuggestion", `Sugerido: ${formatPerKm(suggestions.tirePerKm)}`);
  setText("chainPerKmSuggestion", `Sugerido: ${formatPerKm(suggestions.chainPerKm)}`);
  setText("brakePerKmSuggestion", `Sugerido: ${formatPerKm(suggestions.brakePerKm)}`);
  renderFinancingSimulation();
}

function renderTrendChart() {
  const { start, end } = getTrendRange(selectedTrendRange);
  const rows = buildDailyRowsForRange(start, end, true);
  const chart = document.getElementById("trendChart");

  if (!rows.some((row) => row.hasEntries)) {
    chart.innerHTML = '<div class="empty-state">Sem dados suficientes para tendencia.</div>';
    return;
  }

  const width = 760;
  const height = 280;
  const padding = { top: 24, right: 24, bottom: 42, left: 36 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const series = [
    { key: "revenuePerKmTotal", color: chartColors.profit },
    { key: "profitPerKmTotal", color: chartColors.fuel },
    { key: "revenuePerHour", color: chartColors.wear },
    { key: "deadKmPct", color: chartColors.fixed }
  ];

  const paths = series
    .map((item) => {
      const values = rows.map((row) => row[item.key]);
      const min = Math.min(0, ...values);
      const max = Math.max(0, ...values);
      const range = max - min || 1;
      const points = rows.map((row, index) => {
        const x = padding.left + safeDivide(index, Math.max(1, rows.length - 1)) * innerWidth;
        const y = padding.top + innerHeight - ((row[item.key] - min) / range) * innerHeight;
        return [x, y];
      });
      const d = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
      const circles = points
        .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${item.color}" />`)
        .join("");
      return `<path d="${d}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linecap="round" />${circles}`;
    })
    .join("");

  const labelEvery = Math.max(1, Math.ceil(rows.length / 6));
  const labels = rows
    .map((row, index) => {
      if (index % labelEvery !== 0 && index !== rows.length - 1) {
        return "";
      }
      const x = padding.left + safeDivide(index, Math.max(1, rows.length - 1)) * innerWidth;
      return `<text x="${x.toFixed(1)}" y="${height - 14}" text-anchor="middle" fill="#8f98aa" font-size="12">${formatShortDate(row.date)}</text>`;
    })
    .join("");

  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico de tendencia">
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.08)" />
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.08)" />
      <line x1="${padding.left}" y1="${padding.top + innerHeight / 2}" x2="${width - padding.right}" y2="${padding.top + innerHeight / 2}" stroke="rgba(255,255,255,0.06)" />
      ${paths}
      ${labels}
    </svg>
  `;
}

function renderInsights() {
  const monthMetrics = calculatePeriodMetrics(getPeriodData("month"));
  const todayMetrics = calculatePeriodMetrics(getPeriodData("today"));
  const currentWeek = calculatePeriodMetrics(getPeriodData("week"));
  const previousWeek = calculatePeriodMetrics(getEntriesBetween(addDays(startOfWeek(analysisDate), -7), addDays(startOfWeek(analysisDate), -1)));
  const currentSeven = calculatePeriodMetrics(getEntriesBetween(addDays(startOfDay(analysisDate), -6), endOfDay(analysisDate)));
  const previousSeven = calculatePeriodMetrics(getEntriesBetween(addDays(startOfDay(analysisDate), -13), addDays(startOfDay(analysisDate), -7)));
  const averageDailyRevenue = safeDivide(monthMetrics.revenueTotal, monthMetrics.daysFilled);
  const insights = [];

  if (monthMetrics.deadKmPct > 30) {
    insights.push(["danger", "KM morto alto. Voce esta rodando muito sem receber."]);
  }

  if (monthMetrics.netProfitCompetence < 0) {
    insights.push(["danger", "O mes ainda esta no buraco por causa dos custos fixos."]);
  }

  if (previousWeek.revenuePerHour > 0 && currentWeek.revenuePerHour < previousWeek.revenuePerHour) {
    insights.push(["warning", "Sua receita por hora caiu em relacao a semana anterior."]);
  }

  if (previousSeven.revenuePerKmTotal > 0 && currentSeven.revenuePerKmTotal > previousSeven.revenuePerKmTotal) {
    insights.push(["good", "Eficiencia por km melhorou nos ultimos dias."]);
  }

  if (monthMetrics.revenueTotal > 0 && monthMetrics.operationalMargin < 30) {
    insights.push(["warning", "Margem operacional baixa. Revise combustivel, deslocamento ou ticket medio."]);
  }

  if (todayMetrics.entries > 0 && averageDailyRevenue > 0 && todayMetrics.revenueTotal > averageDailyRevenue) {
    insights.push(["good", "Hoje ficou acima da media mensal."]);
  }

  if (todayMetrics.entries > 0 && averageDailyRevenue > 0 && todayMetrics.revenueTotal < averageDailyRevenue) {
    insights.push(["warning", "Hoje ficou abaixo da media mensal."]);
  }

  if (!insights.length) {
    insights.push(["", "Ainda nao ha sinais fortes. Lance mais dias para o app comparar melhor."]);
  }

  document.getElementById("insightsList").innerHTML = insights
    .map(([type, text]) => `<div class="insight-item ${type}">${escapeHtml(text)}</div>`)
    .join("");
}

function renderDailyComparison() {
  const rows = buildDailyRowsForRange(startOfMonth(analysisDate), endOfMonth(analysisDate), false);
  const container = document.getElementById("dailyComparison");

  if (!rows.length) {
    container.innerHTML = '<div class="empty-state">Nenhum dia lancado neste mes.</div>';
    return;
  }

  const bestDay = getExtremeRow(rows, "netProfitProportional", "max");
  const worstDay = getExtremeRow(rows, "netProfitProportional", "min");
  const highestDeadKm = getExtremeRow(rows, "deadKmPct", "max");
  const bestRevenueHour = getExtremeRow(rows, "revenuePerHour", "max");

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Tipo</th>
          <th>Receita</th>
          <th>Lucro operacional</th>
          <th>Lucro liq. prop.</th>
          <th>Reserva manut.</th>
          <th>Pag. manut.</th>
          <th>KM total</th>
          <th>KM remun.</th>
          <th>KM morto</th>
          <th>Receita/h</th>
          <th>Lucro/km</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const badges = [];
            if (row.date === bestDay.date) badges.push('<span class="comparison-badge good">Melhor dia</span>');
            if (row.date === worstDay.date) badges.push('<span class="comparison-badge bad">Pior dia</span>');
            if (row.date === highestDeadKm.date) badges.push('<span class="comparison-badge bad">Maior KM morto</span>');
            if (row.date === bestRevenueHour.date) badges.push('<span class="comparison-badge good">Melhor R$/h</span>');

            return `
              <tr>
                <td>
                  ${formatDate(row.date)}
                  <div class="comparison-badges">${badges.join("")}</div>
                </td>
                <td>${escapeHtml(row.dayType)}</td>
                <td>${formatMoney(row.revenueTotal)}</td>
                <td class="${toneClass(row.operationalProfit)}">${formatMoney(row.operationalProfit)}</td>
                <td class="${toneClass(row.netProfitProportional)}">${formatMoney(row.netProfitProportional)}</td>
                <td>${formatMoney(row.maintenanceReserve)}</td>
                <td>${formatMoney(row.maintenancePayments)}</td>
                <td>${formatNumber(row.kmTotal)} km</td>
                <td>${formatNumber(row.kmPaid)} km</td>
                <td>${formatPercent(row.deadKmPct)}</td>
                <td>${formatMoney(row.revenuePerHour)}</td>
                <td class="${toneClass(row.profitPerKmTotal)}">${formatMoney(row.profitPerKmTotal)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function exportData() {
  const payload = {
    version: 4,
    app: "MotoPlanner",
    exportedAt: new Date().toISOString(),
    config,
    configHistory,
    finance: normalizeFinance(finance),
    entries: entries.map(normalizeEntry)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `motoplanner-${toDateInputValue(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const importedEntries = Array.isArray(parsed) ? parsed : parsed.entries || [];
      const importedConfig = Array.isArray(parsed) ? {} : parsed.config || {};
      const importedConfigHistory = Array.isArray(parsed) ? [] : parsed.configHistory || [];
      const importedFinance = Array.isArray(parsed) ? {} : parsed.finance || {};

      if (!Array.isArray(importedEntries)) {
        throw new Error("Arquivo sem lista de lancamentos.");
      }

      if (!confirm("Importar este JSON e substituir os dados atuais?")) {
        event.target.value = "";
        return;
      }

      config = Object.keys(importedConfig).length ? normalizeConfig(importedConfig) : config;
      finance = Object.keys(importedFinance).length ? normalizeFinance(importedFinance) : finance;
      entries = importedEntries.map(normalizeEntry);
      configHistory = Array.isArray(importedConfigHistory) && importedConfigHistory.length
        ? sortConfigHistory(
            importedConfigHistory
              .filter((item) => item && isDateInputValue(item.effectiveDate))
              .map((item) => ({
                id: String(item.id || createEntryId()),
                effectiveDate: item.effectiveDate,
                createdAt: item.createdAt || new Date().toISOString(),
                updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
                config: normalizeConfig(item.config || {})
              }))
          )
        : createInitialConfigHistory();
      entries = entries.map(ensureEntryCostSnapshot);
      saveConfig();
      saveConfigHistory();
      saveFinance();
      saveEntries();
      fillConfigForm();
      fillFinanceForm();
      resetEntryForm();
      renderAll();
      alert("Dados importados com sucesso.");
    } catch (error) {
      alert("Nao foi possivel importar o JSON.");
      console.error(error);
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function saveEntry(event) {
  event.preventDefault();

  const rawEntry = readEntryForm();
  if (!rawEntry.date) {
    alert("Informe a data no formato DD/MM/AAAA.");
    return;
  }

  const formEntry = normalizeEntry(rawEntry);
  const existingEntry = entries.find((item) => item.id === formEntry.id);
  const entry = attachCostSnapshotForSave(formEntry, existingEntry);
  if (!entry.date) {
    return;
  }

  const existingIndex = entries.findIndex((item) => item.id === entry.id);
  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.push(entry);
  }

  saveEntries();
  resetEntryForm();
  setAnalysisDate(parseLocalDate(entry.date));
}

function attachCostSnapshotForSave(entry, existingEntry) {
  if (existingEntry?.costSnapshot && existingEntry.date === entry.date) {
    return {
      ...entry,
      costSnapshot: existingEntry.costSnapshot
    };
  }

  return {
    ...entry,
    costSnapshot: createCostSnapshot(getConfigForDate(entry.date), entry.date, "entry-save")
  };
}

function readEntryForm() {
  const currentId = document.getElementById("entryId").value;

  return {
    id: currentId || createEntryId(),
    date: normalizeDateInputValue(document.getElementById("entryDate").value),
    dayType: document.getElementById("dayType").value,
    hoursOnline: readNumber("hoursOnline"),
    hoursEffective: readNumber("hoursEffective"),
    kmInitial: readNumber("kmInitial"),
    kmFinal: readNumber("kmFinal"),
    kmTotalManual: readOptionalNumber("kmTotalManual"),
    kmPaid: readNumber("kmPaid"),
    grossRevenue: readNumber("grossRevenue"),
    tips: readNumber("tips"),
    fuelCost: readOptionalNumber("fuelCost"),
    fuelMode: document.getElementById("fuelMode").value,
    otherCosts: readNumber("otherCosts"),
    maintenancePayments: readNumber("maintenancePayments"),
    rides: readNumber("rides"),
    weather: document.getElementById("weather").value,
    fatigue: readNumber("fatigue"),
    notes: document.getElementById("notes").value.trim(),
    updatedAt: new Date().toISOString()
  };
}

function renderHistory() {
  const list = document.getElementById("historyList");
  const sortedEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  selectedEntryIds = new Set([...selectedEntryIds].filter((id) => entries.some((entry) => entry.id === id)));
  updateBulkSelectionUi();

  if (!sortedEntries.length) {
    list.innerHTML = '<div class="empty-state">Nenhum lancamento salvo.</div>';
    return;
  }

  list.innerHTML = sortedEntries
    .map((entry) => {
      const details = calculateDailyEntry(entry);
      const fuelLabel = details.fuelIsEstimated ? "comb. estimado" : "comb. informado";

      return `
        <article class="history-item">
          <label class="history-select" aria-label="Selecionar lancamento de ${formatDate(details.date)}">
            <input type="checkbox" data-select-entry="${escapeHtml(details.id)}" ${selectedEntryIds.has(details.id) ? "checked" : ""} />
          </label>
          <div class="history-main">
            <strong>${formatDate(details.date)}</strong>
            <div class="history-money">
              <span class="history-revenue">${formatMoney(details.revenueTotal)}</span>
              <span>fixo ${formatMoney(details.fixedCostDay)}</span>
              <span>variavel ${formatMoney(details.variableCostTotal)}</span>
              <span>reserva manut. ${formatMoney(details.maintenanceReserve)}</span>
              <span>pag. manut. ${formatMoney(details.maintenancePayments)}</span>
              <span class="history-profit">lucro ${formatMoney(details.netProfitProportional)}</span>
            </div>
            <div class="history-meta">
              <span>${formatNumber(details.kmTotal)} km total</span>
              <span>${formatNumber(details.kmPaid)} km remunerado</span>
              <span>${details.rides} corridas</span>
              <span>${fuelLabel}</span>
            </div>
          </div>
          <div class="history-actions">
            <button type="button" data-duplicate="${escapeHtml(details.id)}">Duplicar</button>
            <button type="button" data-duplicate-many="${escapeHtml(details.id)}">Duplicar N</button>
            <button type="button" data-edit="${escapeHtml(details.id)}">Editar</button>
            <button type="button" data-delete="${escapeHtml(details.id)}">Excluir</button>
          </div>
        </article>
      `;
    })
    .join("");

  list.querySelectorAll("[data-select-entry]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedEntryIds.add(checkbox.dataset.selectEntry);
      } else {
        selectedEntryIds.delete(checkbox.dataset.selectEntry);
      }

      updateBulkSelectionUi();
    });
  });

  list.querySelectorAll("[data-duplicate]").forEach((button) => {
    button.addEventListener("click", () => duplicateEntry(button.dataset.duplicate));
  });

  list.querySelectorAll("[data-duplicate-many]").forEach((button) => {
    button.addEventListener("click", () => duplicateEntryMany(button.dataset.duplicateMany));
  });

  list.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => editEntry(button.dataset.edit));
  });

  list.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteEntry(button.dataset.delete));
  });
}

function updateConfig(event) {
  config = CONFIG_FIELDS.reduce((accumulator, key) => {
    if (key === "controlStartDate") {
      accumulator[key] = normalizeDateInputValue(document.getElementById(key).value) || defaultConfig[key];
      return accumulator;
    }

    if (key === "purchaseStartMonth" || key === "repairStartMonth") {
      accumulator[key] = normalizeMonthInputValue(document.getElementById(key).value) || defaultConfig[key];
      return accumulator;
    }

    if (key === "monthlyFixedCostItems") {
      accumulator[key] = getMonthlyFixedCostItemsFromForm();
      return accumulator;
    }

    accumulator[key] = readNumber(key);
    return accumulator;
  }, {});

  syncSuggestedCostFromParts(event?.target?.id);

  saveConfig();
  upsertConfigHistory(toDateInputValue(new Date()));
  setText(
    "configStatus",
    `Configuracoes salvas as ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Valem a partir de hoje.`
  );
  renderAll();
}

function getPeriodData(period) {
  const { start, end } = getPeriodRange(period);
  return getEntriesBetween(start, end);
}

function renderAll() {
  renderDashboard();
  renderHistory();
  renderEntryPreview();
  renderConfig();
  renderFinance();
}

function renderMonthlyHole(monthMetrics) {
  const hole = getMonthlyHole(monthMetrics);
  setMoney("fixedCostsTotalMetric", hole.total);
  setMoney("fixedCostsCoveredMetric", hole.covered);
  setMoney("fixedCostsRemainingMetric", hole.remaining);
  setText("fixedCostsCoveragePctMetric", formatPercent(hole.coveragePct));
  setText("fixedCostsCoverageText", `Voce ja cobriu ${formatMoney(hole.covered)} de ${formatMoney(hole.total)} em custos fixos.`);
  setText(
    "fixedCostsRemainingText",
    hole.remaining > 0 ? `Faltam ${formatMoney(hole.remaining)} para zerar o mes.` : "Custos fixos cobertos na visao competencia."
  );
  document.getElementById("fixedCostsCoverageBar").style.width = `${clamp(hole.coveragePct, 0, 100)}%`;
  renderFixedCostBreakdown(monthMetrics.fixedCostParts || getMonthlyFixedCostParts(config, analysisDate));
}

function renderFixedCostBreakdown(parts) {
  const container = document.getElementById("fixedCostsBreakdownList");
  if (!container) {
    return;
  }

  const customRows = (parts.customFixedItems || [])
    .filter((item) => item.amount > 0)
    .map((item) => ({
      label: escapeHtml(item.name),
      description: escapeHtml(item.description),
      value: item.amount
    }));

  const rows = [
    { label: "Financiamento", value: parts.financing },
    { label: "Compra parcelada", value: parts.purchase },
    { label: "Conserto parcelado", value: parts.repair },
    { label: "Seguro", value: parts.insurance },
    { label: "Internet/celular", value: parts.phone },
    ...customRows,
    { label: "Outros fixos", value: parts.otherConfiguredFixed }
  ]
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((item) => {
      const descriptionHtml = item.description ? ` <small>${item.description}</small>` : "";
      return `
        <li>
          <span>${item.label}${descriptionHtml}</span>
          <strong>${formatMoney(item.value)}</strong>
        </li>
      `;
    })
    .join("");

  container.innerHTML = rows.length
    ? rows
    : '<li><span>Nao ha custos fixos detalhados para este mes.</span></li>';
}

function getDistributionSlices(monthMetrics) {
  const fixedParts = monthMetrics.fixedCostParts || getMonthlyFixedCostParts(config, analysisDate);

  return [
    { label: "Lucro", value: Math.max(0, monthMetrics.netProfitCompetence), color: distributionColors.profit },
    { label: "Combustivel", value: Math.max(0, monthMetrics.fuelCost), color: distributionColors.fuel },
    { label: "Reserva manutencao", value: Math.max(0, monthMetrics.maintenanceReserve), color: distributionColors.wear },
    { label: "Financiamento", value: Math.max(0, fixedParts.financing), color: distributionColors.financing },
    { label: "Compra parcelada", value: Math.max(0, fixedParts.purchase), color: distributionColors.otherFixed },
    { label: "Conserto parcelado", value: Math.max(0, fixedParts.repair), color: distributionColors.fixedOther },
    { label: "Seguro", value: Math.max(0, fixedParts.insurance), color: distributionColors.insurance },
    { label: "Outros fixos", value: Math.max(0, fixedParts.otherFixed), color: distributionColors.fixedOther },
    { label: "Outros custos", value: Math.max(0, monthMetrics.otherCosts), color: distributionColors.other }
  ];
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
}

function describeDonutSlice(centerX, centerY, outerRadius, innerRadius, startAngle, endAngle) {
  const safeEndAngle = Math.min(endAngle, startAngle + 359.99);
  const outerStart = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, safeEndAngle);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, safeEndAngle);
  const innerStart = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const largeArcFlag = safeEndAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    "Z"
  ].join(" ");
}

function getSliceOffset(angleInDegrees, distance = 8) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: Math.cos(angleInRadians) * distance,
    y: Math.sin(angleInRadians) * distance
  };
}

function getDistributionSliceStyle(slice, offset = { x: 0, y: 0 }) {
  return [
    `--slice-color: rgb(${slice.color})`,
    `--slice-fill: rgba(${slice.color}, 0.2)`,
    `--slice-border: rgba(${slice.color}, 0.8)`,
    `--slice-shadow: rgba(${slice.color}, 0.55)`,
    `--slice-x: ${offset.x.toFixed(2)}px`,
    `--slice-y: ${offset.y.toFixed(2)}px`
  ].join("; ");
}

function renderDistributionSvg(slices, chartTotal) {
  if (chartTotal <= 0) {
    return `
      <svg class="donut-svg" viewBox="0 0 200 200" aria-hidden="true">
        <circle class="donut-empty" cx="100" cy="100" r="72"></circle>
      </svg>
    `;
  }

  let cursor = 0;
  const paths = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const start = cursor;
      const end = cursor + (slice.value / chartTotal) * 360;
      const middle = start + (end - start) / 2;
      const offset = getSliceOffset(middle);
      const path = describeDonutSlice(100, 100, 86, 54, start, end);
      cursor = end;

      return `
        <path
          class="donut-slice"
          d="${path}"
          style="${getDistributionSliceStyle(slice, offset)}"
          aria-label="${slice.label}: ${formatMoney(slice.value)}"
        ></path>
      `;
    })
    .join("");

  return `<svg class="donut-svg" viewBox="0 0 200 200" role="img" aria-label="Distribuicao de lucro e custos">${paths}</svg>`;
}

function renderDistributionChart(monthMetrics) {
  const slices = getDistributionSlices(monthMetrics);
  const chartTotal = slices.reduce((sum, slice) => sum + slice.value, 0);
  const chart = document.getElementById("distributionChart");

  chart.innerHTML = `
    ${renderDistributionSvg(slices, chartTotal)}
    <span id="chartCenterValue" class="${toneClass(monthMetrics.netProfitCompetence)}">${compactMoney(monthMetrics.netProfitCompetence)}</span>
    <small>lucro</small>
  `;

  setText(
    "chartNote",
    monthMetrics.netProfitCompetence < 0 ? "Lucro negativo: a fatia de lucro fica zerada para nao esconder prejuizo." : ""
  );

  document.getElementById("chartLegend").innerHTML = slices
    .map(
      (slice) => `
        <div class="legend-row">
          <div><span class="legend-dot" style="${getDistributionSliceStyle(slice)}"></span>${slice.label}</div>
          <strong>${formatMoney(slice.value)}</strong>
        </div>
      `
    )
    .join("");
}

function renderProjectionCards(projection) {
  const hourNetGoal = formatGoalHours(projection.remainingNetForGoal, projection.hoursForNetGoal);
  const hourRevenueGoal = formatGoalHours(projection.remainingRevenueForGoal, projection.hoursForRevenueGoal);
  const cards = [
    ["Media diaria receita", formatMoney(projection.avgDailyRevenue)],
    ["Media diaria lucro op.", formatMoney(projection.avgDailyOperationalProfit)],
    ["Media diaria lucro liq.", formatMoney(projection.avgDailyNetProfit)],
    ["Receita projetada", formatMoney(projection.projectedRevenue)],
    ["Lucro op. projetado", formatMoney(projection.projectedOperationalProfit)],
    ["Lucro liq. projetado", formatMoney(projection.projectedNetProfit)],
    ["Dif. meta receita", formatSignedMoney(projection.revenueGoalDiff)],
    ["Dif. meta lucro liq.", formatSignedMoney(projection.netProfitGoalDiff)],
    ["Dias faltam no mes", `${projection.daysLeftInMonth}`],
    ["Receita/dia necessaria", formatMoney(projection.neededRevenuePerRemainingDay)],
    ["Lucro/dia necessario", formatMoney(projection.neededNetProfitPerRemainingDay)],
    ["Horas p/ meta receita", hourRevenueGoal],
    ["Horas p/ meta lucro", hourNetGoal]
  ];

  document.getElementById("projectionGrid").innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="projection-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function renderPeriodSnapshot() {
  const metrics = calculatePeriodMetrics(getPeriodData(selectedPeriod));
  setText("periodTitle", periodNames[selectedPeriod]);
  setText("periodEntryCount", pluralize(metrics.entries, "lancamento"));

  const cards = [
    ["Receita", formatMoney(metrics.revenueTotal)],
    ["Lucro operacional", formatMoney(metrics.operationalProfit)],
    ["Lucro liq. prop.", formatMoney(metrics.netProfitProportional)],
    ["Reserva manut.", formatMoney(metrics.maintenanceReserve)],
    ["Pag. manut.", formatMoney(metrics.maintenancePayments)],
    ["KM morto", formatPercent(metrics.deadKmPct)],
    ["Receita/h", formatMoney(metrics.revenuePerHour)],
    ["Lucro/km", formatMoney(metrics.profitPerKmTotal)]
  ];

  document.getElementById("periodSnapshotGrid").innerHTML = cards
    .map(
      ([label, value]) => `
        <article>
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function renderEntryPreview() {
  const entry = normalizeEntry(readEntryForm());
  const daily = calculateDailyEntry(entry);
  setText("fuelEstimateNote", `Combustivel estimado: ${formatMoney(daily.fuelEstimated)}. Usado no calculo: ${formatMoney(daily.fuelCostUsed)}.`);

  const cards = [
    ["Receita total", formatMoney(daily.revenueTotal)],
    ["KM total", `${formatNumber(daily.kmTotal)} km`],
    ["KM morto", `${formatNumber(daily.kmDead)} km`],
    ["Combustivel", formatMoney(daily.fuelCostUsed)],
    ["Reserva manutencao", formatMoney(daily.maintenanceReserve)],
    ["Pagamento manut.", formatMoney(daily.maintenancePayments)],
    ["Saldo caixa manut.", formatSignedMoney(daily.maintenanceCashDelta)],
    ["Lucro operacional", formatMoney(daily.operationalProfit)],
    ["Fixo do dia", formatMoney(daily.fixedCostDay)],
    ["Lucro liq. prop.", formatMoney(daily.netProfitProportional)]
  ];

  document.getElementById("entryPreview").innerHTML = cards
    .map(
      ([label, value]) => `
        <article>
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function renderFinancingSimulation() {
  const projection = latestProjection || calculateMonthlyProjection();
  const amortization = Math.max(0, config.amortizationSimulationAmount);
  const currentDebt = Math.max(0, config.debtBalance);
  const remainingDebt = Math.max(0, currentDebt - amortization);
  const principalPerInstallment = safeDivide(currentDebt, config.remainingInstallments);
  const estimatedInstallmentsReduced = principalPerInstallment > 0 ? Math.floor(amortization / principalPerInstallment) : 0;
  const estimatedMonthsAfter = principalPerInstallment > 0 ? Math.ceil(remainingDebt / principalPerInstallment) : 0;
  const nextMonthInterestSaved = amortization * safeDivide(config.monthlyInterestRate, 100);
  const cards = [
    ["Lucro liq. projetado", formatMoney(projection.projectedNetProfit)],
    ["Saldo apos amortizar", formatMoney(remainingDebt)],
    ["Parcelas reduzidas", `${estimatedInstallmentsReduced}`],
    ["Meses estimados restantes", `${estimatedMonthsAfter}`],
    ["Juros evitado prox. mes", formatMoney(nextMonthInterestSaved)]
  ];

  document.getElementById("financingSimulation").innerHTML = cards
    .map(
      ([label, value]) => `
        <article>
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function renderFinance() {
  if (!finance) {
    return;
  }

  const metrics = calculateFinanceMetrics();
  setMoney("financeRemainingHero", metrics.remainingNominal);
  setMoney("cashBalanceHero", metrics.cashBalance);
  setMoney("interestSavedHero", metrics.discountSaved);
  setText(
    "financeSummaryNote",
    metrics.schedule.length
      ? `${metrics.paidInstallments} de ${metrics.totalInstallments} parcelas pagas. Falta ${formatMoney(metrics.remainingNominal)} nominal.`
      : "Cadastre o contrato para enxergar parcelas, juros e pagamentos."
  );

  setMoney("financeTotalMetric", metrics.totalWithDownPayment);
  setMoney("financeNominalMetric", metrics.nominalInstallmentsTotal);
  setMoney("financeRemainingMetric", metrics.remainingNominal);
  setMoney("financeAmortizedMetric", metrics.amortizedAmount);
  setText("financeRateMetric", `${formatPercent(metrics.monthlyRate * 100)} a.m.`);
  setText("financeOpenInstallmentsMetric", `${metrics.openInstallments}`);
  setText("financePaidInstallmentsMetric", `${metrics.paidInstallments}`);
  setMoney("financeCashMetric", metrics.cashBalance);

  const rateInput = document.getElementById("financeAutoRate");
  if (rateInput) {
    rateInput.value = `${formatPercent(metrics.monthlyRate * 100)} a.m.`;
  }

  [
    ["cashBalanceHero", metrics.cashBalance],
    ["financeCashMetric", metrics.cashBalance],
    ["interestSavedHero", metrics.discountSaved],
    ["financeAmortizedMetric", metrics.amortizedAmount]
  ].forEach(([id, value]) => toggleValueTone(id, value));

  renderFinanceProgress(metrics);
  renderFinanceProjection(metrics);
  renderSelectedInstallmentsSummary(metrics);
  renderInstallmentsTable(metrics);
  renderAmortizationHistory(metrics);
}

function renderFinanceProgress(metrics) {
  const container = document.getElementById("financeProgressSummary");
  if (!container) {
    return;
  }

  if (!metrics.schedule.length) {
    container.innerHTML = '<div class="empty-state">Informe os dados do contrato para acompanhar o progresso.</div>';
    return;
  }

  const paidPct = clamp(metrics.paidNominalPct, 0, 100);
  const openPct = clamp(100 - paidPct, 0, 100);
  const totalPrincipalPct = clamp(safeDivide(metrics.totalPrincipal, metrics.nominalInstallmentsTotal) * 100, 0, 100);
  const totalInterestPct = clamp(safeDivide(metrics.totalInterest, metrics.nominalInstallmentsTotal) * 100, 0, 100);

  container.innerHTML = `
    <div class="finance-progress-stats">
      <article>
        <span>Nominal das pagas</span>
        <strong>${formatMoney(metrics.paidNominal)}</strong>
        <small>${formatPercent(paidPct)} do nominal</small>
      </article>
      <article>
        <span>Valor pago real</span>
        <strong>${formatMoney(metrics.paymentAmountTotal)}</strong>
        <small>saiu do caixa</small>
      </article>
      <article>
        <span>Amortizacao/desconto</span>
        <strong>${formatMoney(metrics.discountSaved)}</strong>
        <small>diferenca nominal - pago</small>
      </article>
      <article>
        <span>Falta pagar</span>
        <strong>${formatMoney(metrics.remainingNominal)}</strong>
        <small>${metrics.openInstallments} parcelas normais</small>
      </article>
    </div>

    <div class="finance-bar-block">
      <div class="finance-bar-labels">
        <span>Nominal pago ${formatMoney(metrics.paidNominal)}</span>
        <span>Falta ${formatMoney(metrics.remainingNominal)}</span>
      </div>
      <div class="finance-payment-track" aria-label="Progresso nominal pago">
        <span class="finance-payment-paid" style="width: ${paidPct}%"></span>
        <span class="finance-payment-open" style="width: ${openPct}%"></span>
      </div>
    </div>

    <div class="finance-bar-block">
      <div class="finance-bar-labels">
        <span>Composicao nominal das parcelas</span>
        <span>${formatMoney(metrics.totalPrincipal)} + ${formatMoney(metrics.totalInterest)}</span>
      </div>
      <div class="finance-composition-track" aria-label="Composicao entre divida e juros">
        <span class="finance-debt-segment" style="width: ${totalPrincipalPct}%"></span>
        <span class="finance-interest-segment" style="width: ${totalInterestPct}%"></span>
      </div>
    </div>

    <div class="finance-progress-legend">
      <span><i class="legend-swatch paid"></i>Pago</span>
      <span><i class="legend-swatch open"></i>Falta pagar</span>
      <span><i class="legend-swatch debt"></i>Divida/principal</span>
      <span><i class="legend-swatch interest"></i>Juros</span>
    </div>
  `;
}

function renderFinanceProjection(metrics) {
  const cards = [
    ["Entrada fora do caixa", formatMoney(finance.downPayment)],
    ["Caixa inicial", formatMoney(metrics.cashOpeningBalance)],
    ["Lucro disponivel acumulado", formatMoney(metrics.operationCashResult)],
    ["Retirada de lucros", formatMoney(metrics.profitWithdrawal)],
    ["Pago no mes", formatMoney(metrics.paymentAmountInAnalysisMonth)],
    ["Amortizado no mes", formatMoney(metrics.discountSavedInAnalysisMonth)],
    ["Pagamentos registrados", formatMoney(metrics.paymentAmountTotal)],
    ["Amortizacao total", formatMoney(metrics.discountSaved)],
    ["Caixa atual", formatMoney(metrics.cashBalance)],
    ["Principal aberto", formatMoney(metrics.remainingPrincipal)],
    ["Juros aberto", formatMoney(metrics.remainingInterest)]
  ];

  document.getElementById("financeProjectionGrid").innerHTML = cards
    .map(
      ([label, value]) => `
        <article>
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function renderSelectedInstallmentsSummary(metrics = calculateFinanceMetrics()) {
  const summary = document.getElementById("selectedInstallmentsSummary");
  if (!summary) {
    return;
  }

  if (!metrics.selectedInstallments.length) {
    summary.textContent = "Nenhuma parcela selecionada.";
    return;
  }

  const selectedLabel = metrics.selectedInstallments.length === 1 ? "1 parcela selecionada" : `${metrics.selectedInstallments.length} parcelas selecionadas`;
  const amountInput = readOptionalNumber("amortizationAmount");
  const paidAmount = amountInput !== null && amountInput > 0 ? amountInput : metrics.selectedNominal;
  const discount = Math.max(0, round(metrics.selectedNominal - paidAmount, 2));
  const discountText = discount > 0 ? ` Amortizacao/desconto: ${formatMoney(discount)}.` : ` Amortizacao: ${formatMoney(0)}.`;
  summary.textContent = `${selectedLabel}. Nominal: ${formatMoney(metrics.selectedNominal)}. Valor pago: ${formatMoney(
    paidAmount
  )}.${discountText} Campo em branco usa o valor nominal.`;
}

function renderInstallmentsTable(metrics = calculateFinanceMetrics()) {
  const container = document.getElementById("installmentsTable");
  if (!container) {
    return;
  }

  if (!metrics.schedule.length) {
    container.innerHTML = '<div class="empty-state">Informe valor financiado, quantidade de parcelas e valor da parcela.</div>';
    return;
  }

  container.innerHTML = `
    <table class="installments-table">
      <thead>
        <tr>
          <th>Sel.</th>
          <th>Parcela</th>
          <th>Vencimento</th>
          <th>Valor</th>
          <th>Valor pago</th>
          <th>Amortizacao</th>
          <th>Composicao</th>
          <th>Juros</th>
          <th>Principal</th>
          <th>Saldo apos</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${metrics.schedule
          .map((installment) => {
            const isPaid = metrics.paidInstallmentSet.has(installment.number);
            const isSelected = selectedFinanceInstallments.has(installment.number) && !isPaid;
            const amortizedInfo = metrics.amortizedByInstallment.get(installment.number);
            const selectedPreview = !isPaid && isSelected ? getSelectedInstallmentPreview(installment, metrics) : null;
            const hasDiscount = amortizedInfo ? round(amortizedInfo.amount, 2) < round(amortizedInfo.nominal, 2) : false;
            const statusClass = isPaid ? (hasDiscount ? "paid discounted" : "paid full") : isSelected ? "selected" : "normal";
            const statusLabel = isPaid ? (hasDiscount ? "Amortizada" : "Paga") : isSelected ? "Selecionada" : "Normal";

            return `
              <tr class="${isPaid ? "installment-paid" : "installment-open"} ${isSelected ? "installment-selected" : ""}">
                <td>
                  <input
                    type="checkbox"
                    data-installment-number="${installment.number}"
                    aria-label="Selecionar parcela ${installment.number}"
                    ${isPaid || isSelected ? "checked" : ""}
                    ${isPaid ? "disabled" : ""}
                  />
                </td>
                <td>${installment.number}</td>
                <td>${formatDate(installment.dueDate)}</td>
                <td>${formatMoney(installment.payment)}</td>
                <td>${renderAmortizedInstallmentValue(amortizedInfo, selectedPreview)}</td>
                <td>${renderInstallmentAmortizationValue(amortizedInfo, selectedPreview)}</td>
                <td>${renderInstallmentComposition(installment)}</td>
                <td>${formatMoney(installment.interest)}</td>
                <td>${formatMoney(installment.principal)}</td>
                <td>${formatMoney(installment.balanceAfter)}</td>
                <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  container.querySelectorAll("[data-installment-number]").forEach((checkbox) => {
    checkbox.addEventListener("click", (event) => {
      const number = Math.trunc(toNumber(checkbox.dataset.installmentNumber));
      updateInstallmentSelection(number, checkbox.checked, event.shiftKey, metrics);
      lastSelectedFinanceInstallment = number;

      renderFinance();
    });
  });
}

function updateInstallmentSelection(number, isChecked, isRangeSelection, metrics = calculateFinanceMetrics()) {
  const paidSet = metrics.paidInstallmentSet || new Set();

  if (isRangeSelection && lastSelectedFinanceInstallment !== null) {
    const start = Math.min(lastSelectedFinanceInstallment, number);
    const end = Math.max(lastSelectedFinanceInstallment, number);

    for (let current = start; current <= end; current += 1) {
      if (!paidSet.has(current)) {
        if (isChecked) {
          selectedFinanceInstallments.add(current);
        } else {
          selectedFinanceInstallments.delete(current);
        }
      }
    }

    return;
  }

  if (isChecked) {
    selectedFinanceInstallments.add(number);
  } else {
    selectedFinanceInstallments.delete(number);
  }
}

function renderAmortizedInstallmentValue(amortizedInfo, selectedPreview) {
  if (amortizedInfo) {
    return `
      <div class="amortized-value">
        <strong>${formatMoney(amortizedInfo.amount)}</strong>
      </div>
    `;
  }

  if (selectedPreview) {
    return `
      <div class="amortized-value preview">
        <strong>${formatMoney(selectedPreview.amount)}</strong>
      </div>
    `;
  }

  return '<span class="muted-cell">-</span>';
}

function renderInstallmentAmortizationValue(amortizedInfo, selectedPreview) {
  const source = amortizedInfo || selectedPreview;
  if (!source) {
    return '<span class="muted-cell">-</span>';
  }

  const discount = Math.max(0, round(source.nominal - source.amount, 2));
  const className = discount > 0 ? "amortization-delta positive" : "amortization-delta";

  return `
    <div class="${className}">
      <strong>${formatMoney(discount)}</strong>
      <span>${discount > 0 ? "nominal - pago" : "sem desconto"}</span>
    </div>
  `;
}

function getSelectedInstallmentPreview(installment, metrics) {
  const selectedNominal = metrics.selectedNominal;
  if (selectedNominal <= 0) {
    return null;
  }

  const amountInput = readOptionalNumber("amortizationAmount");
  const paidAmount = amountInput !== null && amountInput > 0 ? amountInput : selectedNominal;
  return {
    amount: safeDivide(paidAmount * installment.payment, selectedNominal),
    nominal: installment.payment
  };
}

function renderInstallmentComposition(installment) {
  const total = Math.max(installment.payment, installment.principal + installment.interest);
  const principalPct = clamp(safeDivide(installment.principal, total) * 100, 0, 100);
  const interestPct = clamp(safeDivide(installment.interest, total) * 100, 0, 100);

  return `
    <div class="installment-composition">
      <div class="installment-composition-values">
        <span><i class="composition-dot debt"></i>Divida ${formatMoney(installment.principal)}</span>
        <span><i class="composition-dot interest"></i>Juros ${formatMoney(installment.interest)}</span>
      </div>
      <div class="installment-composition-bar" aria-label="Composicao da parcela">
        <span class="composition-debt" style="width: ${principalPct}%"></span>
        <span class="composition-interest" style="width: ${interestPct}%"></span>
      </div>
    </div>
  `;
}

function renderAmortizationHistory(metrics = calculateFinanceMetrics()) {
  const container = document.getElementById("amortizationHistory");
  if (!container) {
    return;
  }

  if (!finance.amortizations.length) {
    container.innerHTML = '<div class="empty-state">Nenhum pagamento registrado.</div>';
    return;
  }

  const scheduleByNumber = createScheduleByNumber(metrics.schedule);

  container.innerHTML = [...finance.amortizations]
    .sort((a, b) => b.month.localeCompare(a.month) || b.createdAt.localeCompare(a.createdAt))
    .map((item) => {
      const nominalAmount = getPaymentNominalAmount(item, scheduleByNumber);
      const discount = getPaymentDiscount(item, scheduleByNumber);
      const parcelsLabel = item.selectedInstallments.length ? `Parcelas: ${item.selectedInstallments.join(", ")}` : "Sem parcelas vinculadas";

      return `
        <article class="amortization-item">
          <header>
            <div>
              <strong>${isoMonthToBrazilMonth(item.month)} - ${formatMoney(item.amount)}</strong>
              <span>${parcelsLabel}</span>
            </div>
            <button type="button" data-delete-amortization="${escapeHtml(item.id)}">Excluir</button>
          </header>
          ${nominalAmount > 0 ? `<p>Nominal das parcelas: ${formatMoney(nominalAmount)}. Valor pago: ${formatMoney(item.amount)}.</p>` : ""}
          ${discount > 0 ? `<p>Amortizacao/desconto: ${formatMoney(discount)}</p>` : ""}
          ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("[data-delete-amortization]").forEach((button) => {
    button.addEventListener("click", () => deleteAmortization(button.dataset.deleteAmortization));
  });
}

function updateFinance() {
  finance = normalizeFinance({ ...finance, ...readFinanceForm() });
  const paidSet = getAmortizedInstallmentNumbers();
  selectedFinanceInstallments = new Set(
    [...selectedFinanceInstallments].filter((number) => number > 0 && number <= finance.totalInstallments && !paidSet.has(number))
  );
  if (lastSelectedFinanceInstallment !== null && !selectedFinanceInstallments.has(lastSelectedFinanceInstallment)) {
    lastSelectedFinanceInstallment = null;
  }
  saveFinance();
  setText(
    "financeFormStatus",
    `Financiamento salvo as ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
  );
  renderDashboard();
  renderConfig();
  renderFinance();
}

function readFinanceForm() {
  const currentFinance = finance || getDefaultFinance();
  const firstDueDate = normalizeDateInputValue(document.getElementById("financeFirstDueDate").value) || currentFinance.firstDueDate;

  return {
    downPayment: readNumber("financeDownPayment"),
    financedAmount: readNumber("financeFinancedAmount"),
    totalInstallments: Math.max(0, Math.trunc(readNumber("financeTotalInstallments"))),
    installmentAmount: readNumber("financeInstallmentAmount"),
    firstDueDate,
    cashOpeningBalance: readNumber("financeCashOpeningBalance"),
    profitWithdrawal: readNumber("financeProfitWithdrawal"),
    amortizations: currentFinance.amortizations
  };
}

function fillFinanceForm() {
  if (!finance) {
    return;
  }

  const fields = {
    financeDownPayment: finance.downPayment,
    financeFinancedAmount: finance.financedAmount,
    financeTotalInstallments: finance.totalInstallments,
    financeInstallmentAmount: finance.installmentAmount,
    financeCashOpeningBalance: finance.cashOpeningBalance,
    financeProfitWithdrawal: finance.profitWithdrawal
  };

  Object.entries(fields).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) {
      input.value = formatInputValue(input, value);
    }
  });

  document.getElementById("financeFirstDueDate").value = isoToBrazilDate(finance.firstDueDate);
  document.getElementById("amortizationMonth").value = isoMonthToBrazilMonth(toMonthInputValue(analysisDate));
}

function saveAmortization(event) {
  event.preventDefault();
  const monthInput = document.getElementById("amortizationMonth").value;
  const month = normalizeMonthInputValue(monthInput) || toMonthInputValue(analysisDate);

  if (monthInput.trim() && !normalizeMonthInputValue(monthInput)) {
    alert("Informe o mes no formato MM/AAAA.");
    return;
  }

  const paidSet = getAmortizedInstallmentNumbers();
  const selectedInstallments = [...selectedFinanceInstallments]
    .filter((number) => !paidSet.has(number))
    .sort((a, b) => a - b);
  const metrics = calculateFinanceMetrics();
  const amountInput = readOptionalNumber("amortizationAmount");
  const amount = amountInput !== null && amountInput > 0 ? amountInput : metrics.selectedNominal;

  if (!selectedInstallments.length) {
    alert("Selecione ao menos uma parcela para registrar o pagamento.");
    return;
  }

  if (amount <= 0) {
    alert("Informe um valor pago ou deixe o campo em branco para usar o valor nominal.");
    return;
  }

  if (round(amount, 2) > round(metrics.selectedNominal, 2)) {
    alert("O valor pago nao pode ser maior que o nominal das parcelas selecionadas.");
    return;
  }

  const amortization = normalizeAmortization(
    {
      id: createEntryId(),
      month,
      amount,
      selectedInstallments,
      notes: document.getElementById("amortizationNotes").value.trim(),
      createdAt: new Date().toISOString()
    },
    finance.totalInstallments
  );

  finance.amortizations.push(amortization);
  finance = normalizeFinance(finance);
  selectedFinanceInstallments.clear();
  lastSelectedFinanceInstallment = null;
  saveFinance();
  document.getElementById("amortizationForm").reset();
  document.getElementById("amortizationMonth").value = isoMonthToBrazilMonth(month);
  renderAll();
}

function deleteAmortization(id) {
  if (!confirm("Excluir este pagamento?")) {
    return;
  }

  finance.amortizations = finance.amortizations.filter((item) => item.id !== id);
  finance = normalizeFinance(finance);
  saveFinance();
  renderAll();
}

function selectOpenInstallments() {
  const paidSet = getAmortizedInstallmentNumbers();
  selectedFinanceInstallments = new Set(buildInstallmentSchedule().filter((item) => !paidSet.has(item.number)).map((item) => item.number));
  lastSelectedFinanceInstallment = null;
  renderFinance();
}

function clearInstallmentSelection() {
  selectedFinanceInstallments.clear();
  lastSelectedFinanceInstallment = null;
  renderFinance();
}

function calculateFinanceMetrics() {
  const normalizedFinance = normalizeFinance(finance);
  const schedule = buildInstallmentSchedule(normalizedFinance);
  const paidInstallmentSet = getAmortizedInstallmentNumbers(normalizedFinance);
  selectedFinanceInstallments = new Set([...selectedFinanceInstallments].filter((number) => !paidInstallmentSet.has(number)));

  const paidSchedule = schedule.filter((item) => paidInstallmentSet.has(item.number));
  const openSchedule = schedule.filter((item) => !paidInstallmentSet.has(item.number));
  const selectedSchedule = schedule.filter((item) => selectedFinanceInstallments.has(item.number) && !paidInstallmentSet.has(item.number));
  const amortizedByInstallment = getAmortizationBreakdown(schedule, normalizedFinance.amortizations);
  const scheduleByNumber = createScheduleByNumber(schedule);
  const paymentsInAnalysisMonth = normalizedFinance.amortizations.filter((item) => item.month === toMonthInputValue(analysisDate));
  const paymentAmountTotal = normalizedFinance.amortizations.reduce((sum, item) => sum + item.amount, 0);
  const paymentAmountInAnalysisMonth = paymentsInAnalysisMonth.reduce((sum, item) => sum + item.amount, 0);
  const operationCashResult = calculateOperationCashResult();
  const monthlyRate = solveMonthlyInterestRate(
    normalizedFinance.financedAmount,
    normalizedFinance.installmentAmount,
    normalizedFinance.totalInstallments
  );
  const nominalInstallmentsTotal = normalizedFinance.totalInstallments * normalizedFinance.installmentAmount;
  const paidNominal = paidSchedule.reduce((sum, item) => sum + item.payment, 0);
  const totalPrincipal = schedule.reduce((sum, item) => sum + item.principal, 0);
  const totalInterest = schedule.reduce((sum, item) => sum + item.interest, 0);
  const discountSaved = [...amortizedByInstallment.values()].reduce((sum, item) => {
    return sum + Math.max(0, round(item.nominal - item.amount, 2));
  }, 0);
  const discountSavedInAnalysisMonth = paymentsInAnalysisMonth.reduce((sum, item) => {
    return sum + getPaymentDiscount(item, scheduleByNumber);
  }, 0);

  return {
    schedule,
    paidInstallmentSet,
    amortizedByInstallment,
    selectedInstallments: selectedSchedule.map((item) => item.number),
    totalInstallments: schedule.length,
    paidInstallments: paidSchedule.length,
    openInstallments: openSchedule.length,
    nominalInstallmentsTotal,
    totalWithDownPayment: normalizedFinance.downPayment + nominalInstallmentsTotal,
    paidNominal,
    paymentAmountTotal,
    paymentAmountInAnalysisMonth,
    paidPrincipal: paidSchedule.reduce((sum, item) => sum + item.principal, 0),
    paidInterest: paidSchedule.reduce((sum, item) => sum + item.interest, 0),
    totalPrincipal,
    totalInterest,
    paidNominalPct: nominalInstallmentsTotal > 0 ? safeDivide(paidNominal, nominalInstallmentsTotal) * 100 : 0,
    remainingNominal: openSchedule.reduce((sum, item) => sum + item.payment, 0),
    remainingPrincipal: openSchedule.reduce((sum, item) => sum + item.principal, 0),
    remainingInterest: openSchedule.reduce((sum, item) => sum + item.interest, 0),
    amortizedAmount: paymentAmountTotal,
    amortizedInAnalysisMonth: paymentAmountInAnalysisMonth,
    discountSaved,
    discountSavedInAnalysisMonth,
    selectedNominal: selectedSchedule.reduce((sum, item) => sum + item.payment, 0),
    operationCashResult,
    cashBalance: normalizedFinance.cashOpeningBalance + operationCashResult - paymentAmountTotal - normalizedFinance.profitWithdrawal,
    monthlyRate,
    cashOpeningBalance: normalizedFinance.cashOpeningBalance,
    profitWithdrawal: normalizedFinance.profitWithdrawal
  };
}

function calculateOperationCashResult() {
  if (!entries.length) {
    return 0;
  }

  const today = startOfDay(new Date());
  const start = startOfMonth(parseLocalDate(config.controlStartDate || toDateInputValue(today)));
  const latestEntryDate = entries.reduce((latest, entry) => {
    const entryDate = parseLocalDate(entry.date);
    return entryDate > latest ? entryDate : latest;
  }, parseLocalDate(entries[0].date));
  const end = endOfMonth(latestEntryDate);

  if (start > end) {
    return 0;
  }

  let total = 0;
  for (let cursor = start; cursor <= end; cursor = addMonths(cursor, 1)) {
    const monthEntries = getEntriesBetween(startOfMonth(cursor), endOfMonth(cursor));
    if (monthEntries.length) {
      total += calculatePeriodMetrics(monthEntries, cursor).availableProfit;
    }
  }

  return total;
}

function calculateMaintenanceCash(referenceDate = analysisDate) {
  const targetDate = referenceDate instanceof Date ? referenceDate : parseLocalDate(referenceDate);
  const start = startOfMonth(parseLocalDate(config.controlStartDate || toDateInputValue(targetDate)));
  const monthStart = startOfMonth(targetDate);
  const monthEnd = endOfMonth(targetDate);
  const targetEnd = monthEnd;

  return entries.map(calculateDailyEntry).reduce(
    (cash, entry) => {
      const entryDate = parseLocalDate(entry.date);

      if (entryDate < start || entryDate > targetEnd) {
        return cash;
      }

      cash.reserveTotal += entry.maintenanceReserve;
      cash.paymentsTotal += entry.maintenancePayments;

      if (entryDate >= monthStart && entryDate <= monthEnd) {
        cash.reserveInMonth += entry.maintenanceReserve;
        cash.paymentsInMonth += entry.maintenancePayments;
      }

      cash.balance = cash.reserveTotal - cash.paymentsTotal;
      cash.monthDelta = cash.reserveInMonth - cash.paymentsInMonth;
      return cash;
    },
    {
      reserveTotal: 0,
      paymentsTotal: 0,
      reserveInMonth: 0,
      paymentsInMonth: 0,
      monthDelta: 0,
      balance: 0
    }
  );
}

function getAmortizedInstallmentNumbers(sourceFinance = finance) {
  const normalizedFinance = normalizeFinance(sourceFinance || getDefaultFinance());
  return normalizedFinance.amortizations.reduce((numbers, item) => {
    item.selectedInstallments.forEach((number) => numbers.add(number));
    return numbers;
  }, new Set());
}

function getInstallmentPaymentMonthMap(sourceFinance = finance) {
  const normalizedFinance = normalizeFinance(sourceFinance || getDefaultFinance());

  return normalizedFinance.amortizations.reduce((months, item) => {
    item.selectedInstallments.forEach((number) => {
      const previousMonth = months.get(number);
      if (!previousMonth || item.month < previousMonth) {
        months.set(number, item.month);
      }
    });

    return months;
  }, new Map());
}

function getFinancingInstallmentCostForMonth(dateValue, sourceFinance = finance) {
  const targetDate = dateValue instanceof Date ? dateValue : parseLocalDate(dateValue);
  const targetMonth = toMonthInputValue(targetDate);
  const normalizedFinance = normalizeFinance(sourceFinance || getDefaultFinance());
  const schedule = buildInstallmentSchedule(normalizedFinance);

  if (!schedule.length) {
    return 0;
  }

  const paymentMonthByInstallment = getInstallmentPaymentMonthMap(normalizedFinance);

  return schedule.reduce((sum, installment) => {
    const dueMonth = toMonthInputValue(parseLocalDate(installment.dueDate));
    const paymentMonth = paymentMonthByInstallment.get(installment.number);
    const wasPaidByTargetMonth = paymentMonth && paymentMonth <= targetMonth;

    if (dueMonth !== targetMonth || wasPaidByTargetMonth) {
      return sum;
    }

    return sum + installment.payment;
  }, 0);
}

function createScheduleByNumber(schedule) {
  return schedule.reduce((accumulator, installment) => {
    accumulator.set(installment.number, installment);
    return accumulator;
  }, new Map());
}

function getPaymentNominalAmount(payment, scheduleByNumber) {
  return payment.selectedInstallments.reduce((sum, number) => {
    return sum + (scheduleByNumber.get(number)?.payment || 0);
  }, 0);
}

function getPaymentDiscount(payment, scheduleByNumber) {
  return Math.max(0, round(getPaymentNominalAmount(payment, scheduleByNumber) - payment.amount, 2));
}

function getAmortizationBreakdown(schedule, amortizations = []) {
  const scheduleByNumber = createScheduleByNumber(schedule);

  return amortizations.reduce((breakdown, item) => {
    const selectedInstallments = item.selectedInstallments.filter((number) => scheduleByNumber.has(number));
    const nominalTotal = selectedInstallments.reduce((sum, number) => sum + scheduleByNumber.get(number).payment, 0);

    if (!selectedInstallments.length || nominalTotal <= 0) {
      return breakdown;
    }

    let allocatedAmount = 0;
    selectedInstallments.forEach((number, index) => {
      const installment = scheduleByNumber.get(number);
      const isLast = index === selectedInstallments.length - 1;
      const amount = isLast
        ? Math.max(0, item.amount - allocatedAmount)
        : round(safeDivide(item.amount * installment.payment, nominalTotal), 2);
      const previous = breakdown.get(number) || {
        amount: 0,
        nominal: installment.payment
      };

      previous.amount += amount;
      previous.nominal = installment.payment;
      allocatedAmount += amount;
      breakdown.set(number, previous);
    });

    return breakdown;
  }, new Map());
}

function buildInstallmentSchedule(sourceFinance = finance) {
  const normalizedFinance = normalizeFinance(sourceFinance || getDefaultFinance());
  const totalInstallments = Math.max(0, Math.trunc(normalizedFinance.totalInstallments));
  const payment = Math.max(0, normalizedFinance.installmentAmount);
  const principalTotal = Math.max(0, normalizedFinance.financedAmount);

  if (!totalInstallments || !payment) {
    return [];
  }

  const monthlyRate = solveMonthlyInterestRate(principalTotal, payment, totalInstallments);
  const baseDate = parseLocalDate(normalizedFinance.firstDueDate);
  let balance = principalTotal;

  return Array.from({ length: totalInstallments }, (_, index) => {
    const number = index + 1;
    const interest = monthlyRate > 0 ? balance * monthlyRate : 0;
    const fallbackPrincipal = safeDivide(principalTotal, totalInstallments);
    const principal = number === totalInstallments
      ? balance
      : Math.max(0, Math.min(balance, monthlyRate > 0 ? payment - interest : fallbackPrincipal));
    const balanceAfter = Math.max(0, balance - principal);
    const installment = {
      number,
      dueDate: toDateInputValue(addMonths(baseDate, index)),
      payment,
      interest,
      principal,
      balanceBefore: balance,
      balanceAfter
    };

    balance = balanceAfter;
    return installment;
  });
}

function solveMonthlyInterestRate(principal, payment, installments) {
  const amount = Math.max(0, principal);
  const installmentValue = Math.max(0, payment);
  const count = Math.max(0, Math.trunc(installments));

  if (!amount || !installmentValue || !count || installmentValue * count <= amount) {
    return 0;
  }

  let low = 0;
  let high = 1;

  for (let index = 0; index < 80; index += 1) {
    const middle = (low + high) / 2;
    const calculatedPayment = calculatePaymentForRate(amount, middle, count);
    if (calculatedPayment > installmentValue) {
      high = middle;
    } else {
      low = middle;
    }
  }

  return (low + high) / 2;
}

function calculatePaymentForRate(principal, monthlyRate, installments) {
  if (monthlyRate <= 0) {
    return safeDivide(principal, installments);
  }

  return principal * (monthlyRate / (1 - (1 + monthlyRate) ** -installments));
}

function editEntry(id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  const normalized = normalizeEntry(entry);
  fillEntryForm(normalized, normalized.id, normalized.date);
  document.getElementById("formTitle").textContent = "Editando dia";
  document.getElementById("saveEntryBtn").textContent = "Atualizar lancamento";
  document.getElementById("cancelEditBtn").classList.remove("hidden");
  updateKmTotal();
  renderEntryPreview();
  switchPage("entry");
}

function duplicateEntry(id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  const normalized = normalizeEntry(entry);
  fillEntryForm(normalized, "", toDateInputValue(new Date()));
  document.getElementById("formTitle").textContent = "Duplicando dia";
  document.getElementById("saveEntryBtn").textContent = "Salvar copia";
  document.getElementById("cancelEditBtn").classList.remove("hidden");
  updateKmTotal();
  renderEntryPreview();
  switchPage("entry");
}

function duplicateEntryMany(id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  const amount = Number(prompt("Quantas copias deseja criar?", "1"));
  if (!Number.isInteger(amount) || amount <= 0) {
    return;
  }

  if (amount > 365 && !confirm(`Criar ${amount} copias pode deixar o app pesado. Continuar?`)) {
    return;
  }

  const normalized = normalizeEntry(entry);
  const startDateText = prompt("Data inicial das copias em DD/MM/AAAA. Deixe vazio para comecar no dia seguinte.", "");
  const typedStartDate = normalizeDateInputValue(startDateText);
  if (String(startDateText || "").trim() && !typedStartDate) {
    alert("Data inicial invalida. Use DD/MM/AAAA.");
    return;
  }

  const startDate = typedStartDate || toDateInputValue(addDays(parseLocalDate(normalized.date), 1));
  const newEntries = Array.from({ length: amount }, (_, index) => {
    const date = toDateInputValue(addDays(parseLocalDate(startDate), index));
    return createDuplicatedEntry(normalized, date);
  });

  entries = [...entries, ...newEntries];
  saveEntries();
  analysisDate = parseLocalDate(startDate);
  saveAnalysisDate();
  updateAnalysisMonthLabel();
  renderAll();
  alert(`${amount} ${amount === 1 ? "copia criada" : "copias criadas"} a partir de ${formatDate(startDate)}.`);
}

function createDuplicatedEntry(sourceEntry, date) {
  const duplicate = normalizeEntry({
    ...sourceEntry,
    id: createEntryId(),
    date,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    costSnapshot: null
  });

  return attachCostSnapshotForSave(duplicate, null);
}

function fillEntryForm(entry, id, date) {
  document.getElementById("entryId").value = id;
  document.getElementById("entryDate").value = isoToBrazilDate(date);
  document.getElementById("dayType").value = entry.dayType;
  document.getElementById("hoursOnline").value = valueOrBlank(entry.hoursOnline);
  document.getElementById("hoursEffective").value = valueOrBlank(entry.hoursEffective);
  document.getElementById("kmInitial").value = valueOrBlank(entry.kmInitial);
  document.getElementById("kmFinal").value = valueOrBlank(entry.kmFinal);
  document.getElementById("kmTotalManual").value = valueOrBlank(entry.kmTotalManual);
  document.getElementById("kmPaid").value = valueOrBlank(entry.kmPaid);
  document.getElementById("grossRevenue").value = valueOrBlank(entry.grossRevenue);
  document.getElementById("tips").value = valueOrBlank(entry.tips);
  document.getElementById("fuelCost").value = valueOrBlank(entry.fuelCost);
  document.getElementById("fuelMode").value = entry.fuelMode;
  document.getElementById("otherCosts").value = valueOrBlank(entry.otherCosts);
  document.getElementById("maintenancePayments").value = valueOrBlank(entry.maintenancePayments);
  document.getElementById("rides").value = valueOrBlank(entry.rides);
  document.getElementById("weather").value = entry.weather;
  document.getElementById("fatigue").value = entry.fatigue;
  document.getElementById("fatigueValue").textContent = entry.fatigue;
  document.getElementById("notes").value = entry.notes;
}

function deleteEntry(id) {
  if (!confirm("Excluir este lancamento?")) {
    return;
  }

  entries = entries.filter((entry) => entry.id !== id);
  selectedEntryIds.delete(id);
  saveEntries();
  renderAll();
}

function toggleSelectAllEntries() {
  if (!entries.length) {
    return;
  }

  const allSelected = selectedEntryIds.size === entries.length;
  selectedEntryIds = allSelected ? new Set() : new Set(entries.map((entry) => entry.id));
  renderHistory();
}

function deleteSelectedEntries() {
  const count = selectedEntryIds.size;
  if (!count) {
    return;
  }

  if (!confirm(`Excluir ${count} ${count === 1 ? "lancamento selecionado" : "lancamentos selecionados"}?`)) {
    return;
  }

  entries = entries.filter((entry) => !selectedEntryIds.has(entry.id));
  selectedEntryIds.clear();
  saveEntries();
  renderAll();
}

function updateBulkSelectionUi() {
  const count = selectedEntryIds.size;
  const countLabel = document.getElementById("selectedHistoryCount");
  const deleteButton = document.getElementById("deleteSelectedBtn");
  const toggleButton = document.getElementById("toggleSelectAllBtn");

  if (!countLabel || !deleteButton || !toggleButton) {
    return;
  }

  countLabel.textContent = `${count} ${count === 1 ? "selecionado" : "selecionados"}`;
  deleteButton.disabled = count === 0;
  toggleButton.textContent = entries.length && count === entries.length ? "Limpar selecao" : "Selecionar todos";
}

function clearEntries() {
  if (!confirm("Limpar todos os lancamentos salvos? As configuracoes serao mantidas.")) {
    return;
  }

  entries = [];
  selectedEntryIds.clear();
  saveEntries();
  resetEntryForm();
  renderAll();
}

function restoreDefaults() {
  if (!confirm("Restaurar configuracoes padrao? Lancamentos salvos serao mantidos.")) {
    return;
  }

  config = getDefaultConfig();
  saveConfig();
  upsertConfigHistory(toDateInputValue(new Date()));
  fillConfigForm();
  setText("configStatus", "Padroes restaurados e salvos.");
  renderAll();
}

function applySuggestedCosts() {
  const suggestions = getSuggestedPerKmCosts();
  ["oilPerKm", "tirePerKm", "chainPerKm", "brakePerKm"].forEach((key) => {
    config[key] = round(suggestions[key], 3);
    setInputValue(key, config[key]);
  });
  saveConfig();
  upsertConfigHistory(toDateInputValue(new Date()));
  setText("configStatus", "Custos sugeridos aplicados.");
  renderAll();
}

function syncSuggestedCostFromParts(changedFieldId) {
  const mapping = {
    tireSetValue: "tirePerKm",
    tireLifeKm: "tirePerKm",
    oilChangeValue: "oilPerKm",
    oilChangeIntervalKm: "oilPerKm",
    chainValue: "chainPerKm",
    chainLifeKm: "chainPerKm",
    brakeValue: "brakePerKm",
    brakeLifeKm: "brakePerKm"
  };
  const targetCostField = mapping[changedFieldId];

  if (!targetCostField) {
    return;
  }

  const suggestions = getSuggestedPerKmCosts();
  config[targetCostField] = round(suggestions[targetCostField], 3);
  setInputValue(targetCostField, config[targetCostField]);
}

function useProjectedProfitForAmortization() {
  const projection = latestProjection || calculateMonthlyProjection();
  config.amortizationSimulationAmount = Math.max(0, round(projection.projectedNetProfit, 2));
  setInputValue("amortizationSimulationAmount", config.amortizationSimulationAmount);
  saveConfig();
  upsertConfigHistory(toDateInputValue(new Date()));
  renderAll();
}

function updateKmTotal() {
  const kmTotal = Math.max(0, readNumber("kmFinal") - readNumber("kmInitial"));
  setInputValue("kmCalculated", kmTotal ? round(kmTotal, 1) : "");
}

function resetEntryForm() {
  document.getElementById("entryForm").reset();
  document.getElementById("entryId").value = "";
  document.getElementById("entryDate").value = toBrazilDateValue(new Date());
  document.getElementById("fatigue").value = 3;
  document.getElementById("fatigueValue").textContent = 3;
  document.getElementById("fuelMode").value = "auto";
  document.getElementById("formTitle").textContent = "Novo dia";
  document.getElementById("saveEntryBtn").textContent = "Salvar lancamento";
  document.getElementById("cancelEditBtn").classList.add("hidden");
  updateKmTotal();
  renderEntryPreview();
}

function fillConfigForm() {
  CONFIG_FIELDS.forEach((key) => {
    const input = document.getElementById(key);
    if (input) {
      input.value = key === "controlStartDate" ? isoToBrazilDate(config[key]) : formatInputValue(input, config[key]);
    }
  });
  renderMonthlyFixedCostItems();
}

function createFixedCostItemRow(item = { name: "", description: "", amount: 0 }) {
  return `
    <tr>
      <td><input class="fixed-cost-item-name" type="text" value="${escapeHtml(item.name)}" placeholder="Ex: Energia" /></td>
      <td><input class="fixed-cost-item-description" type="text" value="${escapeHtml(item.description)}" placeholder="Descricao breve" /></td>
      <td><input class="fixed-cost-item-amount" type="number" min="0" step="0.01" inputmode="decimal" value="${item.amount != null ? item.amount : ""}" /></td>
      <td><button type="button" class="ghost-button fixed-cost-item-remove" data-action="remove-fixed-cost-item">Remover</button></td>
    </tr>
  `;
}

function renderMonthlyFixedCostItems() {
  const tableBody = document.querySelector("#monthlyFixedCostItemsTable tbody");
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = (config.monthlyFixedCostItems || []).map(createFixedCostItemRow).join("");
}

function getMonthlyFixedCostItemsFromForm() {
  return Array.from(document.querySelectorAll("#monthlyFixedCostItemsTable tbody tr")).map((row) => {
    const nameInput = row.querySelector(".fixed-cost-item-name");
    const descriptionInput = row.querySelector(".fixed-cost-item-description");
    const amountInput = row.querySelector(".fixed-cost-item-amount");

    return {
      name: nameInput ? String(nameInput.value || "").trim() : "",
      description: descriptionInput ? String(descriptionInput.value || "").trim() : "",
      amount: amountInput ? Math.max(0, toNumber(amountInput.value)) : 0
    };
  }).filter((item) => item.name || item.description || item.amount > 0);
}

function addMonthlyFixedCostItemRow() {
  const tableBody = document.querySelector("#monthlyFixedCostItemsTable tbody");
  if (!tableBody) {
    return;
  }

  tableBody.insertAdjacentHTML("beforeend", createFixedCostItemRow());
  updateConfig();

  const lastRow = tableBody.querySelector("tr:last-child .fixed-cost-item-name");
  if (lastRow) {
    lastRow.focus();
  }
}

function removeMonthlyFixedCostItemRow(row) {
  if (!row || !row.parentElement) {
    return;
  }

  row.parentElement.removeChild(row);
}

function getSuggestedPerKmCosts() {
  return {
    oilPerKm: safeDivide(config.oilChangeValue, config.oilChangeIntervalKm),
    tirePerKm: safeDivide(config.tireSetValue, config.tireLifeKm),
    chainPerKm: safeDivide(config.chainValue, config.chainLifeKm),
    brakePerKm: safeDivide(config.brakeValue, config.brakeLifeKm)
  };
}

function getVariableCostPerKm(sourceConfig = config) {
  return (
    sourceConfig.oilPerKm +
    sourceConfig.tirePerKm +
    sourceConfig.chainPerKm +
    sourceConfig.brakePerKm +
    sourceConfig.reviewReservePerKm +
    sourceConfig.extraMaintenancePerKm
  );
}

function getMonthDifference(startMonthValue, endMonthValue) {
  const start = normalizeMonthInputValue(startMonthValue);
  const end = normalizeMonthInputValue(endMonthValue);
  if (!start || !end) {
    return null;
  }

  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);

  return endYear * 12 + endMonth - (startYear * 12 + startMonth);
}

function getScheduledInstallmentCostForMonth(dateValue, startMonthValue, totalInstallments, installmentAmount) {
  const targetMonth = dateValue instanceof Date ? toMonthInputValue(dateValue) : normalizeMonthInputValue(dateValue);
  const startMonth = normalizeMonthInputValue(startMonthValue);
  if (!targetMonth || !startMonth || totalInstallments <= 0 || installmentAmount <= 0) {
    return 0;
  }

  const monthsAfterStart = getMonthDifference(startMonth, targetMonth);
  return monthsAfterStart !== null && monthsAfterStart >= 0 && monthsAfterStart < totalInstallments ? installmentAmount : 0;
}

function getMonthlyFixedCostParts(sourceConfig = config, referenceDate = analysisDate) {
  const targetDate = referenceDate instanceof Date ? referenceDate : parseLocalDate(referenceDate);
  const financing = getFinancingInstallmentCostForMonth(targetDate);
  const purchase = getScheduledInstallmentCostForMonth(
    targetDate,
    sourceConfig.purchaseStartMonth,
    Math.max(0, Math.trunc(sourceConfig.purchaseInstallments || 0)),
    Math.max(0, sourceConfig.purchaseInstallmentValue || 0)
  );
  const repair = getScheduledInstallmentCostForMonth(
    targetDate,
    sourceConfig.repairStartMonth,
    Math.max(0, Math.trunc(sourceConfig.repairInstallments || 0)),
    Math.max(0, sourceConfig.repairInstallmentValue || 0)
  );
  const insurance = Math.max(0, sourceConfig.monthlyInsurance || 0);
  const phone = Math.max(0, sourceConfig.monthlyPhone || 0);
  const otherConfiguredFixed = Math.max(0, sourceConfig.monthlyOtherFixed || 0);
  const customFixedItems = Array.isArray(sourceConfig.monthlyFixedCostItems)
    ? sourceConfig.monthlyFixedCostItems.map((item) => ({
        name: String(item.name || "").trim(),
        description: String(item.description || "").trim(),
        amount: Math.max(0, toNumber(item.amount))
      }))
    : [];
  const customFixedTotal = customFixedItems.reduce((sum, item) => sum + item.amount, 0);
  const otherFixed = phone + otherConfiguredFixed + customFixedTotal;
  const investment = purchase + repair;

  return {
    financing,
    purchase,
    repair,
    investment,
    insurance,
    phone,
    otherConfiguredFixed,
    customFixedItems,
    customFixedTotal,
    otherFixed,
    total: financing + insurance + otherFixed + investment
  };
}

function getMonthlyFixedCosts(sourceConfig = config, referenceDate = analysisDate) {
  return getMonthlyFixedCostParts(sourceConfig, referenceDate).total;
}

function getFixedCostForDate(dateValue, sourceConfig = getConfigForDate(dateValue)) {
  const date = parseLocalDate(dateValue);
  return safeDivide(getMonthlyFixedCosts(sourceConfig, date), getDaysInMonth(date));
}

function getMonthlyHole(monthMetrics) {
  const total = monthMetrics.fixedCostMonthly;
  const covered = clamp(monthMetrics.operationalProfit, 0, total);
  const remaining = Math.max(0, total - covered);
  return {
    total,
    covered,
    remaining,
    coveragePct: total > 0 ? safeDivide(covered, total) * 100 : 100
  };
}

function getPeriodRange(period) {
  const now = analysisDate;
  const ranges = {
    today: [startOfDay(now), endOfDay(now)],
    week: [startOfWeek(now), endOfDay(addDays(startOfWeek(now), 6))],
    month: [startOfMonth(now), endOfMonth(now)],
    quarter: [startOfQuarter(now), endOfQuarter(now)],
    year: [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)]
  };
  const [start, end] = ranges[period] || ranges.month;
  return { start, end };
}

function getTrendRange(range) {
  const now = analysisDate;
  if (range === "week") {
    return { start: startOfWeek(now), end: endOfDay(addDays(startOfWeek(now), 6)) };
  }
  if (range === "month") {
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }
  return { start: addDays(startOfDay(now), -6), end: endOfDay(now) };
}

function getEntriesBetween(start, end) {
  return entries.filter((entry) => {
    const entryDate = parseLocalDate(entry.date);
    return entryDate >= startOfDay(start) && entryDate <= endOfDay(end);
  });
}

function buildDailyRowsForRange(start, end, includeEmptyDays) {
  const rangeEntries = getEntriesBetween(start, end).map(calculateDailyEntry);
  const groups = rangeEntries.reduce((accumulator, entry) => {
    if (!accumulator[entry.date]) {
      accumulator[entry.date] = createEmptyDailyRow(entry.date);
      accumulator[entry.date].dayType = entry.dayType;
      accumulator[entry.date].hasEntries = true;
    }

    const row = accumulator[entry.date];
    row.hasEntries = true;
    row.entries += 1;
    row.grossRevenue += entry.grossRevenue;
    row.tips += entry.tips;
    row.revenueTotal += entry.revenueTotal;
    row.fuelCost += entry.fuelCostUsed;
    row.otherCosts += entry.otherCosts;
    row.wearCost += entry.wearCost;
    row.maintenanceReserve += entry.maintenanceReserve;
    row.maintenancePayments += entry.maintenancePayments;
    row.maintenanceCashDelta += entry.maintenanceCashDelta;
    row.variableCostTotal += entry.variableCostTotal;
    row.operationalProfit += entry.operationalProfit;
    row.kmTotal += entry.kmTotal;
    row.kmPaid += entry.kmPaid;
    row.hoursOnline += entry.hoursOnline;
    row.hoursEffective += entry.hoursEffective;
    row.rides += entry.rides;
    return accumulator;
  }, {});

  const rows = [];
  for (let cursor = startOfDay(start); cursor <= endOfDay(end); cursor = addDays(cursor, 1)) {
    const date = toDateInputValue(cursor);
    if (groups[date]) {
      rows.push(finalizeDailyRow(groups[date]));
    } else if (includeEmptyDays) {
      rows.push(finalizeDailyRow(createEmptyDailyRow(date)));
    }
  }

  return rows.filter((row) => includeEmptyDays || row.hasEntries);
}

function createEmptyDailyRow(date) {
  return {
    date,
    dayType: "",
    hasEntries: false,
    entries: 0,
    grossRevenue: 0,
    tips: 0,
    revenueTotal: 0,
    fuelCost: 0,
    otherCosts: 0,
    wearCost: 0,
    maintenanceReserve: 0,
    maintenancePayments: 0,
    maintenanceCashDelta: 0,
    variableCostTotal: 0,
    operationalProfit: 0,
    availableProfit: 0,
    fixedCostDay: getFixedCostForDate(date),
    netProfitProportional: 0,
    kmTotal: 0,
    kmPaid: 0,
    kmDead: 0,
    hoursOnline: 0,
    hoursEffective: 0,
    rides: 0,
    deadKmPct: 0,
    revenuePerHour: 0,
    availableProfitPerHour: 0,
    revenuePerKmTotal: 0,
    profitPerKmTotal: 0
  };
}

function finalizeDailyRow(row) {
  row.kmDead = Math.max(0, row.kmTotal - row.kmPaid);
  row.deadKmPct = safeDivide(row.kmDead, row.kmTotal) * 100;
  row.netProfitProportional = row.hasEntries ? row.operationalProfit - row.fixedCostDay : 0;
  row.availableProfit = Math.max(0, row.netProfitProportional);
  row.revenuePerHour = safeDivide(row.revenueTotal, row.hoursOnline);
  row.revenuePerKmTotal = safeDivide(row.revenueTotal, row.kmTotal);
  row.profitPerKmTotal = safeDivide(row.netProfitProportional, row.kmTotal);
  return row;
}

function getExtremeRow(rows, key, mode) {
  return rows.reduce((selected, row) => {
    if (!selected) {
      return row;
    }
    return mode === "max" ? (row[key] > selected[key] ? row : selected) : row[key] < selected[key] ? row : selected;
  }, null);
}

function parseLocalDate(value) {
  const normalizedValue = normalizeDateInputValue(value);
  if (!normalizedValue) {
    return startOfDay(new Date());
  }

  const [year, month, day] = normalizedValue.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfWeek(date) {
  const start = startOfDay(date);
  const day = start.getDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - distanceFromMonday);
  return start;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfQuarter(date) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

function endOfQuarter(date) {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth + 3, 0, 23, 59, 59, 999);
}

function getDaysLeftInAnalysisMonth(today) {
  const analysisMonthStart = startOfMonth(analysisDate);
  const currentMonthStart = startOfMonth(today);
  const daysInMonth = getDaysInMonth(analysisDate);

  if (analysisMonthStart > currentMonthStart) {
    return daysInMonth;
  }

  if (analysisMonthStart < currentMonthStart) {
    return 0;
  }

  return Math.max(0, daysInMonth - today.getDate());
}

function addDays(date, days) {
  const result = startOfDay(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date, months) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const day = Math.min(date.getDate(), getDaysInMonth(target));
  return new Date(target.getFullYear(), target.getMonth(), day);
}

function toMonthInputValue(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function normalizeMonthInputValue(value) {
  const rawValue = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(rawValue)) {
    const [year, month] = rawValue.split("-").map(Number);
    return month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, "0")}` : "";
  }

  if (!/^\d{2}\/\d{4}$/.test(rawValue)) {
    return "";
  }

  const [month, year] = rawValue.split("/").map(Number);
  return month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, "0")}` : "";
}

function maskBrazilMonth(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 6);
  const month = digits.slice(0, 2);
  const year = digits.slice(2, 6);

  return digits.length <= 2 ? month : `${month}/${year}`;
}

function getDaysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function toDateInputValue(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function isDateInputValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isBrazilDateValue(value) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(String(value || ""));
}

function normalizeDateInputValue(value) {
  const rawValue = String(value || "").trim();

  if (isDateInputValue(rawValue)) {
    return rawValue;
  }

  if (!isBrazilDateValue(rawValue)) {
    return "";
  }

  const [day, month, year] = rawValue.split("/").map(Number);
  const date = new Date(year, month - 1, day);
  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return isValid ? toDateInputValue(date) : "";
}

function maskBrazilDate(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  if (digits.length <= 2) {
    return day;
  }

  if (digits.length <= 4) {
    return `${day}/${month}`;
  }

  return `${day}/${month}/${year}`;
}

function isoToBrazilDate(value) {
  const normalizedValue = normalizeDateInputValue(value);
  return normalizedValue ? formatDate(normalizedValue) : "";
}

function toBrazilDateValue(date) {
  return isoToBrazilDate(toDateInputValue(date));
}

function createEntryId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readNumber(id) {
  return toNumber(document.getElementById(id).value);
}

function readOptionalNumber(id) {
  return toOptionalNumber(document.getElementById(id).value);
}

function setInputValue(id, value) {
  const input = document.getElementById(id);
  if (input) {
    input.value = formatInputValue(input, value);
  }
}

function formatInputValue(input, value) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  return input?.dataset?.decimalInput === "true" ? formatDecimalInputValue(value) : value;
}

function formatDecimalInputValue(value) {
  const number = typeof value === "number" ? value : toNumber(value);
  if (!Number.isFinite(number)) {
    return "";
  }

  const rounded = round(number, 6);
  return String(rounded).replace(".", ",");
}

function normalizeDecimalInputText(value) {
  const textValue = String(value || "");
  const decimalText = textValue.includes(",") ? textValue.replace(/\./g, "") : textValue.replace(/\./g, ",");
  const rawValue = decimalText.replace(/[^\d,-]/g, "");
  const isNegative = rawValue.startsWith("-");
  const unsignedValue = rawValue.replace(/-/g, "");
  const [integerPart, ...decimalParts] = unsignedValue.split(",");
  const decimalPart = decimalParts.join("");

  return `${isNegative ? "-" : ""}${integerPart}${decimalParts.length ? `,${decimalPart}` : ""}`;
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const normalizedValue = normalizeBrazilNumber(value);
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const normalizedValue = normalizeBrazilNumber(value);
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBrazilNumber(value) {
  const rawValue = String(value || "").trim().replace(/\s/g, "").replace(/R\$/gi, "");

  if (rawValue.includes(",")) {
    return rawValue.replace(/\./g, "").replace(",", ".");
  }

  return rawValue;
}

function safeDivide(value, divisor) {
  return divisor ? value / divisor : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function valueOrBlank(value) {
  return value || value === 0 ? formatDecimalInputValue(value) : "";
}

function formatMoney(value) {
  return moneyFormatter.format(value || 0);
}

function compactMoney(value) {
  const absValue = Math.abs(value || 0);

  if (absValue >= 1000) {
    return `${value < 0 ? "-" : ""}R$ ${numberFormatter.format(absValue / 1000)} mil`;
  }

  return formatMoney(value);
}

function formatSignedMoney(value) {
  if (value > 0) {
    return `+${formatMoney(value)}`;
  }
  if (value < 0) {
    return `-${formatMoney(Math.abs(value))}`;
  }
  return formatMoney(0);
}

function formatNumber(value) {
  return numberFormatter.format(value || 0);
}

function formatPercent(value) {
  return `${numberFormatter.format(value || 0)}%`;
}

function formatPerKm(value) {
  return `R$ ${decimalFormatter.format(value || 0)}/km`;
}

function formatGoalHours(remaining, hours) {
  if (remaining <= 0) {
    return "batida";
  }

  return hours > 0 ? `${formatNumber(hours)} h` : "sem previsao";
}

function formatDate(value) {
  return parseLocalDate(value).toLocaleDateString("pt-BR");
}

function isoMonthToBrazilMonth(value) {
  const normalized = normalizeMonthInputValue(value);
  if (!normalized) {
    return "";
  }

  const [year, month] = normalized.split("-");
  return `${month}/${year}`;
}

function formatShortDate(value) {
  const date = parseLocalDate(value);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function pluralize(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function toneClass(value) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function setMoney(id, value) {
  setText(id, formatMoney(value));
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function toggleValueTone(id, value) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  element.classList.toggle("negative", value < 0);
  element.classList.toggle("positive", value > 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
