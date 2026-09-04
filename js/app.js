import { readStorage, writeStorage } from "./storage.js";
import { initializeTheme } from "./theme.js";
import { validateForm } from "./validators.js";

const HISTORY_KEY = "calculard_history";
const FAVORITES_KEY = "calculard_favorites";
const ITBIS_RATE = 0.18;
const AFP_RATE = 0.0287;
const SFS_RATE = 0.0304;
const ISR_BRACKETS = [
  { upTo: 416220, fixed: 0, rate: 0, excessOver: 0 },
  { upTo: 624329, fixed: 0, rate: 0.15, excessOver: 416220.01 },
  { upTo: 867123, fixed: 31216, rate: 0.2, excessOver: 624329.01 },
  { upTo: Infinity, fixed: 79776, rate: 0.25, excessOver: 867123.01 }
];

const currency = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const numberFormat = new Intl.NumberFormat("es-DO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const state = {
  lastLoan: null,
  showFullAmortization: false,
  favorites: readStorage(FAVORITES_KEY, []),
  activeTool: "loan",
  historyOpener: null
};

const calculatorLabels = {
  loan: "Préstamo",
  compare: "Comparador",
  salary: "Sueldo neto",
  itbis: "ITBIS",
  withholding: "Retenciones",
  hourly: "Pago por hora",
  vacation: "Vacaciones",
  savings: "Ahorro"
};

const repeatTargets = {
  loan: "[data-form='loan']",
  compare: "[data-form='compare']",
  salary: "[data-form='salary']",
  itbis: "[data-form='itbis']",
  withholding: "[data-form='withholding']",
  hourly: "[data-form='hourly']",
  vacation: "[data-form='vacation']",
  savings: "[data-form='savings']"
};

function money(value) {
  return `RD$${currency.format(Number.isFinite(value) ? value : 0)}`;
}

function percent(value) {
  return `${numberFormat.format(Number.isFinite(value) ? value : 0)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function monthlyPayment(principal, annualRate, months) {
  const monthlyRate = annualRate / 100 / 12;
  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return principal / months;

  const growth = Math.pow(1 + monthlyRate, months);
  return principal * (monthlyRate * growth) / (growth - 1);
}

function loanSummary({ amount, downPayment = 0, rate, months }) {
  const financed = Math.max(amount - downPayment, 0);
  const payment = monthlyPayment(financed, rate, months);
  const totalPaid = payment * months;
  const interest = Math.max(totalPaid - financed, 0);
  const interestShare = totalPaid > 0 ? (interest / totalPaid) * 100 : 0;

  return { amount, downPayment, rate, months, financed, payment, totalPaid, interest, interestShare };
}

function amortizationRows(summary) {
  const monthlyRate = summary.rate / 100 / 12;
  const rows = [];
  let balance = summary.financed;

  for (let month = 1; month <= summary.months; month += 1) {
    const interest = monthlyRate === 0 ? 0 : balance * monthlyRate;
    const capital = Math.min(summary.payment - interest, balance);
    balance = Math.max(balance - capital, 0);
    rows.push({ month, payment: summary.payment, capital, interest, balance });
  }

  return rows;
}

function renderResults(name, rows) {
  const target = document.querySelector(`[data-results="${name}"]`);
  if (!target) return;

  target.innerHTML = rows.map((row) => `
    <div class="result-row ${row.variant || ""}">
      <span>${escapeHtml(row.label)}</span>
      <strong>${escapeHtml(row.value)}</strong>
    </div>
  `).join("");
}

function renderExplanation(name, html) {
  const target = document.querySelector(`[data-explanation="${name}"]`);
  if (target) target.innerHTML = html;
}

function addHistory(type, inputs, result) {
  const history = readStorage(HISTORY_KEY, []);
  const nextHistory = [
    {
      id: crypto.randomUUID(),
      type,
      label: calculatorLabels[type],
      savedAt: new Date().toISOString(),
      inputs,
      result
    },
    ...history
  ].slice(0, 25);

  writeStorage(HISTORY_KEY, nextHistory);
  renderHistory();
}

function drawLoanChart(summary) {
  const canvas = document.querySelector("[data-loan-chart]");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const themeStyles = getComputedStyle(document.documentElement);
  const chartCapital = themeStyles.getPropertyValue("--chart-capital").trim() || "#3B82F6";
  const chartInterest = themeStyles.getPropertyValue("--chart-interest").trim() || "#38BDF8";
  const chartBalance = themeStyles.getPropertyValue("--chart-balance").trim() || "#2563EB";
  context.clearRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = themeStyles.getPropertyValue("--muted").trim();
  context.font = "15px Segoe UI";
  if (!summary) {
    context.fillText("Calcula un préstamo para ver la visualización.", 34, 132);
    return;
  }

  const total = summary.financed + summary.interest;
  const capitalAngle = total ? (summary.financed / total) * Math.PI * 2 : 0;
  const centerX = 112;
  const centerY = 112;
  const radius = 70;

  context.beginPath();
  context.moveTo(centerX, centerY);
  context.fillStyle = chartCapital;
  context.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + capitalAngle);
  context.fill();

  context.beginPath();
  context.moveTo(centerX, centerY);
  context.fillStyle = chartInterest;
  context.arc(centerX, centerY, radius, -Math.PI / 2 + capitalAngle, Math.PI * 1.5);
  context.fill();

  context.fillStyle = themeStyles.getPropertyValue("--text").trim();
  context.font = "700 18px Segoe UI";
  context.fillText(`Capital ${Math.round((summary.financed / total) * 100 || 0)}%`, 220, 84);
  context.fillText(`Intereses ${Math.round(summary.interestShare)}%`, 220, 124);
  context.font = "14px Segoe UI";
  context.fillStyle = themeStyles.getPropertyValue("--muted").trim();
  context.fillText("Balance baja cada mes con la", 220, 158);
  context.fillText("porcion de capital.", 220, 178);

  const rows = amortizationRows(summary).filter((_, index) => index % Math.ceil(summary.months / 8) === 0);
  const startX = 34;
  const startY = 226;
  const width = 350;
  context.strokeStyle = chartBalance;
  context.lineWidth = 3;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  rows.forEach((row, index) => {
    const x = startX + (index / Math.max(rows.length - 1, 1)) * width;
    const y = startY - ((summary.financed - row.balance) / Math.max(summary.financed, 1)) * 48;
    if (index === 0) context.moveTo(x, y);
    context.lineTo(x, y);
  });
  context.stroke();
}

function renderAmortization(summary) {
  const target = document.querySelector("[data-amortization-table]");
  const button = document.querySelector("[data-toggle-amortization]");
  if (!target || !summary) {
    if (target) target.innerHTML = "";
    return;
  }

  const rows = amortizationRows(summary);
  const visibleRows = state.showFullAmortization ? rows : rows.slice(0, 12);
  target.innerHTML = visibleRows.map((row) => `
    <tr>
      <td>${row.month}</td>
      <td>${money(row.payment)}</td>
      <td>${money(row.capital)}</td>
      <td>${money(row.interest)}</td>
      <td>${money(row.balance)}</td>
    </tr>
  `).join("");

  if (button) button.textContent = state.showFullAmortization ? "Contraer tabla" : "Expandir tabla";
}

function handleLoanSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const { valid, values } = validateForm(form, {
    amount: { required: true, number: true, min: 1, max: 100000000, minMessage: "El monto debe ser mayor que RD$0." },
    downPayment: { number: true, min: 0, max: 100000000 },
    rate: { required: true, number: true, min: 0, max: 80, maxMessage: "Usa una tasa menor o igual a 80%." },
    term: { required: true, number: true, min: 1, max: 480 }
  });
  if (!valid) return;

  const months = values.termUnit === "years" ? values.term * 12 : values.term;
  const summary = loanSummary({ amount: Number(values.amount), downPayment: Number(values.downPayment) || 0, rate: Number(values.rate), months });

  if (summary.downPayment >= summary.amount) {
    validateForm(form, { downPayment: { required: true, number: true, max: summary.amount - 1, maxMessage: "La inicial debe ser menor que el monto." } });
    return;
  }

  state.lastLoan = summary;
  renderResults("loan", [
    { label: "Tu cuota estimada", value: money(summary.payment), variant: "primary-result" },
    { label: "Monto financiado", value: money(summary.financed) },
    { label: "Intereses", value: money(summary.interest), variant: "warning" },
    { label: "Total", value: money(summary.totalPaid) },
    { label: "Tasa anual", value: percent(summary.rate) }
  ]);
  renderExplanation("loan", `
    Monto financiado: ${money(summary.financed)}. Tasa anual: ${percent(summary.rate)}.
    Tasa mensual: ${percent(summary.rate / 12)}. Plazo: ${summary.months} meses.
    La cuota estimada queda en ${money(summary.payment)} usando pagos mensuales fijos.
  `);
  const output = document.querySelector("[data-loan-output]");
  if (output) output.hidden = false;
  renderAmortization(summary);
  drawLoanChart(summary);
  addHistory("loan", { amount: summary.amount, downPayment: summary.downPayment, rate: summary.rate, term: values.term, termUnit: values.termUnit }, `${money(summary.payment)} mensual`);
}

function handleCompareSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const { valid, values } = validateForm(form, {
    aAmount: { required: true, number: true, min: 1 },
    aDownPayment: { number: true, min: 0 },
    aRate: { required: true, number: true, min: 0, max: 80 },
    aMonths: { required: true, number: true, min: 1, max: 480 },
    bAmount: { required: true, number: true, min: 1 },
    bDownPayment: { number: true, min: 0 },
    bRate: { required: true, number: true, min: 0, max: 80 },
    bMonths: { required: true, number: true, min: 1, max: 480 }
  });
  if (!valid) return;

  const a = loanSummary({ amount: Number(values.aAmount), downPayment: Number(values.aDownPayment) || 0, rate: Number(values.aRate), months: Number(values.aMonths) });
  const b = loanSummary({ amount: Number(values.bAmount), downPayment: Number(values.bDownPayment) || 0, rate: Number(values.bRate), months: Number(values.bMonths) });
  const winner = a.totalPaid <= b.totalPaid ? "A" : "B";
  const savings = Math.abs(a.totalPaid - b.totalPaid);

  renderResults("compare", [
    { label: "Cuota A", value: money(a.payment) },
    { label: "Intereses A", value: money(a.interest) },
    { label: "Cuota B", value: money(b.payment) },
    { label: "Intereses B", value: money(b.interest) },
    { label: "Ahorro estimado", value: money(savings), variant: "highlight" }
  ]);
  renderExplanation("compare", `
    <strong>Resultado de la comparación</strong><br>
    El préstamo ${winner} te permite ahorrar ${money(savings)} frente al préstamo ${winner === "A" ? "B" : "A"}.
    La diferencia sale de comparar total pagado, intereses y duracion. Una cuota menor no siempre gana si el plazo alarga demasiado los intereses.
  `);
  addHistory("compare", values, `Ahorro ${money(savings)} con préstamo ${winner}`);
}

function calculateAnnualIsr(taxableAnnualSalary) {
  const bracket = ISR_BRACKETS.find((item) => taxableAnnualSalary <= item.upTo);
  if (!bracket || bracket.rate === 0) return 0;
  return bracket.fixed + (taxableAnnualSalary - bracket.excessOver) * bracket.rate;
}

function handleSimpleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const type = form.dataset.form;
  const rules = getRules(type);
  const { valid, values } = validateForm(form, rules);
  if (!valid) return;

  const rows = calculateSimple(type, values);
  renderResults(type, rows);
  addHistory(type, values, rows.find((row) => row.variant === "highlight")?.value || rows[0]?.value || "Calculado");
}

function getRules(type) {
  const baseMoney = { required: true, number: true, min: 1, minMessage: "El monto debe ser mayor que RD$0." };
  return {
    salary: { salary: baseMoney, otherIncome: { number: true, min: 0 } },
    itbis: { amount: baseMoney },
    withholding: { amount: baseMoney, rate: { required: true, number: true, min: 0, max: 100 } },
    hourly: { salary: baseMoney, weeklyHours: { required: true, number: true, min: 1, max: 80 }, overtimeHours: { number: true, min: 0, max: 200 } },
    vacation: { salary: baseMoney, days: { required: true, number: true, min: 1, max: 60 } },
    savings: { initial: { number: true, min: 0 }, monthly: { number: true, min: 0 }, rate: { number: true, min: 0, max: 80 }, years: { required: true, number: true, min: 1, max: 60 } }
  }[type];
}

function calculateSimple(type, values) {
  if (type === "salary") {
    const gross = Number(values.salary);
    const otherIncome = Number(values.otherIncome) || 0;
    const afp = gross * AFP_RATE;
    const sfs = gross * SFS_RATE;
    const taxableMonthly = Math.max(gross + otherIncome - afp - sfs, 0);
    const isr = calculateAnnualIsr(taxableMonthly * 12) / 12;
    const net = gross + otherIncome - afp - sfs - isr;
    return [
      { label: "AFP", value: money(afp) },
      { label: "SFS", value: money(sfs) },
      { label: "ISR mensual", value: money(isr), variant: isr > 0 ? "warning" : "" },
      { label: "Sueldo neto", value: money(net), variant: "highlight" }
    ];
  }

  if (type === "itbis") {
    const amount = Number(values.amount);
    const tax = values.mode === "extract" ? amount - amount / (1 + ITBIS_RATE) : amount * ITBIS_RATE;
    const subtotal = values.mode === "extract" ? amount - tax : amount;
    const total = values.mode === "extract" ? amount : amount + tax;
    return [
      { label: "Subtotal", value: money(subtotal) },
      { label: "ITBIS 18%", value: money(tax), variant: "warning" },
      { label: "Total", value: money(total), variant: "highlight" }
    ];
  }

  if (type === "withholding") {
    const amount = Number(values.amount);
    const retained = amount * (Number(values.rate) / 100);
    return [
      { label: "Monto factura", value: money(amount) },
      { label: "Retención", value: money(retained), variant: "warning" },
      { label: "Neto a recibir", value: money(amount - retained), variant: "highlight" }
    ];
  }

  if (type === "hourly") {
    const hourly = Number(values.salary) / (Number(values.weeklyHours) * 4.333);
    const overtime = hourly * 1.35 * (Number(values.overtimeHours) || 0);
    return [
      { label: "Pago por hora", value: money(hourly), variant: "highlight" },
      { label: "Hora extra referencial", value: money(hourly * 1.35) },
      { label: "Total horas extras", value: money(overtime) }
    ];
  }

  if (type === "vacation") {
    const daily = Number(values.salary) / 23.83;
    const total = daily * Number(values.days);
    return [
      { label: "Salario diario referencial", value: money(daily) },
      { label: "Dias", value: String(values.days) },
      { label: "Pago estimado", value: money(total), variant: "highlight" }
    ];
  }

  const initial = Number(values.initial) || 0;
  const monthly = Number(values.monthly) || 0;
  const months = Number(values.years) * 12;
  const monthlyRate = (Number(values.rate) || 0) / 100 / 12;
  let balance = initial;
  for (let index = 0; index < months; index += 1) {
    balance = balance * (1 + monthlyRate) + monthly;
  }
  const contributed = initial + monthly * months;
  return [
    { label: "Aportado", value: money(contributed) },
    { label: "Interes ganado", value: money(Math.max(balance - contributed, 0)), variant: "warning" },
    { label: "Balance final", value: money(balance), variant: "highlight" }
  ];
}

function downloadLoanCsv() {
  if (!state.lastLoan) return;
  const rows = amortizationRows(state.lastLoan);
  const csvRows = [
    ["número de cuota", "cuota", "capital", "interés", "balance restante"],
    ...rows.map((row) => [row.month, row.payment.toFixed(2), row.capital.toFixed(2), row.interest.toFixed(2), row.balance.toFixed(2)])
  ];
  const blob = new Blob([csvRows.map((row) => row.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "calculard-amortizacion.csv";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function formatHistoryDate(date) {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" });
  return isToday ? `Hoy · ${time}` : `${date.toLocaleDateString("es-DO")} · ${time}`;
}

function formatHistoryInputs(inputs) {
  return Object.entries(inputs)
    .filter(([, value]) => value !== "")
    .slice(0, 3)
    .map(([key, value]) => {
      const normalizedKey = key.toLowerCase();
      if (/(amount|salary|income|initial|monthly|downpayment)/.test(normalizedKey)) return money(Number(value));
      if (normalizedKey.includes("rate")) return percent(Number(value));
      return String(value);
    })
    .join(" · ");
}

function renderHistory() {
  const target = document.querySelector("[data-history-list]");
  if (!target) return;
  const history = readStorage(HISTORY_KEY, []);

  if (!history.length) {
    target.innerHTML = `<div class="empty-state">Aún no has hecho ningún cálculo.</div>`;
    return;
  }

  target.innerHTML = history.map((item) => {
    const date = new Date(item.savedAt);
    return `
      <article class="history-item">
        <div class="history-item-heading">
          <strong>${escapeHtml(item.label)}</strong>
          <time datetime="${escapeHtml(item.savedAt)}">${escapeHtml(formatHistoryDate(date))}</time>
        </div>
        <span class="history-item-result">${escapeHtml(item.result)}</span>
        <span class="history-item-inputs">${escapeHtml(formatHistoryInputs(item.inputs))}</span>
        <div class="history-item-actions">
          <button type="button" data-history-repeat="${item.id}">Usar de nuevo</button>
          <button type="button" data-history-delete="${item.id}">Eliminar</button>
        </div>
      </article>
    `;
  }).join("");
}

function initializeHistory() {
  const drawer = document.querySelector("[data-history-drawer]");
  const section = document.querySelector("[data-history-list]");

  function openHistory(event) {
    state.historyOpener = event?.currentTarget || document.activeElement;
    renderHistory();
    document.body.classList.add("history-open");
    drawer?.removeAttribute("inert");
    drawer?.setAttribute("aria-hidden", "false");
    document.querySelector("[data-history-close]")?.focus();
  }

  function closeHistory() {
    document.body.classList.remove("history-open");
    drawer?.setAttribute("inert", "");
    drawer?.setAttribute("aria-hidden", "true");
    if (state.historyOpener instanceof HTMLElement) state.historyOpener.focus();
  }

  document.querySelectorAll("[data-history-open]").forEach((button) => {
    button.addEventListener("click", openHistory);
  });
  document.querySelector("[data-history-close]")?.addEventListener("click", closeHistory);
  document.querySelector("[data-history-overlay]")?.addEventListener("click", closeHistory);

  section?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const history = readStorage(HISTORY_KEY, []);
    const id = button.dataset.historyDelete || button.dataset.historyRepeat;
    const item = history.find((entry) => entry.id === id);

    if (button.dataset.historyDelete) {
      writeStorage(HISTORY_KEY, history.filter((entry) => entry.id !== id));
      renderHistory();
      return;
    }

    if (!item) return;
    const form = document.querySelector(repeatTargets[item.type]);
    if (!form) return;

    openTool(item.type, { scroll: true });
    Object.entries(item.inputs).forEach(([name, value]) => {
      if (form.elements[name]) form.elements[name].value = value;
    });
    closeHistory();
  });

  document.querySelector("[data-clear-history]")?.addEventListener("click", () => {
    writeStorage(HISTORY_KEY, []);
    renderHistory();
  });

  document.addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("history-open") || !drawer) return;
    if (event.key === "Escape") {
      closeHistory();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [...drawer.querySelectorAll("button:not([disabled]), a[href], input, select")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  renderHistory();
}

function openTool(type, { scroll = false } = {}) {
  const panels = [...document.querySelectorAll("[data-tool-panel]")];
  const activePanel = panels.find((panel) => panel.dataset.toolPanel === type);
  if (!activePanel) return;

  state.activeTool = type;
  panels.forEach((panel) => {
    panel.hidden = panel !== activePanel;
  });

  document.querySelectorAll("[data-tool-switch]").forEach((button) => {
    const active = button.dataset.openTool === type;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });

  if (scroll) {
    requestAnimationFrame(() => activePanel.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
}

function initializeToolWorkspace() {
  const panels = [...document.querySelectorAll("[data-tool-panel]")];
  const tabs = [...document.querySelectorAll("[data-tool-switch]")];

  tabs.forEach((tab) => {
    const panel = panels.find((item) => item.dataset.toolPanel === tab.dataset.openTool);
    if (panel) tab.setAttribute("aria-controls", panel.id);

    tab.addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = tabs.indexOf(tab);
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextTab = tabs[(currentIndex + direction + tabs.length) % tabs.length];
      openTool(nextTab.dataset.openTool);
      nextTab.focus();
    });
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-tool]");
    if (!trigger) return;
    if (trigger.matches("a")) event.preventDefault();
    openTool(trigger.dataset.openTool, { scroll: !trigger.hasAttribute("data-tool-switch") });
  });

  const panelFromHash = panels.find((panel) => `#${panel.id}` === window.location.hash);
  openTool(panelFromHash?.dataset.toolPanel || "loan");
}

function normalizeSearchText(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function initializeSearch() {
  const input = document.querySelector("[data-tool-search]");
  const cards = [...document.querySelectorAll("[data-tool-card]")];
  const groups = [...document.querySelectorAll("[data-tool-group]")];
  const empty = document.querySelector("[data-search-empty]");

  input?.addEventListener("input", () => {
    const query = normalizeSearchText(input.value.trim());
    let visible = 0;
    cards.forEach((card) => {
      const text = normalizeSearchText(`${card.dataset.toolKey} ${card.dataset.title} ${card.dataset.category} ${card.dataset.keywords}`);
      const match = text.includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    });
    groups.forEach((group) => {
      group.hidden = !group.querySelector("[data-tool-card]:not([hidden])");
    });
    if (empty) empty.hidden = visible > 0;
  });
}

function initializeFavorites() {
  const buttons = [...document.querySelectorAll("[data-favorite-toggle]")];
  const grid = document.querySelector("[data-favorites-grid]");
  const section = document.querySelector("[data-favorites-section]");

  function paint() {
    buttons.forEach((button) => {
      const active = state.favorites.includes(button.dataset.favoriteToggle);
      button.setAttribute("aria-pressed", String(active));
      const cardTitle = button.closest("[data-tool-card]")?.dataset.title || "esta herramienta";
      button.setAttribute("aria-label", active
        ? `Quitar ${cardTitle} de favoritos`
        : `Marcar ${cardTitle} como favorito`);
    });

    if (!grid || !section) return;
    const cards = [...document.querySelectorAll("[data-tool-card]")]
      .filter((card) => state.favorites.includes(card.dataset.toolKey));
    section.hidden = cards.length === 0;
    grid.innerHTML = cards.map((card) => {
      const icon = card.querySelector(".tool-icon")?.outerHTML || "";
      const tool = card.querySelector("[data-open-tool]")?.dataset.openTool || "loan";
      return `
        <button class="favorite-tool" type="button" data-open-tool="${escapeHtml(tool)}">
          ${icon}
          <span><strong>${escapeHtml(card.dataset.title)}</strong><small>${escapeHtml(card.dataset.category)}</small></span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
        </button>
      `;
    }).join("");
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.favoriteToggle;
      state.favorites = state.favorites.includes(key)
        ? state.favorites.filter((item) => item !== key)
        : [key, ...state.favorites];
      writeStorage(FAVORITES_KEY, state.favorites);
      paint();
    });
  });

  paint();
}

function initializeForms() {
  document.querySelector("[data-form='loan']")?.addEventListener("submit", handleLoanSubmit);
  document.querySelector("[data-form='compare']")?.addEventListener("submit", handleCompareSubmit);
  document.querySelectorAll(".mini-calculator [data-form]").forEach((form) => {
    form.addEventListener("submit", handleSimpleSubmit);
  });

  document.querySelector("[data-toggle-amortization]")?.addEventListener("click", () => {
    state.showFullAmortization = !state.showFullAmortization;
    renderAmortization(state.lastLoan);
  });
  document.querySelector("[data-download-csv]")?.addEventListener("click", downloadLoanCsv);
  document.querySelector("[data-print-result]")?.addEventListener("click", () => window.print());
  drawLoanChart(null);
}

function initializePwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    });
  }
}

initializeTheme();
initializeSearch();
initializeFavorites();
initializeToolWorkspace();
initializeHistory();
initializeForms();
initializePwa();

document.addEventListener("calculard:themechange", () => drawLoanChart(state.lastLoan));
