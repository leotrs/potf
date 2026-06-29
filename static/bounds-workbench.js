// bounds-workbench.js
//
// The spectral climax made manipulable (section 4). Two bounds on the spectral
// radius squeeze the edge count:
//
//     2m/n  <=  lambda_1  <=  sqrt(2m(1 - 1/omega))
//
// Plotted against m, the Rayleigh lower bound is a straight line and the
// Nikiforov upper bound is a sqrt curve. They cross at
//
//     m* = (1 - 1/omega) n^2 / 2,
//
// the Turan edge bound: for m > m* the lower bound exceeds the upper, so no
// K_{omega+1}-free graph can exist there. The closing point is the Turan graph
// T_omega(n). The slider moves n and the segmented control moves omega; both
// move where the band shuts.
//
// Built on D3 v7 (vendored at static/d3.v7.min.js) for the scales, axes and
// data joins. All colour comes from BRAIID-token CSS classes (.bw-* in
// widgets.css), never inline, so the plot flips with the .dark-theme token set
// and the static-PNG extractor can inline the computed styles unchanged.
//
// Dispatches "bounds:change" so reactive prose can subscribe.

(function () {
  const d3 = window.d3;
  const SUB = (d) => String(d).replace(/\d/g, (c) => "₀₁₂₃₄₅₆₇₈₉"[+c]);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const OMIN = 2, OMAX = 5, NMIN = 4, NMAX = 20;

  // plot frame (viewBox units)
  const W = 480, H = 312;
  const M = { top: 16, right: 18, bottom: 56, left: 52 };
  const IW = W - M.left - M.right;
  const IH = H - M.top - M.bottom;
  const NS = 96; // samples along the curve / band edges

  function mount(el) {
    let w = clamp(parseInt(el.dataset.omega || "2", 10), OMIN, OMAX); // omega = clique number
    let n = clamp(parseInt(el.dataset.n || "8", 10), NMIN, NMAX);

    el.classList.add("bw-root");

    // --- chrome: controls (slider + segmented control), plot, legend ---
    const root = d3.select(el);
    root.html("");

    const controls = root.append("div").attr("class", "sw-controls");

    // Forbid K_{omega+1}: a small segmented control, omega = 2..5.
    const rowForbid = controls.append("div").attr("class", "sw-controls-row");
    rowForbid.append("span").attr("class", "sw-rowlabel").text("Forbid");
    const seg = rowForbid.append("div").attr("class", "bw-seg").attr("role", "radiogroup").attr("aria-label", "forbidden clique");
    const segBtns = seg
      .selectAll("button")
      .data(d3.range(OMIN, OMAX + 1))
      .join("button")
      .attr("type", "button")
      .attr("class", "bw-seg-btn")
      .attr("role", "radio")
      .attr("data-w", (d) => d)
      .html((d) => "K" + SUB(d + 1))
      .on("click", function (ev, d) {
        w = d;
        draw();
      });

    // Vertices n: a real range slider, 4..20.
    const rowVerts = controls.append("div").attr("class", "sw-controls-row sw-row-config");
    rowVerts.append("span").attr("class", "sw-rowlabel").text("Vertices");
    const slider = rowVerts
      .append("input")
      .attr("type", "range")
      .attr("class", "bw-slider")
      .attr("min", NMIN)
      .attr("max", NMAX)
      .attr("step", 1)
      .attr("value", n)
      .attr("aria-label", "number of vertices n")
      .on("input", function () {
        n = clamp(parseInt(this.value, 10), NMIN, NMAX);
        draw();
      });
    const nReadout = rowVerts.append("b").attr("class", "bw-nv");

    // --- plot ---
    const stage = root.append("div").attr("class", "bw-stage");
    const svg = stage
      .append("svg")
      .attr("class", "bw-plot")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("role", "img")
      .attr(
        "aria-label",
        "The Rayleigh and Nikiforov bounds plotted against the edge count, closing at the Turan bound."
      );

    const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

    // layer order: gridlines, regions, curves, axes, markers
    const gGridX = g.append("g").attr("class", "bw-grid bw-grid-x");
    const gGridY = g.append("g").attr("class", "bw-grid bw-grid-y");
    const gBand = g.append("path").attr("class", "bw-band");
    const gInfeasible = g.append("path").attr("class", "bw-infeasible");
    const gNik = g.append("path").attr("class", "bw-nik");
    const gRay = g.append("line").attr("class", "bw-ray");
    const gAxisX = g.append("g").attr("class", "bw-axis bw-axis-x").attr("transform", `translate(0,${IH})`);
    const gAxisY = g.append("g").attr("class", "bw-axis bw-axis-y");
    const gDrop = g.append("line").attr("class", "bw-drop");
    const gMstarTick = g.append("line").attr("class", "bw-mstar-tick");
    const gMstarLbl = g.append("text").attr("class", "bw-mstar").attr("text-anchor", "middle");
    const gTuran = g.append("circle").attr("class", "bw-turan").attr("r", 5);
    const gTuranLbl = g.append("text").attr("class", "bw-tlabel").attr("text-anchor", "middle");

    // axis titles
    g.append("text")
      .attr("class", "bw-axislabel")
      .attr("x", IW)
      .attr("y", IH + 48)
      .attr("text-anchor", "end")
      .text("m (edges)");
    g.append("text")
      .attr("class", "bw-axislabel")
      .attr("transform", "rotate(-90)")
      .attr("x", 0)
      .attr("y", -40)
      .attr("text-anchor", "end")
      .text("λ₁ (spectral radius)");

    // --- legend (a real key, BRAIID-styled, below the plot) ---
    const legendItems = [
      { cls: "bw-key-nik", label: "Nikiforov ceiling λ₁ ≤ √(2m(1−¹⁄ω))" },
      { cls: "bw-key-ray", label: "Rayleigh floor λ₁ ≥ 2m⁄n" },
      { cls: "bw-key-band", label: "Feasible band" },
      { cls: "bw-key-turan", label: "Turán graph Tω(n)" },
      { cls: "bw-key-infeasible", label: "Infeasible: no K-free graph" },
    ];
    const legend = root.append("div").attr("class", "bw-legend");
    const items = legend
      .selectAll("div")
      .data(legendItems)
      .join("div")
      .attr("class", "bw-key");
    items.append("span").attr("class", (d) => "bw-swatch " + d.cls);
    items.append("span").attr("class", "bw-key-label").text((d) => d.label);
    // the Turan-graph swatch carries the live forbidden clique in its label
    const turanLabelSpan = items.filter((d) => d.cls === "bw-key-turan").select(".bw-key-label");

    const x = d3.scaleLinear().range([0, IW]);
    const y = d3.scaleLinear().range([IH, 0]);

    function draw() {
      const mAxis = (n * (n - 1)) / 2; // edges of K_n (right edge)
      const lAxis = n - 1; // lambda_1 of K_n (top)
      const f = 1 - 1 / w;
      const mstar = (f * n * n) / 2; // intersection: the Turan edge bound
      const lstar = (2 * mstar) / n; // = (1 - 1/w) n
      const nik = (m) => Math.sqrt(2 * m * f);
      const ray = (m) => (2 * m) / n;

      x.domain([0, mAxis]);
      y.domain([0, lAxis]);

      // gridlines (no labels; the axes carry the ticks)
      const xTicks = x.ticks(6);
      const yTicks = y.ticks(5);
      gGridX
        .selectAll("line")
        .data(xTicks)
        .join("line")
        .attr("x1", (d) => x(d))
        .attr("x2", (d) => x(d))
        .attr("y1", 0)
        .attr("y2", IH);
      gGridY
        .selectAll("line")
        .data(yTicks)
        .join("line")
        .attr("x1", 0)
        .attr("x2", IW)
        .attr("y1", (d) => y(d))
        .attr("y2", (d) => y(d));

      // axes
      gAxisX.call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
      gAxisY.call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));

      // feasible band: between the Rayleigh line (lower) and the Nikiforov curve
      // (upper) for m in [0, m*]
      const bandPts = d3.range(NS + 1).map((i) => (i / NS) * mstar);
      const bandArea = d3
        .area()
        .x((m) => x(m))
        .y0((m) => y(ray(m)))
        .y1((m) => y(nik(m)));
      gBand.attr("d", bandArea(bandPts));

      // infeasible region: for m > m* the Rayleigh floor exceeds the Nikiforov
      // ceiling, so no K_{omega+1}-free graph can have that many edges
      const infPts = d3.range(NS + 1).map((i) => mstar + (i / NS) * (mAxis - mstar));
      const infArea = d3
        .area()
        .x((m) => x(m))
        .y0((m) => y(ray(m)))
        .y1((m) => y(nik(m)));
      gInfeasible.attr("d", infArea(infPts));

      // Nikiforov ceiling over the full domain
      const nikPts = d3.range(NS + 1).map((i) => (i / NS) * mAxis);
      const nikLine = d3
        .line()
        .x((m) => x(m))
        .y((m) => y(nik(m)));
      gNik.attr("d", nikLine(nikPts));

      // Rayleigh floor: a straight line to the K_n corner
      gRay
        .attr("x1", x(0))
        .attr("y1", y(0))
        .attr("x2", x(mAxis))
        .attr("y2", y(lAxis));

      // closing point = the Turan graph, with a drop line and an m* axis marker
      gDrop
        .attr("x1", x(mstar))
        .attr("y1", y(lstar))
        .attr("x2", x(mstar))
        .attr("y2", IH);
      gMstarTick
        .attr("x1", x(mstar))
        .attr("x2", x(mstar))
        .attr("y1", IH)
        .attr("y2", IH + 6);
      gMstarLbl
        .attr("x", x(mstar))
        .attr("y", IH + 34)
        .text("m* = " + Math.round(mstar));
      gTuran.attr("cx", x(mstar)).attr("cy", y(lstar));
      gTuranLbl
        .attr("x", x(mstar))
        .attr("y", y(lstar) - 10)
        .text("T" + SUB(w) + "(" + n + ")");

      // readouts + legend
      nReadout.text(n);
      turanLabelSpan.text("Turán graph T" + SUB(w) + "(" + n + ")");
      segBtns
        .classed("is-active", (d) => d === w)
        .attr("aria-checked", (d) => (d === w ? "true" : "false"));

      el.dispatchEvent(
        new CustomEvent("bounds:change", {
          bubbles: true,
          detail: {
            n,
            omega: w,
            mstar: Math.round(mstar),
            lstar: +lstar.toFixed(2),
            forbid: w + 1,
          },
        })
      );
    }

    draw();
  }

  function setup(root) {
    (root || document).querySelectorAll(".bounds-workbench").forEach((el) => {
      if (el.closest(".rsm-source") || el.dataset.bwMounted) return;
      if (!window.d3) return; // D3 not loaded yet; setup() reruns on DOMContentLoaded
      el.dataset.bwMounted = "1";
      mount(el);
    });
  }
  if (document.readyState !== "loading") setup(document);
  else document.addEventListener("DOMContentLoaded", () => setup(document));
  window.BoundsWorkbench = { setup, mount };
})();
