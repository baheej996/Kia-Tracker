import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";

// Private Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCMAE9bXNifvIdGkB80-WW-Rosz6nXInb8",
  authDomain: "sonetpay-org.firebaseapp.com",
  databaseURL: "https://sonetpay-org-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sonetpay-org",
  storageBucket: "sonetpay-org.firebasestorage.app",
  messagingSenderId: "559759112253",
  appId: "1:559759112253:web:5096251a496f77c0cf1254",
  measurementId: "G-70T85V4SQ6"
};

let db = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.warn("Firebase failed to initialize (device may be offline):", e);
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const STORAGE_KEY = "sonetpay-tracker-state";
const KFS_VERSION = "CF04058719-2026-06-01-84EMI";

function generate84Payments() {
  const payments = [];
  for (let i = 1; i <= 84; i++) {
    const year = 2026 + Math.floor((4 + i - 1) / 12);
    const monthIndex = (4 + i - 1) % 12;
    const month = String(monthIndex + 1).padStart(2, "0");
    const dateStr = `${year}-${month}-05`;

    payments.push({
      id: crypto.randomUUID(),
      date: dateStr,
      amount: 15995,
      mode: "EMI",
      reference: `KFS-CF04058719-EMI-${String(i).padStart(2, "0")}`,
      status: "Pending",
      note: `EMI ${i} of 84 as per KFS`
    });
  }
  return payments;
}

const seedState = {
  settings: {
    kfsVersion: KFS_VERSION,
    vehicleCost: 1343580,
    downPayment: 957768,
    targetMonthlyPayment: 15995,
    loanAmount: 929000,
    sanctionedLoanAmount: 957768,
    netDisbursedAmount: 922500,
    totalInterest: 385812,
    feesAndCharges: 35268,
    rateOfInterest: 10.1,
    apr: 11.31,
    loanTermMonths: 84,
    repaymentStartDate: "2026-05-05",
    isSyncEnabled: false,
    shareId: "",
    passcodeHash: ""
  },
  payments: generate84Payments(),
  debts: [
    { id: crypto.randomUUID(), name: "Father", type: "Borrowed", amount: 150000, date: "2026-04-15", note: "Downpayment support" },
    { id: crypto.randomUUID(), name: "Father", type: "Returned", amount: 50000, date: "2026-05-20", note: "Part payment return" },
    { id: crypto.randomUUID(), name: "Ahmad (Friend)", type: "Borrowed", amount: 30000, date: "2026-05-10", note: "Insurance cost support" }
  ],
  theme: "light"
};

let state = loadState();
let pendingDeletePaymentId = "";
let pendingDeleteDebtId = "";
let confirmType = ""; // "payment" or "debt"

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return structuredClone(seedState);

  try {
    const parsed = JSON.parse(stored);
    if (!parsed.debts) parsed.debts = [];
    if (!parsed.settings) parsed.settings = {};
    if (parsed.settings.isSyncEnabled === undefined) parsed.settings.isSyncEnabled = false;
    if (!parsed.settings.shareId) parsed.settings.shareId = "";
    if (!parsed.settings.passcodeHash) parsed.settings.passcodeHash = "";
    return migrateState({ ...structuredClone(seedState), ...parsed });
  } catch {
    return structuredClone(seedState);
  }
}

function migrateState(currentState) {
  if (currentState.settings?.kfsVersion === KFS_VERSION) return currentState;

  const standard84 = generate84Payments();
  const nextState = {
    ...currentState,
    settings: { ...currentState.settings, ...structuredClone(seedState.settings), kfsVersion: KFS_VERSION }
  };

  if (currentState.payments && currentState.payments.length > 0) {
    const existingMap = new Map();
    currentState.payments.forEach((p) => {
      if (p.date) {
        existingMap.set(p.date, p);
      }
    });

    const mergedPayments = standard84.map((std) => {
      const match = existingMap.get(std.date);
      if (match) {
        return {
          ...std,
          ...match,
          id: match.id || std.id
        };
      }
      return std;
    });

    const standardDates = new Set(standard84.map((std) => std.date));
    const customPayments = currentState.payments.filter((p) => p.date && !standardDates.has(p.date));

    nextState.payments = [...customPayments, ...mergedPayments];
  } else {
    nextState.payments = standard84;
  }

  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// -------------------------------------------------------------
// PWA FIREBASE CLOUD SYNCHRONIZATION ENGINE
// -------------------------------------------------------------
async function hashPasscode(passcode) {
  const encoder = new TextEncoder();
  const data = encoder.encode(passcode);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function syncToCloud() {
  if (!state.settings.isSyncEnabled || !state.settings.shareId || !db) return;

  try {
    const docRef = doc(db, "trackers", state.settings.shareId);
    await setDoc(docRef, {
      payments: state.payments,
      debts: state.debts,
      settings: state.settings,
      theme: state.theme,
      passcodeHash: state.settings.passcodeHash,
      updatedAt: new Date().toISOString()
    });
    console.log("Successfully synced state to the cloud!");
    updateSyncBadge("Synced");
  } catch (err) {
    console.error("Failed to sync state to the cloud:", err);
    updateSyncBadge("Sync Error");
  }
}

function updateSyncBadge(status) {
  const badge = $("#syncStatusBadge");
  if (!badge) return;

  badge.textContent = status;
  badge.className = "status"; // reset classes

  if (status === "Synced") {
    badge.classList.add("Paid");
    badge.style.background = "";
    badge.style.color = "";
  } else if (status === "Offline Only") {
    badge.classList.add("Pending");
    badge.style.background = "";
    badge.style.color = "";
  } else if (status === "Sync Error" || status === "Syncing...") {
    badge.classList.add("Pending");
    badge.style.background = "";
    badge.style.color = "";
  } else if (status === "Shared View") {
    badge.classList.add("Paid");
    badge.style.background = "rgba(229, 9, 20, 0.15)";
    badge.style.color = "var(--red)";
  }
}

let activeUnsubscribe = null;

function checkSharedSession() {
  const params = new URLSearchParams(window.location.search);
  const shareId = params.get("id");
  if (!shareId) return;

  // Enter Read-Only Mode
  document.body.classList.add("read-only");
  document.body.classList.add("has-shared-banner");
  $("#sharedLiveBanner").style.display = "flex";
  $("#cloudSyncPanel").style.display = "none";
  updateSyncBadge("Shared View");

  // Subscribe to live database updates via onSnapshot
  if (db) {
    const docRef = doc(db, "trackers", shareId);
    activeUnsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        // Update local memory state (protect critical settings)
        state.payments = data.payments || [];
        state.debts = data.debts || [];
        state.theme = data.theme || "light";

        // Merge settings
        state.settings = {
          ...state.settings,
          ...data.settings,
          shareId: shareId,
          isSyncEnabled: true
        };

        // Render everything dynamically!
        document.documentElement.dataset.theme = state.theme;
        renderMetrics();
        renderPayments();
        renderInstallments();
        renderDebts();
      } else {
        console.warn("Shared document does not exist in Firestore.");
        alert("The shared tracker link is invalid or has been disabled by the owner.");
      }
    }, (error) => {
      console.error("Firestore live snapshot failed:", error);
    });
  }
}

async function unlockSharedSession() {
  const passcode = prompt("Enter your Owner Passcode to unlock editing permissions:");
  if (!passcode) return;

  const inputHash = await hashPasscode(passcode);
  if (inputHash === state.settings.passcodeHash) {
    // Correct passcode! Exit Read-Only Mode and unlock full controls
    document.body.classList.remove("read-only");
    document.body.classList.remove("has-shared-banner");
    $("#sharedLiveBanner").style.display = "none";
    $("#cloudSyncPanel").style.display = "block";

    // Save locally
    state.settings.isSyncEnabled = true;
    saveState();

    // Detach snapshot listener and re-render in Owner Mode
    if (activeUnsubscribe) {
      activeUnsubscribe();
      activeUnsubscribe = null;
    }

    render();
    alert("Owner access unlocked! You can now log and edit payments.");
  } else {
    alert("Incorrect passcode. Editing access remains locked.");
  }
}

function paidPayments() {
  return state.payments.filter((payment) => payment.status === "Paid");
}

function totalPaid() {
  return paidPayments().reduce((sum, payment) => sum + Number(payment.amount), 0);
}

function remainingBalance() {
  return Math.max(state.settings.vehicleCost - totalPaid(), 0);
}

function progressPercentage() {
  return Math.min(Math.round((totalPaid() / state.settings.vehicleCost) * 100), 100);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function monthKey(value) {
  return value.slice(0, 7);
}

function expectedCompletionDate() {
  const remaining = remainingBalance();
  if (remaining === 0) return "Completed";
  const months = Math.ceil(remaining / state.settings.targetMonthlyPayment);
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(date);
}
function switchTab(tabId) {
  $$(".tab-content").forEach((el) => el.classList.remove("active"));
  const tabEl = $(`#tab-${tabId}`);
  if (tabEl) tabEl.classList.add("active");

  // Update desktop sidebar
  $$(".nav-list a").forEach((el) => {
    el.classList.remove("active");
    if (el.getAttribute("data-tab-link") === tabId) {
      el.classList.add("active");
    }
  });

  // Update mobile bottom nav
  $$(".mobile-nav-item").forEach((el) => {
    el.classList.remove("active");
    if (el.getAttribute("data-tab") === tabId) {
      el.classList.add("active");
    }
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function switchSubTab(subTabId) {
  const isDebt = subTabId.startsWith("debt-");

  // Update buttons within the relevant main tab
  const buttons = isDebt 
    ? $$("#tab-debt .sub-tab-btn") 
    : $$("#tab-history .sub-tab-btn");

  buttons.forEach((el) => {
    el.classList.remove("active");
    if (el.getAttribute("data-sub-tab") === subTabId) {
      el.classList.add("active");
    }
  });

  if (isDebt) {
    const summaryContent = $("#sub-tab-debt-summary");
    const logsContent = $("#sub-tab-debt-logs");

    if (subTabId === "debt-summary") {
      summaryContent.classList.add("active");
      logsContent.classList.remove("active");
      summaryContent.style.display = "block";
      logsContent.style.display = "none";
    } else {
      summaryContent.classList.remove("active");
      logsContent.classList.add("active");
      summaryContent.style.display = "none";
      logsContent.style.display = "block";
    }
  } else {
    const paymentsContent = $("#sub-tab-payments");
    const timelineContent = $("#sub-tab-timeline");

    if (subTabId === "timeline") {
      paymentsContent.classList.remove("active");
      timelineContent.classList.add("active");
      paymentsContent.style.display = "none";
      timelineContent.style.display = "block";
    } else {
      paymentsContent.classList.add("active");
      timelineContent.classList.remove("active");
      paymentsContent.style.display = "block";
      timelineContent.style.display = "none";

      const select = $("#statusFilter");
      if (subTabId === "pending") {
        select.value = "Pending";
      } else if (subTabId === "completed") {
        select.value = "Paid";
      }
      renderPayments();
    }
  }
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  renderMetrics();
  renderPayments();
  renderInstallments();
  renderDebts();
  saveState();
  syncToCloud();
}

function renderMetrics() {
  const paid = totalPaid();
  const remaining = remainingBalance();
  const progress = progressPercentage();

  $("#metricCost").textContent = INR.format(state.settings.vehicleCost);
  $("#metricDown").textContent = INR.format(state.settings.downPayment);
  $("#metricPaid").textContent = INR.format(paid);
  $("#metricRemaining").textContent = INR.format(remaining);
  $("#expectedDate").textContent = `APR ${state.settings.apr}% - ${state.settings.loanTermMonths} months`;
  $("#progressLabel").textContent = `${progress}%`;
  $("#ringText").textContent = `${progress}%`;
  $("#progressBar").style.width = `${progress}%`;
  $("#progressRing").style.strokeDashoffset = `${320 - (320 * progress) / 100}`;
  $("#progressNarrative").textContent = `${INR.format(paid)} paid toward ${INR.format(state.settings.vehicleCost)} total payable. ${INR.format(remaining)} remains across the KFS repayment schedule.`;
  $("#paidCount").textContent = state.payments.filter((item) => item.status === "Paid").length;
  $("#pendingCount").textContent = state.payments.filter((item) => item.status === "Pending").length;
}

function renderPayments() {
  const search = $("#paymentSearch").value.trim().toLowerCase();
  const status = $("#statusFilter").value;
  const month = $("#monthFilter").value;

  const rows = state.payments
    .filter((payment) => status === "all" || payment.status === status)
    .filter((payment) => !month || monthKey(payment.date) === month)
    .filter((payment) => {
      const haystack = `${payment.mode} ${payment.reference} ${payment.note}`.toLowerCase();
      return !search || haystack.includes(search);
    });

  // Pending payments sorted from current/oldest to upcoming, others descending (latest first)
  if (status === "Pending") {
    rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  } else {
    rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  $("#paymentRows").innerHTML = rows.map((payment) => `
    <tr>
      <td data-label="Date">${formatDate(payment.date)}</td>
      <td data-label="Mode">${payment.mode}</td>
      <td data-label="Reference">${payment.reference || "No reference"}</td>
      <td data-label="Amount"><strong>${INR.format(payment.amount)}</strong></td>
      <td data-label="Status"><span class="status ${payment.status}">${payment.status}</span></td>
      <td data-label="Actions">
        <div class="row-actions">
          <button class="icon-btn" type="button" title="Edit" data-edit-payment="${payment.id}">Edit</button>
          <button class="icon-btn" type="button" title="Delete" data-delete-payment="${payment.id}">Del</button>
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="6">No payments match the current filters.</td></tr>`;
}

function renderInstallments() {
  const items = state.payments
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((payment, index) => {
      let title = "";
      if (payment.mode?.toLowerCase() === "down payment" || payment.note?.toLowerCase().includes("down payment")) {
        title = "Down Payment";
      } else if (payment.note && payment.note.includes("EMI")) {
        title = payment.note.split(" as per")[0]; // e.g. "EMI 1 of 84"
      } else if (payment.reference && payment.reference.includes("EMI")) {
        const parts = payment.reference.split("-");
        const num = parts[parts.length - 1];
        title = `EMI ${parseInt(num) || num} of 84`;
      } else {
        title = `Installment ${index + 1}`;
      }
      return `
        <div class="installment ${payment.status === "Pending" ? "pending" : ""}">
          <strong>${title}: ${INR.format(payment.amount)}</strong>
          <span>${formatDate(payment.date)} - ${payment.status} via ${payment.mode}</span>
        </div>
      `;
    });

  $("#installmentList").innerHTML = items.join("");
}

function renderDebts() {
  const aggregates = {};
  let totalBorrowed = 0;
  let totalReturned = 0;

  state.debts.forEach((d) => {
    const name = d.name.trim();
    if (!aggregates[name]) {
      aggregates[name] = { borrowed: 0, returned: 0 };
    }
    if (d.type === "Borrowed") {
      aggregates[name].borrowed += Number(d.amount);
      totalBorrowed += Number(d.amount);
    } else if (d.type === "Returned") {
      aggregates[name].returned += Number(d.amount);
      totalReturned += Number(d.amount);
    }
  });

  const netRemaining = Math.max(totalBorrowed - totalReturned, 0);

  const tbEl = $("#totalBorrowedMetric");
  if (tbEl) tbEl.textContent = INR.format(totalBorrowed);
  const trEl = $("#totalReturnedMetric");
  if (trEl) trEl.textContent = INR.format(totalReturned);
  const nrEl = $("#netRemainingMetric");
  if (nrEl) {
    nrEl.textContent = INR.format(netRemaining);
    nrEl.style.color = netRemaining > 0 ? "var(--red)" : "#13a15f";
  }

  const summaryHtml = Object.keys(aggregates).map((name) => {
    const data = aggregates[name];
    const outstanding = Math.max(data.borrowed - data.returned, 0);
    return `
      <tr>
        <td data-label="Funder"><strong>${name}</strong></td>
        <td data-label="Total Borrowed">${INR.format(data.borrowed)}</td>
        <td data-label="Total Returned">${INR.format(data.returned)}</td>
        <td data-label="Net Outstanding"><strong style="color: ${outstanding > 0 ? "var(--red)" : "#13a15f"}">${INR.format(outstanding)}</strong></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="4">No borrowing balances recorded yet.</td></tr>`;
  $("#debtSummaryRows").innerHTML = summaryHtml;

  const logsHtml = state.debts
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((d) => `
      <tr>
        <td data-label="Date">${formatDate(d.date)}</td>
        <td data-label="Funder"><strong>${d.name}</strong></td>
        <td data-label="Action"><span class="status ${d.type === "Borrowed" ? "Pending" : "Paid"}">${d.type}</span></td>
        <td data-label="Amount"><strong>${INR.format(d.amount)}</strong></td>
        <td data-label="Note">${d.note || "-"}</td>
        <td data-label="Action">
          <button class="icon-btn" type="button" title="Delete" data-delete-debt="${d.id}">Del</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="6">No transaction logs recorded yet.</td></tr>`;
  $("#debtLogRows").innerHTML = logsHtml;
}





function openPaymentDialog(payment = null) {
  $("#dialogTitle").textContent = payment ? "Edit payment" : "Add payment";
  $("#paymentId").value = payment?.id || "";
  $("#paymentDate").value = payment?.date || new Date().toISOString().slice(0, 10);
  $("#paymentAmount").value = payment?.amount || "";
  $("#paymentMode").value = payment?.mode || "";
  $("#paymentReference").value = payment?.reference || "";
  $("#paymentStatus").value = payment?.status || "Paid";
  $("#paymentNote").value = payment?.note || "";
  $("#paymentDialog").showModal();
}

function openDeletePaymentDialog(paymentId) {
  const payment = state.payments.find((item) => item.id === paymentId);
  if (!payment) return;

  pendingDeletePaymentId = paymentId;
  confirmType = "payment";
  $("#confirmTitle").textContent = "Delete payment log?";
  $("#confirmMessage").textContent = `${INR.format(payment.amount)} from ${formatDate(payment.date)} will be removed. This will update your total paid and remaining balance.`;
  $("#confirmDeleteAction").textContent = "Delete payment";
  $("#confirmDialog").showModal();
}

function openDeleteDebtDialog(debtId) {
  const debt = state.debts.find((item) => item.id === debtId);
  if (!debt) return;

  pendingDeleteDebtId = debtId;
  confirmType = "debt";
  $("#confirmTitle").textContent = "Delete transaction?";
  $("#confirmMessage").textContent = `${debt.type} transaction log of ${INR.format(debt.amount)} from ${debt.name} will be removed. This will update your co-funder outstanding balance.`;
  $("#confirmDeleteAction").textContent = "Delete transaction";
  $("#confirmDialog").showModal();
}

function closeMobileMenu() {
  document.body.classList.remove("menu-open");
  $("#menuToggle").setAttribute("aria-expanded", "false");
}

function closeExportMenu() {
  $(".export-menu").classList.remove("open");
  $("#exportToggle").setAttribute("aria-expanded", "false");
}

function savePaymentFromForm() {
  if (!$("#paymentForm").reportValidity()) return;

  const payment = {
    id: $("#paymentId").value || crypto.randomUUID(),
    date: $("#paymentDate").value,
    amount: Number($("#paymentAmount").value),
    mode: $("#paymentMode").value.trim(),
    reference: $("#paymentReference").value.trim(),
    status: $("#paymentStatus").value,
    note: $("#paymentNote").value.trim()
  };

  if (!payment.date || !payment.amount || !payment.mode) return;

  const existingIndex = state.payments.findIndex((item) => item.id === payment.id);
  if (existingIndex >= 0) {
    state.payments[existingIndex] = payment;
  } else {
    state.payments.push(payment);
  }

  $("#paymentDialog").close();
  render();
}

function exportExcel() {
  const rows = [
    ["SonetPay Tracker Export"],
    ["Total Vehicle Cost", state.settings.vehicleCost],
    ["Total Paid", totalPaid()],
    ["Remaining Balance", remainingBalance()],
    [],
    ["Date", "Mode", "Reference", "Amount", "Status", "Note"],
    ...state.payments.map((payment) => [payment.date, payment.mode, payment.reference, payment.amount, payment.status, payment.note])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  download(`sonetpay-tracker-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".export-menu")) closeExportMenu();

  const target = event.target.closest("button, a");
  if (!target) return;

  const tabId = target.getAttribute("data-tab") || target.getAttribute("data-tab-link");
  if (tabId) {
    event.preventDefault();
    switchTab(tabId);
    return;
  }

  const subTab = target.getAttribute("data-sub-tab");
  if (subTab) {
    event.preventDefault();
    switchSubTab(subTab);
    return;
  }

  if (target.matches("[data-open-payment]")) openPaymentDialog();

  if (target.id === "exportToggle") {
    const menu = $(".export-menu");
    const isOpen = menu.classList.toggle("open");
    $("#exportToggle").setAttribute("aria-expanded", String(isOpen));
  }

  const editId = target.dataset.editPayment;
  if (editId) openPaymentDialog(state.payments.find((payment) => payment.id === editId));

  const deletePayment = target.dataset.deletePayment;
  if (deletePayment) {
    openDeletePaymentDialog(deletePayment);
  }
  const deleteDebtId = target.dataset.deleteDebt;
  if (deleteDebtId) {
    openDeleteDebtDialog(deleteDebtId);
  }

  if (target.closest(".nav-list a")) closeMobileMenu();
});

$("#savePayment").addEventListener("click", savePaymentFromForm);
$("#confirmDeleteAction").addEventListener("click", () => {
  if (confirmType === "payment" && pendingDeletePaymentId) {
    state.payments = state.payments.filter((payment) => payment.id !== pendingDeletePaymentId);
    pendingDeletePaymentId = "";
  } else if (confirmType === "debt" && pendingDeleteDebtId) {
    state.debts = state.debts.filter((d) => d.id !== pendingDeleteDebtId);
    pendingDeleteDebtId = "";
  }
  confirmType = "";
  $("#confirmDialog").close();
  render();
});
$("#confirmDialog").addEventListener("close", () => {
  pendingDeletePaymentId = "";
  pendingDeleteDebtId = "";
  confirmType = "";
});
$("#menuToggle").addEventListener("click", () => {
  const isOpen = document.body.classList.toggle("menu-open");
  $("#menuToggle").setAttribute("aria-expanded", String(isOpen));
});
$("#paymentSearch").addEventListener("input", renderPayments);
$("#statusFilter").addEventListener("change", renderPayments);
$("#monthFilter").addEventListener("change", renderPayments);
$("#exportExcel").addEventListener("click", () => {
  closeExportMenu();
  exportExcel();
});
$("#exportPdf").addEventListener("click", () => {
  closeExportMenu();
  window.print();
});
$("#themeToggle").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  render();
});
$("#debtForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.debts.push({
    id: crypto.randomUUID(),
    name: $("#debtName").value.trim(),
    type: $("#debtType").value,
    amount: Number($("#debtAmount").value),
    date: $("#debtDate").value,
    note: $("#debtNote").value.trim()
  });
  event.target.reset();
  $("#debtDate").value = new Date().toISOString().slice(0, 10);
  render();
});

$("#debtDate").value = new Date().toISOString().slice(0, 10);
render();
switchSubTab("pending");

// Prevent text copying via copy command
document.addEventListener("copy", (event) => {
  event.preventDefault();
});

// Register Service Worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then((reg) => console.log("Service Worker registered successfully:", reg.scope))
      .catch((err) => console.error("Service Worker registration failed:", err));
  });
}

// PWA Custom Install Prompt Banner
let deferredPrompt = null;
const pwaBanner = $("#pwaInstallBanner");
const btnInstallPwa = $("#btnInstallPwa");
const pwaTitle = $("#pwaTitle");
const pwaInstructions = $("#pwaInstructions");

// Detect Standalone/Installed Mode
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

if (!isStandalone) {
  // 1. Android/Desktop Chrome browser standard install trigger
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (pwaBanner) pwaBanner.style.display = "flex";
  });

  // 2. iOS Safari Custom Prompt Detection
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    if (pwaBanner) {
      pwaBanner.style.display = "flex";
      if (pwaTitle) {
        pwaTitle.textContent = "Install App";
      }
      if (pwaInstructions) {
        pwaInstructions.textContent = "Tap Share > Add to Home Screen";
      }
      if (btnInstallPwa) {
        btnInstallPwa.textContent = "Okay";
        btnInstallPwa.addEventListener("click", () => {
          pwaBanner.style.display = "none";
        });
      }
    }
  }
}

// Close Banner click action
if ($("#closePwaBanner")) {
  $("#closePwaBanner").addEventListener("click", () => {
    if (pwaBanner) pwaBanner.style.display = "none";
  });
}

// Install Button click action (triggers native prompt)
if (btnInstallPwa) {
  btnInstallPwa.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`PWA install prompt choice: ${outcome}`);
      deferredPrompt = null;
      if (pwaBanner) pwaBanner.style.display = "none";
    }
  });
}

// -------------------------------------------------------------
// PWA CLOUD SHARING EVENT LISTENERS & INITS
// -------------------------------------------------------------

async function handleEnableCloudSync(e) {
  e.preventDefault();
  const passcode = $("#syncPasscode").value.trim();
  if (passcode.length < 4) {
    alert("Passcode must be at least 4 characters.");
    return;
  }
  
  try {
    const hashed = await hashPasscode(passcode);
    
    state.settings.passcodeHash = hashed;
    state.settings.shareId = crypto.randomUUID();
    state.settings.isSyncEnabled = true;
    
    saveState();
    await syncToCloud();
    
    $("#syncSetupBlock").style.display = "none";
    $("#syncActiveBlock").style.display = "block";
    $("#shareLinkUrl").value = `${window.location.origin}${window.location.pathname}?id=${state.settings.shareId}`;
  } catch (err) {
    console.error("Failed to enable sync:", err);
    alert("An error occurred while enabling sync.");
  }
}

function handleDisableCloudSync() {
  if (!confirm("Are you sure you want to disable cloud sync? Your shared link will stop working.")) return;
  
  state.settings.isSyncEnabled = false;
  state.settings.shareId = "";
  state.settings.passcodeHash = "";
  
  saveState();
  
  $("#syncSetupBlock").style.display = "block";
  $("#syncActiveBlock").style.display = "none";
  $("#syncPasscode").value = "";
  updateSyncBadge("Offline Only");
}

// Form Enable Sync Action
if ($("#formEnableSync")) {
  $("#formEnableSync").addEventListener("submit", handleEnableCloudSync);
}

// Copy Share Link to Clipboard
if ($("#btnCopyShareLink")) {
  $("#btnCopyShareLink").addEventListener("click", () => {
    const shareInput = $("#shareLinkUrl");
    if (shareInput) {
      shareInput.select();
      shareInput.setSelectionRange(0, 99999); // Mobile compatibility
      navigator.clipboard.writeText(shareInput.value)
        .then(() => alert("Shared link copied to clipboard!"))
        .catch(() => alert("Failed to copy. Please manually copy the URL field."));
    }
  });
}

// Disable Cloud Sync Action
if ($("#btnDisableSync")) {
  $("#btnDisableSync").addEventListener("click", handleDisableCloudSync);
}

// Unlock Edit Action inside Shared View
if ($("#btnUnlockEdit")) {
  $("#btnUnlockEdit").addEventListener("click", unlockSharedSession);
}

// Initialize Cloud sync UI display
if (state.settings.isSyncEnabled && state.settings.shareId) {
  $("#syncSetupBlock").style.display = "none";
  $("#syncActiveBlock").style.display = "block";
  $("#shareLinkUrl").value = `${window.location.origin}${window.location.pathname}?id=${state.settings.shareId}`;
  updateSyncBadge("Synced");
} else {
  $("#syncSetupBlock").style.display = "block";
  $("#syncActiveBlock").style.display = "none";
  updateSyncBadge("Offline Only");
}

// Check for shared read-only session at boot-up
checkSharedSession();
