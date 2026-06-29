// reactive-prose.js
//
// Reactive prose for the paper's widgets: a caption sentence rewrites itself
// from the widget's live state. The widget keeps the figure; this is the
// explanation in words. Subscribes to the "spectral:change" and "turan:change"
// events the widgets dispatch. With JS off, the authored static sentence stands.
//
// This file is included by more than one widget; guard against running twice.
(function () {
  if (window.__reactiveProse) return;
  window.__reactiveProse = true;

  function sub(n) {
    return String(n).replace(/[0-9]/g, function (d) {
      return "₀₁₂₃₄₅₆₇₈₉"[+d];
    });
  }
  function explain(d) {
    var f2 = function (x) { return x.toFixed(2); };
    var Kq = "K" + sub(d.r + 1);
    // No trailing period: the surrounding prose supplies it.
    if (d.m === 0) return "This graph has no edges, so its spectral radius is 0";
    if (!d.free) {
      var crossed = d.lambda1 > d.nikiforov + 1e-6;
      return "This graph contains a " + Kq + ", so the Nikiforov bound no longer applies" +
        (crossed
          ? ", and its spectral radius λ₁ = " + f2(d.lambda1) +
            " has climbed past the " + Kq + "-free ceiling"
          : "");
    }
    return "This graph is " + Kq + "-free, so its spectral radius λ₁ = " +
      f2(d.lambda1) + " sits below the Nikiforov ceiling " + f2(d.nikiforov);
  }
  document.addEventListener("spectral:change", function (e) {
    var el = document.querySelector("#rx-verdict");
    if (!el) return;
    el.setAttribute("aria-live", "polite"); // announce rewrites to screen readers
    el.textContent = explain(e.detail);
  });

  function explainTuran(d) {
    var T = "T" + sub(d.r) + "(" + d.n + ")";
    var Kq = "K" + sub(d.r + 1);
    var nonzero = d.sizes.filter(function (s) { return s > 0; });
    var empties = d.sizes.length - nonzero.length;
    var list = nonzero.join(", ");
    var ed = d.edges + (d.edges === 1 ? " edge" : " edges");
    if (d.balanced) {
      return T + " splits these " + d.n + " vertices into parts of sizes " + list +
        ", the " + ed + " being the most any " + Kq + "-free graph on " + d.n +
        " vertices can have.";
    }
    var deficit = d.maxEdges - d.edges;
    return "These parts (sizes " + list + (empties > 0 ? ", " + empties + " empty" : "") +
      ") span " + ed + ", " + deficit + " short of the " + d.maxEdges +
      " in the balanced " + T + ".";
  }
  document.addEventListener("turan:change", function (e) {
    var el = document.querySelector("#rx-turan");
    if (!el) return;
    el.setAttribute("aria-live", "polite");
    el.textContent = explainTuran(e.detail);
  });

  function explainBounds(d) {
    var Kq = "K" + sub(d.forbid);
    var T = "T" + sub(d.omega) + "(" + d.n + ")";
    var ed = d.mstar + (d.mstar === 1 ? " edge" : " edges");
    return "Forbidding " + Kq + " on " + d.n +
      " vertices, the Rayleigh floor and Nikiforov ceiling meet at " + ed +
      ", the Turán bound, attained by " + T;
  }
  document.addEventListener("bounds:change", function (e) {
    var el = document.querySelector("#rx-bounds");
    if (!el) return;
    el.setAttribute("aria-live", "polite");
    el.textContent = explainBounds(e.detail);
  });
})();
