// turan-workbench.js
//
// Interactive Turán-graph workbench for section 2. The reader chooses r (the
// number of parts) and n (the number of vertices); the widget draws the
// balanced Turán graph T_r(n), the complete r-partite graph whose parts differ
// in size by at most one. Clicking a vertex and then a part moves the vertex,
// letting the reader unbalance the partition and watch the edge count fall
// below the maximum: the balanced-parts lemma (lem-balanced) made interactive.
//
// Dispatches "turan:change" so the reactive caption can subscribe.

(function () {
  // Per-part identity colors as BRAIID accent tokens (the widget is inlined, so
  // these resolve against the document tokens and stay on-palette in dark mode).
  const COLORS = ["var(--primary-700)", "var(--yellow-700)", "var(--green-700)", "var(--red-700)", "var(--purple-700)"];
  const Cx = 150, Cy = 148, Rc = 84, DV = 24, RN = 10, PAD = 14;
  const RMIN = 2, RMAX = 5, NMIN = 2, NMAX = 12;

  function balancedSizes(n, r) {
    const base = Math.floor(n / r), extra = n % r;
    return Array.from({ length: r }, (_, k) => base + (k < extra ? 1 : 0));
  }

  // Assign vertices 0..n-1 to parts so the parts are as balanced as possible.
  function balanced(n, r) {
    const sizes = balancedSizes(n, r);
    const part = [];
    let k = 0, c = 0;
    for (let i = 0; i < n; i++) {
      while (k < r && c >= sizes[k]) { k++; c = 0; }
      part.push(k); c++;
    }
    return part;
  }

  function edgesFromSizes(sizes, n) {
    let within = 0;
    for (const s of sizes) within += (s * (s - 1)) / 2;
    return (n * (n - 1)) / 2 - within;
  }

  function mount(el) {
    let r = Math.min(RMAX, Math.max(RMIN, parseInt(el.dataset.r || "3", 10)));
    let n = Math.min(NMAX, Math.max(NMIN, parseInt(el.dataset.n || "8", 10)));
    let part = balanced(n, r);
    let sel = -1;

    el.classList.add("tw-root");
    el.innerHTML =
      '<div class="sw-controls">' +
      '<div class="sw-controls-row">' +
      '<span class="tw-rowlabel">Parts</span>' +
      '<span class="sw-r"><button data-act="r-" aria-label="fewer parts">−</button><b class="tw-rv"></b><button data-act="r+" aria-label="more parts">+</button></span>' +
      '<span class="tw-rowlabel">Vertices</span>' +
      '<span class="sw-r"><button data-act="n-" aria-label="fewer vertices">−</button><b class="tw-nv"></b><button data-act="n+" aria-label="more vertices">+</button></span>' +
      '<button class="sw-preset tw-rebalance" data-act="rebalance">Rebalance</button>' +
      "</div>" +
      "</div>" +
      '<div class="tw-stage"><svg class="tw-graph" viewBox="0 0 300 300" role="img" aria-label="Turán graph"></svg></div>';

    const svg = el.querySelector(".tw-graph");

    function sizesOf() {
      const s = new Array(r).fill(0);
      for (let i = 0; i < n; i++) s[part[i]]++;
      return s;
    }

    // Vertex coordinates and the bounding "bag" of each part. Parts sit on a
    // circle; a part's vertices stack vertically at its cluster center.
    function layout() {
      const members = Array.from({ length: r }, () => []);
      for (let i = 0; i < n; i++) members[part[i]].push(i);
      const pos = new Array(n);
      const bags = [];
      for (let k = 0; k < r; k++) {
        const th = Math.PI + (2 * Math.PI * k) / r;
        const ckx = Cx + Rc * Math.cos(th), cky = Cy + Rc * Math.sin(th);
        const M = members[k], s = M.length;
        for (let j = 0; j < s; j++) pos[M[j]] = [ckx, cky + (j - (s - 1) / 2) * DV];
        const half = s > 0 ? ((s - 1) / 2) * DV : 0;
        bags.push({
          k: k, x: ckx - (RN + PAD), y: cky - half - PAD,
          w: 2 * (RN + PAD), h: (s > 0 ? (s - 1) * DV : 0) + 2 * PAD,
        });
      }
      return { pos: pos, bags: bags };
    }

    function draw() {
      const lay = layout(), pos = lay.pos;
      let s = "";
      for (const b of lay.bags)
        s += `<rect class="tw-bag" data-part="${b.k}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="12" style="--pc:${COLORS[b.k]}"/>`;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          if (part[i] !== part[j])
            s += `<line class="tw-edge" x1="${pos[i][0]}" y1="${pos[i][1]}" x2="${pos[j][0]}" y2="${pos[j][1]}"/>`;
      if (sel >= 0)
        s += `<circle class="tw-halo" cx="${pos[sel][0]}" cy="${pos[sel][1]}" r="${RN + 5}"/>`;
      for (let i = 0; i < n; i++)
        s += `<circle class="tw-node" data-i="${i}" cx="${pos[i][0]}" cy="${pos[i][1]}" r="${RN}" style="--pc:${COLORS[part[i]]}"/>`;
      s += '<text class="tw-hint" x="150" y="293" text-anchor="middle"><tspan class="tw-hint-verb">Click a vertex, then a part</tspan> to move it.</text>';
      svg.innerHTML = s;
    }

    function render() {
      draw();
      el.querySelector(".tw-rv").textContent = r;
      el.querySelector(".tw-nv").textContent = n;
      const sizes = sizesOf();
      const edges = edgesFromSizes(sizes, n);
      const maxEdges = edgesFromSizes(balancedSizes(n, r), n);
      const spread = Math.max.apply(null, sizes) - Math.min.apply(null, sizes);
      el.dispatchEvent(
        new CustomEvent("turan:change", {
          bubbles: true,
          detail: {
            n: n, r: r, edges: edges, maxEdges: maxEdges,
            sizes: sizes.slice().sort((a, b) => b - a), balanced: spread <= 1,
          },
        })
      );
    }

    svg.addEventListener("click", (ev) => {
      const node = ev.target.closest(".tw-node");
      if (node) { const i = +node.dataset.i; sel = sel === i ? -1 : i; render(); return; }
      const bag = ev.target.closest(".tw-bag");
      if (bag) {
        const k = +bag.dataset.part;
        if (sel >= 0 && part[sel] !== k) part[sel] = k;
        sel = -1; render();
      }
    });

    el.querySelector(".sw-controls").addEventListener("click", (ev) => {
      const act = ev.target.dataset.act;
      if (!act) return;
      if (act === "r+") r = Math.min(RMAX, r + 1);
      else if (act === "r-") r = Math.max(RMIN, r - 1);
      else if (act === "n+") n = Math.min(NMAX, n + 1);
      else if (act === "n-") n = Math.max(NMIN, n - 1);
      else if (act !== "rebalance") return;
      part = balanced(n, r); sel = -1; render();
    });

    render();
  }

  function setup(root) {
    (root || document).querySelectorAll(".turan-workbench").forEach((el) => {
      if (el.closest(".rsm-source") || el.dataset.twMounted) return;
      el.dataset.twMounted = "1";
      mount(el);
    });
  }
  if (document.readyState !== "loading") setup(document);
  else document.addEventListener("DOMContentLoaded", () => setup(document));
  window.TuranWorkbench = { setup, mount };
})();
