/* ============================================================
   eSaka — shared "Report Summary" card
   One renderer + one stylesheet for AEW, Municipal, Provincial
   and DA-RFO, so the card looks and behaves the same everywhere.

   Usage (each role keeps its own #reportSummaryCardWrapper markup):
     EsakaReportSummary.render(intents, meta)
   Needs: #reportSummaryCardWrapper, #reportSummaryBody,
          #summaryCoveragePeriod (optional)
============================================================ */
(function () {
    "use strict";

    /* ---------- styles (injected once) ---------- */
    const CSS = `
#reportSummaryCardWrapper { width:100%; max-width:980px; margin:0 auto 24px !important; }
#reportSummaryCardWrapper > .summary-card {
    background:#FFFFFF !important; border:1px solid var(--border,#DCE4DF) !important; border-radius:16px !important;
    padding:20px 22px 22px !important; margin:0 !important; box-shadow:0 2px 10px rgba(11,56,42,.05) !important;
}
#reportSummaryCardWrapper .summary-card-header {
    display:flex !important; justify-content:space-between; align-items:flex-start; gap:12px;
    padding:0 0 14px !important; margin:0 0 16px !important; border-bottom:1px solid var(--border-light,#E8EEEA) !important;
}
#reportSummaryCardWrapper .summary-card-title {
    font-size:13px !important; font-weight:800 !important; letter-spacing:.06em; text-transform:uppercase; color:var(--primary,#0B382A) !important;
}
#reportSummaryCardWrapper .summary-card-subtitle { font-size:12px; color:var(--muted,#5F6B65); margin-top:4px; }
#reportSummaryToggle {
    font-size:11px !important; font-weight:700; color:var(--primary,#0B382A) !important; background:#F3F7F2 !important;
    border:1px solid var(--border,#DCE4DF) !important; border-radius:999px !important; padding:5px 12px !important; cursor:pointer; user-select:none;
}
#reportSummaryToggle:hover { background:#E6F0E9 !important; }

.rs-grid { display:grid; grid-template-columns:repeat(6, minmax(0, 1fr)); gap:14px; }
.rs-card {
    grid-column:span 3; min-width:0; background:#FBFCFB; border:1px solid var(--border-light,#E8EEEA);
    border-top:3px solid var(--rs-accent,#0B382A); border-radius:12px; padding:14px 16px;
}
.rs-card.rs-third { grid-column:span 2; }
.rs-title { display:flex; align-items:center; gap:8px; font-size:10.5px; font-weight:800; letter-spacing:.07em; text-transform:uppercase; color:var(--muted,#5F6B65); margin-bottom:10px; }
.rs-icon { width:22px; height:22px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; font-size:12px; background:var(--rs-tint,#E6F0E9); flex:0 0 22px; }
.rs-value { font-size:28px; font-weight:800; line-height:1.1; color:var(--rs-accent,#0B382A); letter-spacing:-.02em; }
.rs-sub { font-size:11.5px; color:var(--muted,#5F6B65); margin-top:4px; }
.rs-row { display:flex; justify-content:space-between; align-items:baseline; gap:12px; padding:6px 0; font-size:13px; border-bottom:1px dashed var(--border-light,#E8EEEA); }
.rs-row:last-child { border-bottom:none; }
.rs-row > span { min-width:0; overflow-wrap:anywhere; }
.rs-row > b { flex:0 0 auto; text-align:right; color:var(--ink,#202824); font-variant-numeric:tabular-nums; }
.rs-muted { color:var(--muted,#5F6B65); }
.rs-empty { color:var(--muted,#5F6B65); font-style:italic; font-size:13px; }
.rs-chip { display:inline-block; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700; }
.rs-divider { margin-top:10px; padding-top:8px; border-top:1px solid var(--border-light,#E8EEEA); }
.rs-a-green  { --rs-accent:#0B382A; --rs-tint:#E6F0E9; }
.rs-a-gold   { --rs-accent:#B88A06; --rs-tint:#FEF3C7; }
.rs-a-leaf   { --rs-accent:#187A4A; --rs-tint:#DCFCE7; }
.rs-a-slate  { --rs-accent:#3F5A4C; --rs-tint:#E8EEEA; }
@media (max-width:760px) { .rs-card, .rs-card.rs-third { grid-column:1 / -1; } }
`;
    function ensureStyles() {
        if (document.getElementById("esaka-report-summary-css")) return;
        const el = document.createElement("style");
        el.id = "esaka-report-summary-css";
        el.textContent = CSS;
        document.head.appendChild(el);
    }

    /* ---------- helpers ---------- */
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const fmtKg = (v) => `${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} kg`;
    const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const plural = (n, word) => `${n} ${word}${n !== 1 ? "s" : ""}`;
    const statusOf = (i) => String(i.finalized_status_at_submission || i.finalized_status || "NOT PLANTED").toUpperCase();

    const card = (cls, accent, icon, title, inner) => `
        <div class="rs-card ${cls} rs-a-${accent}">
            <div class="rs-title"><span class="rs-icon" aria-hidden="true">${icon}</span>${title}</div>
            ${inner}
        </div>`;
    const row = (label, value) => `<div class="rs-row"><span class="rs-muted">${label}</span><b>${value}</b></div>`;

    function breakdown(map) {
        const entries = Object.entries(map).sort((a, b) => b[1].volume - a[1].volume);
        if (!entries.length) return `<span class="rs-empty">No data.</span>`;
        return entries.map(([name, d]) =>
            `<div class="rs-row"><span style="font-weight:600;">${esc(name)}</span><b><span class="rs-muted" style="font-weight:600;">${d.count} · </span>${fmtKg(d.volume)}</b></div>`
        ).join("");
    }

    /* ---------- render ---------- */
    function render(intents, meta) {
        ensureStyles();
        const wrapper = document.getElementById("reportSummaryCardWrapper");
        const body = document.getElementById("reportSummaryBody");
        const coverageEl = document.getElementById("summaryCoveragePeriod");
        if (!wrapper || !body) return;

        if (!Array.isArray(intents) || intents.length === 0) { wrapper.style.display = "none"; return; }
        wrapper.style.display = "block";

        const selected = intents;
        const count = selected.length;

        if (coverageEl) {
            const submittedAt = meta?.submitted_at || meta?.created_at;
            const reportDate = submittedAt ? new Date(submittedAt) : null;
            if (reportDate && !isNaN(reportDate.getTime())) {
                const start = new Date(reportDate); start.setDate(reportDate.getDate() - 6);
                coverageEl.textContent = `Coverage: ${fmtDate(start)} – ${fmtDate(reportDate)}`;
            } else coverageEl.textContent = "Coverage: —";
        }

        const totalVolume = selected.reduce((s, i) => s + (Number(i.volume) || 0), 0);
        const farmers = new Set(selected.map(i => i.farmer_id || i.farmer_name).filter(Boolean)).size;

        const byCommodity = {}, byBarangay = {};
        selected.forEach(i => {
            const vol = Number(i.volume) || 0;
            const c = i.commodity || "Unknown";
            (byCommodity[c] = byCommodity[c] || { count: 0, volume: 0 }); byCommodity[c].count++; byCommodity[c].volume += vol;
            let b = i.barangay;
            if (!b && i.location) b = String(i.location).split(",")[0].trim();
            if (!b) b = i.municipality || "Unknown";
            (byBarangay[b] = byBarangay[b] || { count: 0, volume: 0 }); byBarangay[b].count++; byBarangay[b].volume += vol;
        });

        // yield performance
        const withActual = selected.filter(i => statusOf(i) === "HARVESTED" && Number(i.actual_harvest_volume) > 0);
        const yieldActual = withActual.reduce((s, i) => s + Number(i.actual_harvest_volume), 0);
        const yieldPlanned = withActual.reduce((s, i) => s + (Number(i.volume) || 0), 0);
        let yieldHtml;
        if (yieldActual > 0) {
            const pct = yieldPlanned > 0 ? Math.round(((yieldActual - yieldPlanned) / yieldPlanned) * 100) : 0;
            let color = "#187A4A", icon = "↑", label = "surplus";
            if (pct < 0) { color = "#C0392B"; icon = "↓"; label = "shortfall"; }
            else if (pct === 0) { color = "#5F6B65"; icon = "→"; label = "on target"; }
            yieldHtml = row("Expected (planned):", `${yieldPlanned.toLocaleString("en-US")} kg`)
                + row("Actual (harvested):", `${yieldActual.toLocaleString("en-US")} kg`)
                + `<div style="margin-top:10px;"><span class="rs-chip" style="background:${color}1A;color:${color};">${icon} ${Math.abs(pct)}% ${label}</span></div>`
                + `<div class="rs-sub" style="font-style:italic;">Based on ${withActual.length} of ${count} intents</div>`;
        } else {
            yieldHtml = `<span class="rs-empty">No actual harvest volume recorded yet.</span>`;
        }

        // planting / harvest window
        const toDates = (key) => selected.map(i => i[key]).filter(Boolean)
            .map(d => new Date(`${String(d).slice(0, 10)}T00:00:00`)).filter(d => !isNaN(d.getTime()));
        const span = (arr) => {
            const lo = new Date(Math.min.apply(null, arr)), hi = new Date(Math.max.apply(null, arr));
            return { lo, hi, days: Math.round((hi - lo) / 86400000) };
        };
        const plantingDates = toDates("planting_date"), harvestDates = toDates("harvest_date");
        let windowHtml;
        if (plantingDates.length) {
            const p = span(plantingDates);
            windowHtml = row("Earliest planting:", fmtDate(p.lo)) + row("Latest planting:", fmtDate(p.hi)) + row("Span:", plural(p.days, "day"));
            if (harvestDates.length) {
                const h = span(harvestDates);
                windowHtml += `<div class="rs-divider">${row("Earliest harvest:", fmtDate(h.lo))}${row("Latest harvest:", fmtDate(h.hi))}${row("Harvest span:", plural(h.days, "day"))}</div>`;
            }
        } else {
            windowHtml = `<span class="rs-empty">No planting dates available.</span>`;
        }

        body.innerHTML = `
        <div class="rs-grid">
            ${card("rs-third", "green", "✓", "Selected Intents", `<div class="rs-value">${count}</div><div class="rs-sub">${count === 1 ? "Intent included" : "Intents included"}</div>`)}
            ${card("rs-third", "gold", "📦", "Total Volume", `<div class="rs-value">${fmtKg(totalVolume)}</div><div class="rs-sub">Sum of estimated volumes</div>`)}
            ${card("rs-third", "leaf", "👥", "Unique Farmers", `<div class="rs-value">${farmers}</div><div class="rs-sub">${farmers === 1 ? "1 beneficiary" : `${farmers} beneficiaries`}</div>`)}
            ${card("", "green", "🌾", "By Commodity", breakdown(byCommodity))}
            ${card("", "gold", "📍", "By Barangay", breakdown(byBarangay))}
            ${card("", "leaf", "📊", "Yield Performance", yieldHtml)}
            ${card("", "slate", "📅", "Planting Window", windowHtml)}
        </div>`;
    }

    window.EsakaReportSummary = { render, ensureStyles };
    document.addEventListener("DOMContentLoaded", ensureStyles);
})();