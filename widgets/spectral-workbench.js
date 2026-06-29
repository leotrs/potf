// spectral-workbench.js
//
// Interactive spectral workbench for the edges->eigenvalues thesis. The reader
// edits a small graph (click two vertices to join them; click an edge to remove
// it) and chooses r (the forbidden clique is K_{r+1}). The full adjacency
// spectrum is computed in-page (Jacobi eigenvalue method, no dependency) and
// drawn as a dot plot on an eigenvalue axis with two bounds marked:
//
//     2m/n  <=  lambda_1  <=  sqrt(2m(1 - 1/r))   (Nikiforov's spectral Turan
//                                                  bound, valid for K_{r+1}-free
//                                                  graphs; r = 2 is Nosal's sqrt m)
//
// The point, for an audience that knows Turan cold: lambda_1 is not a function
// of m. Structure moves the spectrum, and the spectral bound is strictly
// stronger than the edge bound. Put a K_{r+1} in the graph and lambda_1 can
// cross the ceiling -- the hypothesis becoming load-bearing in front of you.
//
// Dispatches "spectral:change" so reactive prose can subscribe.

(function () {
  const N = 6;

  // All eigenvalues of a symmetric matrix, by cyclic Jacobi rotations.
  function eigenvalues(adj, n) {
    const A = adj.map((row) => row.map((x) => (x ? 1 : 0)));
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off < 1e-20) break;
      for (let p = 0; p < n; p++)
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(A[p][q]) < 1e-15) continue;
          const tau = (A[q][q] - A[p][p]) / (2 * A[p][q]);
          const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(tau * tau + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = A[k][p], akq = A[k][q];
            A[k][p] = c * akp - s * akq;
            A[k][q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = A[p][k], aqk = A[q][k];
            A[p][k] = c * apk - s * aqk;
            A[q][k] = s * apk + c * aqk;
          }
        }
    }
    return Array.from({ length: n }, (_, i) => A[i][i]).sort((a, b) => a - b);
  }

  function cliqueNumber(adj, n) {
    let best = 0;
    for (let s = 1; s < 1 << n; s++) {
      const v = [];
      for (let i = 0; i < n; i++) if (s & (1 << i)) v.push(i);
      let ok = true;
      for (let a = 0; a < v.length && ok; a++)
        for (let b = a + 1; b < v.length; b++) if (!adj[v[a]][v[b]]) { ok = false; break; }
      if (ok) best = Math.max(best, v.length);
    }
    return best;
  }

  // upper-bound symbol for the plot label
  function boundSym(r) {
    return r === 2 ? "√m" : `√(2m·${r - 1}/${r})`;
  }
  const SUB = (d) => "₀₁₂₃₄₅₆₇₈₉"[d]; // unicode subscript, matches the buttons

  const PRESETS = {
    Clear: () => [],
    "C₆": () => [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
    "K₃,₃": () => {
      const e = [];
      for (const a of [0, 2, 4]) for (const b of [1, 3, 5]) e.push([a, b]);
      return e;
    },
    "K₂,₂,₂": () => {
      const e = [];
      const P = [[0, 1], [2, 3], [4, 5]];
      for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++)
        for (const x of P[a]) for (const y of P[b]) e.push([x, y]);
      return e;
    },
  };

  function mount(el) {
    const adj = Array.from({ length: N }, () => new Array(N).fill(false));
    let sel = -1;
    let r = Math.min(5, Math.max(2, parseInt(el.dataset.r || "2", 10)));

    el.classList.add("sw-root");
    el.innerHTML =
      '<div class="sw-controls">' +
      '<div class="sw-controls-row sw-row-presets">' +
      "<span class=\"sw-rowlabel\">Graph</span>" +
      '<span class="sw-presets">' +
      Object.keys(PRESETS).filter((k) => k !== "Clear").map((k) => `<button class="sw-preset" data-preset="${k}">${k}</button>`).join("") +
      "</span>" +
      '<button class="sw-preset sw-clear" data-preset="Clear">Clear</button>' +
      "</div>" +
      '<div class="sw-controls-row sw-row-config">' +
      "<span class=\"sw-rowlabel\">Forbid</span>" +
      '<span class="sw-r"><button data-act="r-" aria-label="decrease forbidden clique size">−</button><b class="sw-rv"></b><button data-act="r+" aria-label="increase forbidden clique size">+</button></span>' +
      "</div>" +
      "</div>" +
      '<div class="sw-stage">' +
      '<svg class="sw-graph" viewBox="22 8 276 322" role="img" aria-label="Editable graph"></svg>' +
      '<svg class="sw-spectrum" viewBox="0 0 230 300" role="img" aria-label="Adjacency spectrum and bounds"></svg>' +
      "</div>" +
      '<div class="sw-legend">' +
      '<span class="sw-leg"><i class="sw-sw sw-sw-eig"></i>eigenvalue</span>' +
      '<span class="sw-leg"><i class="sw-sw sw-sw-eig1"></i>λ₁ (spectral radius)</span>' +
      '<span class="sw-leg"><i class="sw-sw sw-sw-lo"></i>2m/n (avg degree)</span>' +
      '<span class="sw-leg"><i class="sw-sw sw-sw-hi"></i>Nikiforov ceiling</span>' +
      "</div>" +
      '<div class="sw-tip" style="display:none"></div>';
    const gsvg = el.querySelector(".sw-graph");
    const psvg = el.querySelector(".sw-spectrum");

    const Cx = 160, Cy = 150, R = 115;
    const pos = Array.from({ length: N }, (_, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / N;
      return [Cx + R * Math.cos(a), Cy + R * Math.sin(a)];
    });

    function setEdges(list) {
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) adj[i][j] = false;
      for (const [a, b] of list) { adj[a][b] = true; adj[b][a] = true; }
    }

    function drawGraph() {
      let hit = "", vis = "";
      for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++)
          if (adj[i][j]) {
            const c = `x1="${pos[i][0]}" y1="${pos[i][1]}" x2="${pos[j][0]}" y2="${pos[j][1]}"`;
            hit += `<line ${c} class="sw-edge-hit" data-a="${i}" data-b="${j}"/>`;
            vis += `<line ${c} class="sw-edge"/>`;
          }
      let nodes = "";
      for (let i = 0; i < N; i++)
        nodes += `<circle cx="${pos[i][0]}" cy="${pos[i][1]}" r="13" class="sw-node${i === sel ? " sw-sel" : ""}" data-i="${i}"/>`;
      // Interaction instructions in a band below the graph, spelling out the
      // actual mechanic (the verbs alone were opaque).
      const hint =
        '<text x="160" y="308" class="sw-graph-hint" text-anchor="middle"><tspan class="sw-graph-hint-verb">Click two vertices</tspan> to add an edge.</text>' +
        '<text x="160" y="324" class="sw-graph-hint" text-anchor="middle"><tspan class="sw-graph-hint-verb">Click an edge</tspan> to remove it.</text>';
      gsvg.innerHTML = hit + vis + nodes + hint;
    }

    function drawSpectrum(ev, m, nik) {
      // Vertical eigenvalue axis: larger eigenvalue sits higher (smaller y).
      const axisX = 92, yTop = 22, yBottom = 278, lam = ev[ev.length - 1];
      const avg = m ? (2 * m) / N : 0;
      // Symmetric value span so the axis is balanced around zero, with a little
      // headroom above the highest mark (lambda_1 or the Nikiforov ceiling).
      const span = Math.max(lam, nik, Math.abs(ev[0]), 2) + 0.7;
      const vmin = -span, vmax = span;
      const sy = (v) => yBottom - ((v - vmin) * (yBottom - yTop)) / (vmax - vmin);
      const f2 = (x) => x.toFixed(2);

      let s = `<line x1="${axisX}" y1="${sy(vmax).toFixed(1)}" x2="${axisX}" y2="${sy(vmin).toFixed(1)}" class="sw-axis"/>`;
      for (let t = -Math.floor(span); t <= Math.floor(span); t++) {
        const y = sy(t).toFixed(1);
        s += `<line x1="${axisX - 4}" y1="${y}" x2="${axisX + 4}" y2="${y}" class="sw-tick"/>`;
        s += `<text x="${axisX - 9}" y="${y}" class="sw-ticklbl">${t}</text>`;
      }
      s += `<text x="${axisX}" y="${(sy(vmax) - 9).toFixed(1)}" class="sw-axislabel">eigenvalues</text>`;
      if (m > 0) {
        // Each bound is a short horizontal dashed segment across the axis, with
        // its label to the right at the same height.
        const x0 = axisX - 14, x1 = axisX + 28;
        const mk = (v, label, lineCls, textCls, tip) => {
          const y = sy(v).toFixed(1);
          return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" class="sw-bhit" data-tip="${tip}"/>` +
            `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" class="${lineCls}"/>` +
            `<text x="${x1 + 4}" y="${y}" class="${textCls}">${label}</text>`;
        };
        s += mk(avg, `2m/n = ${f2(avg)}`, "sw-bound-lo", "sw-blabel-lo",
          `2m/n = ${f2(avg)}, the average degree (a lower bound, λ₁ ≥ 2m/n with equality iff regular)`);
        s += mk(nik, `${boundSym(r)} = ${f2(nik)}`, "sw-bound-hi", "sw-blabel-hi",
          `${boundSym(r)} = ${f2(nik)}, Nikiforov's spectral Turán bound for K${r + 1}-free graphs`);
      }
      // Eigenvalue dots sit just right of the axis at their height; repeats
      // stack horizontally (rightward) instead of the old vertical offset.
      const groups = {};
      ev.forEach((v) => { const k = v.toFixed(2); (groups[k] = groups[k] || []).push(v); });
      for (const g of Object.values(groups))
        g.forEach((v, k) => {
          const isLam = Math.abs(v - lam) < 1e-9;
          const tip = isLam
            ? `λ₁ = ${v.toFixed(3)}, the spectral radius (largest eigenvalue)`
            : `eigenvalue λ = ${v.toFixed(3)}`;
          s += `<circle cx="${axisX + 11 + k * 12}" cy="${sy(v).toFixed(1)}" r="5" class="sw-eig${isLam ? " sw-eig1" : ""}" data-tip="${tip}"/>`;
        });
      if (m > 0) {
        // The λ₁ label sits to the LEFT of the axis; the two bound labels are on
        // the right, so the three no longer collide when their values are close.
        s += `<text x="${axisX - 22}" y="${sy(lam).toFixed(1)}" class="sw-eiglabel">λ₁ = ${f2(lam)}</text>`;
      }
      psvg.innerHTML = s;
    }

    function render() {
      drawGraph();
      el.querySelector(".sw-rv").textContent = "K" + SUB(r + 1);

      let m = 0;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (adj[i][j]) m++;
      const ev = eigenvalues(adj, N);
      const lam = ev[ev.length - 1];
      const nik = Math.sqrt(2 * m * (1 - 1 / r));
      const omega = cliqueNumber(adj, N);
      drawSpectrum(ev, m, nik);

      // The textual interpretation lives in the reactive prose below the
      // widget (it subscribes to this event); the widget keeps only the plot.
      el.dispatchEvent(
        new CustomEvent("spectral:change", {
          bubbles: true,
          detail: { n: N, m, r, spectrum: ev, lambda1: lam, nikiforov: nik, clique: omega, free: omega <= r },
        })
      );
    }

    gsvg.addEventListener("click", (ev) => {
      const node = ev.target.closest(".sw-node");
      if (node) {
        const i = +node.dataset.i;
        if (sel === -1) sel = i;
        else if (sel === i) sel = -1;
        else { adj[sel][i] = true; adj[i][sel] = true; sel = -1; } // join
        render();
        return;
      }
      const edge = ev.target.closest(".sw-edge-hit");
      if (edge) {
        const a = +edge.dataset.a, b = +edge.dataset.b;
        adj[a][b] = false; adj[b][a] = false; // cut
        render();
      }
    });
    el.querySelector(".sw-controls").addEventListener("click", (ev) => {
      const p = ev.target.dataset.preset;
      if (p && PRESETS[p]) { setEdges(PRESETS[p]()); sel = -1; render(); return; }
      const act = ev.target.dataset.act;
      if (act === "r+") r = Math.min(5, r + 1);
      else if (act === "r-") r = Math.max(2, r - 1);
      else return;
      render();
    });

    const tip = el.querySelector(".sw-tip");
    psvg.addEventListener("mousemove", (ev) => {
      const t = ev.target.closest("[data-tip]");
      if (!t) { tip.style.display = "none"; return; }
      tip.textContent = t.getAttribute("data-tip");
      const rb = el.getBoundingClientRect();
      tip.style.left = ev.clientX - rb.left + 12 + "px";
      tip.style.top = ev.clientY - rb.top + 14 + "px";
      tip.style.display = "block";
    });
    psvg.addEventListener("mouseleave", () => { tip.style.display = "none"; });

    setEdges(PRESETS["C₆"]());
    render();
  }

  function setup(root) {
    (root || document).querySelectorAll(".spectral-workbench").forEach((el) => {
      // The embedded "view source" copy is live HTML; don't mount into it, and
      // never mount the same element twice.
      if (el.closest(".rsm-source") || el.dataset.swMounted) return;
      el.dataset.swMounted = "1";
      mount(el);
    });
  }
  if (document.readyState !== "loading") setup(document);
  else document.addEventListener("DOMContentLoaded", () => setup(document));
  window.SpectralWorkbench = { setup, mount };
})();
