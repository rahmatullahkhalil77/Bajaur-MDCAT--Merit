/* ============================================================
   Bajaur MDCAT Merit List — shared logic
   Runs on the single index.html page: registration form section
   and merit list section both live here, so both blocks below
   run together.
   ============================================================ */

(function () {
  "use strict";

  const STORAGE_KEY = "bajaurMdcatEntries";       // localStorage fallback / demo cache
  const SUBMITTED_KEY = "bajaurMdcatSubmitted";    // sessionStorage duplicate guard
  const PLACEHOLDER_URL = "PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";

  const rawUrl = (typeof CONFIG !== "undefined" && CONFIG.API_URL) || "";
  const API_URL = rawUrl.trim();
  const isBackendConfigured = API_URL.length > 0 && API_URL !== PLACEHOLDER_URL;

  // ---------- helpers ----------

  function clamp(n) {
    return Math.round(n * 100) / 100;
  }

  function computeAggregate(m) {
    const mdcatPart = (m.mdcatObtained / m.mdcatTotal) * 50;
    const fscPart = (m.fscObtained / m.fscTotal) * 40;
    const matricPart = (m.matricObtained / m.matricTotal) * 10;
    return clamp(mdcatPart + fscPart + matricPart);
  }

  function readLocalEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocalEntry(entry) {
    try {
      const entries = readLocalEntries();
      entries.push(entry);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      /* storage unavailable — ignore, submission still counted server-side if configured */
    }
  }

  // ============================================================
  // REGISTRATION FORM
  // ============================================================

  const form = document.getElementById("mdcat-form");

  if (form) {
    const fields = {
      studentName: document.getElementById("student-name"),
      district: document.getElementById("district"),
      mdcatObtained: document.getElementById("mdcat-obtained"),
      mdcatTotal: document.getElementById("mdcat-total"),
      matricObtained: document.getElementById("matric-obtained"),
      matricTotal: document.getElementById("matric-total"),
      fscObtained: document.getElementById("fsc-obtained"),
      fscTotal: document.getElementById("fsc-total")
    };

    const aggPreview = document.getElementById("agg-preview");
    const formCard = document.getElementById("form-card");
    const resultCard = document.getElementById("result-card");
    const errorBox = document.getElementById("form-error");
    const successBox = document.getElementById("form-success");
    const submitBtn = document.getElementById("submit-btn");
    const submitLabel = submitBtn.querySelector(".btn-label") || submitBtn;

    function setSubmitting(isSubmitting) {
      submitBtn.disabled = isSubmitting;
      submitBtn.classList.toggle("is-loading", isSubmitting);
      submitLabel.textContent = isSubmitting ? "Submitting…" : "Submit Result";
    }

    function fieldWrap(input) {
      return input.closest(".field");
    }

    function setFieldError(input, message) {
      const wrap = fieldWrap(input);
      const errEl = wrap.querySelector(".field-error");
      if (message) {
        wrap.classList.add("invalid");
        errEl.textContent = message;
      } else {
        wrap.classList.remove("invalid");
        errEl.textContent = "";
      }
    }

    function numberOrNull(input) {
      const v = input.value.trim();
      if (v === "") return null;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    }

    // Validates every field; returns { valid, marks } — marks only present if valid.
    // Every student's own obtained/total figures are used — no totals are assumed.
    function validate({ silent = false } = {}) {
      let valid = true;

      function fail(input, message) {
        valid = false;
        if (!silent) setFieldError(input, message);
      }
      function ok(input) {
        if (!silent) setFieldError(input, null);
      }

      if (!fields.studentName.value.trim()) {
        fail(fields.studentName, "Please enter the student's name.");
      } else {
        ok(fields.studentName);
      }

      if (fields.district.value.trim().toLowerCase() !== "bajaur") {
        fail(fields.district, "Only Bajaur District students can submit.");
      } else {
        ok(fields.district);
      }

      function checkPair(obtInput, totInput, label, hardCap) {
        const obt = numberOrNull(obtInput);
        const tot = numberOrNull(totInput);

        if (tot === null || tot <= 0) { fail(totInput, `Enter a valid ${label} total (must be greater than 0).`); return null; }
        if (hardCap && tot > hardCap) { fail(totInput, `${label} total cannot exceed ${hardCap}.`); return null; }
        if (obt === null) { fail(obtInput, `Enter ${label} obtained marks.`); return null; }
        if (obt < 0) { fail(obtInput, "Marks cannot be negative."); return null; }
        if (obt > tot) { fail(obtInput, `Cannot exceed this student's total (${tot}).`); return null; }

        ok(obtInput);
        ok(totInput);
        return { obt, tot };
      }

      // No hard-coded totals: every student enters their own actual total for
      // each subject (MDCAT included), so no cap is enforced here.
      const mdcat = checkPair(fields.mdcatObtained, fields.mdcatTotal, "MDCAT");
      const matric = checkPair(fields.matricObtained, fields.matricTotal, "Matric");
      const fsc = checkPair(fields.fscObtained, fields.fscTotal, "FSc");

      if (!mdcat || !matric || !fsc) return { valid: false };

      return {
        valid,
        marks: {
          studentName: fields.studentName.value.trim(),
          district: "Bajaur",
          mdcatObtained: mdcat.obt,
          mdcatTotal: mdcat.tot,
          matricObtained: matric.obt,
          matricTotal: matric.tot,
          fscObtained: fsc.obt,
          fscTotal: fsc.tot
        }
      };
    }

    function updateLivePreview() {
      const { valid, marks } = validate({ silent: true });
      if (valid && marks) {
        const agg = computeAggregate(marks);
        aggPreview.innerHTML = agg.toFixed(2) + "<span> %</span>";
      } else {
        aggPreview.innerHTML = "&mdash;<span> %</span>";
      }
    }

    Object.values(fields).forEach((input) => {
      input.addEventListener("input", updateLivePreview);
    });
    updateLivePreview();

    function showAlert(box, message) {
      box.textContent = message;
      box.classList.remove("hidden");
    }
    function hideAlerts() {
      errorBox.classList.add("hidden");
      successBox.classList.add("hidden");
    }

    function alreadySubmittedThisSession() {
      try {
        return sessionStorage.getItem(SUBMITTED_KEY) === "true";
      } catch (e) {
        return false;
      }
    }
    function markSubmittedThisSession() {
      try { sessionStorage.setItem(SUBMITTED_KEY, "true"); } catch (e) { /* ignore */ }
    }

    // Sends the entry to Google Apps Script and reads back its real
    // response (Apps Script web apps return CORS-friendly responses,
    // so we avoid `no-cors` here to get proper success/duplicate errors).
    async function sendToBackend(entry) {
      if (!isBackendConfigured) return { ok: true, demo: true };
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(entry)
        });
        const data = await res.json();
        if (!data.ok) {
          return { ok: false, demo: false, error: data.error || "Submission was rejected." };
        }
        return { ok: true, demo: false, server: data };
      } catch (err) {
        return { ok: false, demo: false, error: "Network error." };
      }
    }

    form.addEventListener("submit", async function (evt) {
      evt.preventDefault();
      hideAlerts();

      if (alreadySubmittedThisSession()) {
        showAlert(errorBox, "You've already submitted from this browser. Each student may submit once — check the merit list to see your rank.");
        return;
      }

      const { valid, marks } = validate();
      if (!valid) {
        showAlert(errorBox, "Please correct the highlighted fields before submitting.");
        return;
      }

      setSubmitting(true);

      const aggregate = computeAggregate(marks);
      const entry = Object.assign({}, marks, {
        aggregate,
        submittedAt: new Date().toISOString()
      });

      const result = await sendToBackend(entry);

      setSubmitting(false);

      if (!result.ok) {
        showAlert(
          errorBox,
          result.error === "Duplicate submission."
            ? "A submission with this name already exists. Each student may only submit once."
            : "We couldn't reach the server. Please check your internet connection and try again."
        );
        return;
      }

      // Cache locally too (used automatically when the backend isn't configured yet).
      writeLocalEntry(entry);
      markSubmittedThisSession();

      document.getElementById("result-agg").textContent = aggregate.toFixed(2) + "%";
      document.getElementById("result-mdcat").textContent =
        marks.mdcatObtained + " / " + marks.mdcatTotal;
      document.getElementById("result-fsc").textContent =
        marks.fscObtained + " / " + marks.fscTotal;
      document.getElementById("result-matric").textContent =
        marks.matricObtained + " / " + marks.matricTotal;

      formCard.classList.add("hidden");
      resultCard.classList.remove("hidden");
      resultCard.scrollIntoView({ behavior: "smooth", block: "start" });

      // Refresh the merit list on this same page so the new entry appears immediately.
      if (typeof window.__refreshMeritList === "function") {
        window.__refreshMeritList();
      }
    });

    if (alreadySubmittedThisSession()) {
      showAlert(successBox, "You've already submitted your marks from this browser. Check the merit list below to see your rank.");
    }
  }

  // ============================================================
  // MERIT LIST
  // ============================================================

  const tbody = document.getElementById("merit-tbody");

  if (tbody) {
    const searchInput = document.getElementById("merit-search");
    const countBox = document.getElementById("merit-count");
    const metaBox = document.getElementById("merit-meta");
    const emptyState = document.getElementById("empty-state");
    const tableWrap = document.getElementById("table-wrap");
    const paginationBox = document.getElementById("merit-pagination");

    const PAGE_SIZE = 10;
    let allEntries = [];    // the complete dataset returned by the API (or local cache)
    let currentPage = 1;

    async function fetchEntries() {
      if (isBackendConfigured) {
        try {
          const res = await fetch(API_URL, { method: "GET" });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
              metaBox.textContent = "";
              return data;
            }
          }
        } catch (e) {
          // fall through to local cache below
        }
        metaBox.textContent = "Could not reach the live server — showing this browser's local entries only.";
        return readLocalEntries();
      }
      metaBox.textContent =
        "Demo mode: showing entries saved in this browser only. Paste your Apps Script URL into config.js to collect real, shared submissions.";
      return readLocalEntries();
    }

    // The Apps Script backend already returns aggregate + rank when configured;
    // this re-sorts defensively so the demo-mode (local) path ranks correctly too.
    // Ranks are assigned here, over the COMPLETE dataset, before any search
    // filtering or pagination — so a student's rank never changes whether
    // they're being searched for or viewed on any page.
    function rankAndSort(entries) {
      return entries
        .slice()
        .sort((a, b) => b.aggregate - a.aggregate)
        .map((entry, i) => Object.assign({}, entry, { rank: i + 1 }));
    }

    function escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str == null ? "" : String(str);
      return div.innerHTML;
    }

    function renderRows(pageItems) {
      tbody.innerHTML = "";
      pageItems.forEach((e) => {
        const tr = document.createElement("tr");
        const rankClass = e.rank <= 3 ? "rank-cell top-3" : "rank-cell";
        tr.innerHTML = `
          <td class="${rankClass}">${e.rank}</td>
          <td>${escapeHtml(e.studentName)}</td>
          <td>${escapeHtml(e.district)}</td>
          <td>${e.mdcatObtained} / ${e.mdcatTotal}</td>
          <td>${e.matricObtained} / ${e.matricTotal}</td>
          <td>${e.fscObtained} / ${e.fscTotal}</td>
          <td class="agg-cell">${Number(e.aggregate).toFixed(2)}%</td>
        `;
        tbody.appendChild(tr);
      });
    }

    function renderPaginationControls(totalPages) {
      paginationBox.innerHTML = "";
      if (totalPages <= 1) return;

      function makeButton(label, { page, disabled, current, ariaLabel } = {}) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "page-btn" + (current ? " is-current" : "");
        btn.textContent = label;
        if (ariaLabel) btn.setAttribute("aria-label", ariaLabel);
        if (current) btn.setAttribute("aria-current", "page");
        if (disabled) btn.disabled = true;
        if (!disabled && !current) {
          btn.addEventListener("click", () => {
            currentPage = page;
            renderPage();
            tableWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
        return btn;
      }

      function makeEllipsis() {
        const span = document.createElement("span");
        span.className = "page-ellipsis";
        span.textContent = "…";
        return span;
      }

      paginationBox.appendChild(
        makeButton("‹ Previous", { page: currentPage - 1, disabled: currentPage === 1, ariaLabel: "Previous page" })
      );

      // Show all page numbers when there aren't too many; otherwise a
      // condensed first/last + neighbours-of-current view with ellipses.
      const pages = [];
      if (totalPages <= 7) {
        for (let p = 1; p <= totalPages; p++) pages.push(p);
      } else {
        pages.push(1);
        if (currentPage > 3) pages.push("…");
        for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) {
          pages.push(p);
        }
        if (currentPage < totalPages - 2) pages.push("…");
        pages.push(totalPages);
      }

      pages.forEach((p) => {
        if (p === "…") {
          paginationBox.appendChild(makeEllipsis());
        } else {
          paginationBox.appendChild(makeButton(String(p), { page: p, current: p === currentPage }));
        }
      });

      paginationBox.appendChild(
        makeButton("Next ›", { page: currentPage + 1, disabled: currentPage === totalPages, ariaLabel: "Next page" })
      );
    }

    // Filters + paginates the already-ranked full dataset, then renders the
    // table, pagination controls, and count for whichever page is current.
    function renderPage() {
      const ranked = rankAndSort(allEntries);
      const filterText = searchInput.value.trim();

      const filtered = filterText
        ? ranked.filter((e) => (e.studentName || "").toLowerCase().includes(filterText.toLowerCase()))
        : ranked;

      const totalItems = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
      if (currentPage > totalPages) currentPage = totalPages;
      if (currentPage < 1) currentPage = 1;

      if (totalItems === 0) {
        tableWrap.querySelector("table").classList.add("hidden");
        emptyState.classList.remove("hidden");
        emptyState.querySelector("p").innerHTML = filterText
          ? "No student found."
          : 'No submissions yet. Be the first Bajaur student to <a href="#register">join the merit list</a>.';
        paginationBox.innerHTML = "";
      } else {
        tableWrap.querySelector("table").classList.remove("hidden");
        emptyState.classList.add("hidden");

        const start = (currentPage - 1) * PAGE_SIZE;
        renderRows(filtered.slice(start, start + PAGE_SIZE));
        renderPaginationControls(totalPages);
      }

      countBox.textContent = filterText
        ? (totalItems === 1 ? "1 student found" : `${totalItems} students found`)
        : (allEntries.length === 1 ? "1 student registered" : `${allEntries.length} students registered`);
    }

    searchInput.addEventListener("input", () => {
      currentPage = 1;
      renderPage();
    });

    async function loadAndRender() {
      allEntries = await fetchEntries();
      currentPage = 1;
      renderPage();
    }

    // Exposed so the registration form can refresh the list right after a submission.
    window.__refreshMeritList = function () {
      loadAndRender();
    };

    loadAndRender();
  }
})();
