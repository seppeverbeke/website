// ==========================================================================
// Toolflow component — reusable horizontal (desktop) / vertical (mobile)
// sequence of tool nodes connected by arrows, framed in a card, for the
// "02 · Aanpak" section of portfolio case pages. Each node shows only a
// logo + tool name (no caption line). See css/style.css for the .toolflow*
// rules.
//
// On desktop, when the nodes don't fit on a single row, the diagram lays
// itself out as a serpentine: row 1 left-to-right, row 2 right-to-left,
// etc., connected by a curved line between rows. This is measured and
// rebuilt on resize, so it works for any node count, not just 6. On
// mobile it always stays a straight vertical column.
//
// Three functions work together, all driven by the same steps array so
// content only needs to be edited in one place:
//   - renderToolflow(elementId, steps)       → the visual diagram
//   - renderToolflowSteps(elementId, steps)  → an optional numbered text
//                                               list (needs a step.text)
//   - initToolflowSync(diagramId, listId)    → hooks up hover/focus so a
//                                               node and its matching step
//                                               item highlight each other
//
// Nodes and step items are matched via a shared data-step="n" (1-based).
//
// Usage:
//   <div id="my-toolflow"></div>
//   <ol id="my-toolflow-steps"></ol>
//   <script src="/js/toolflow.js"></script>
//   <script>
//     var steps = [
//       { name: "Odoo", logo: "/images/tools/odoo.png", text: "..." },
//       ...
//     ];
//     renderToolflow('my-toolflow', steps);
//     renderToolflowSteps('my-toolflow-steps', steps);
//     initToolflowSync('my-toolflow', 'my-toolflow-steps');
//   </script>
// ==========================================================================
(function () {
  var ARROW_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<line x1="5" y1="12" x2="19" y2="12"></line>' +
    '<polyline points="13 6 19 12 13 18"></polyline>' +
    "</svg>";

  var reducedMotion = !!(
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  function isRowMode() {
    return !!(window.matchMedia && window.matchMedia("(min-width: 768px)").matches);
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function initials(name) {
    return String(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (word) {
        return word.charAt(0);
      })
      .join("")
      .toUpperCase();
  }

  function applyFallback(node, icon, step) {
    icon.innerHTML = "";
    icon.classList.add("toolflow-icon--fallback");
    icon.textContent = initials(step.name);
    node.classList.add("toolflow-node--fallback");
    node.removeAttribute("tabindex");
  }

  function buildNode(step, index) {
    var node = document.createElement("div");
    node.className = "toolflow-node";
    node.dataset.step = String(index + 1);

    var icon = document.createElement("span");
    icon.className = "toolflow-icon";

    if (step.logo) {
      var img = document.createElement("img");
      img.src = step.logo;
      img.alt = step.name || "";
      img.loading = "lazy";
      img.addEventListener("error", function () {
        applyFallback(node, icon, step);
      });
      icon.appendChild(img);
      node.tabIndex = 0;
    } else {
      applyFallback(node, icon, step);
    }

    var name = document.createElement("span");
    name.className = "toolflow-name";
    name.textContent = step.name || "";

    node.appendChild(icon);
    node.appendChild(name);

    if (step.name) node.setAttribute("aria-label", step.name);

    return node;
  }

  function buildArrow(flowIndex) {
    var arrow = document.createElement("span");
    arrow.className = "toolflow-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.innerHTML = ARROW_SVG;

    var spark = document.createElement("span");
    spark.className = "toolflow-spark";
    spark.style.setProperty("--flow-index", flowIndex);
    arrow.appendChild(spark);

    return arrow;
  }

  function buildFlatInto(flowEl, steps) {
    steps.forEach(function (step, index) {
      flowEl.appendChild(buildNode(step, index));
      if (index < steps.length - 1) flowEl.appendChild(buildArrow(index));
    });
  }

  // Groups already-laid-out .toolflow-node elements by their offsetTop to
  // find out how the browser naturally wrapped them into rows.
  function measureRowCounts(flowEl) {
    var nodes = Array.prototype.slice.call(flowEl.querySelectorAll(".toolflow-node"));
    var rowCounts = [];
    var lastTop = null;
    nodes.forEach(function (node) {
      var top = node.offsetTop;
      if (lastTop === null || Math.abs(top - lastTop) > 4) {
        rowCounts.push(0);
        lastTop = top;
      }
      rowCounts[rowCounts.length - 1]++;
    });
    return rowCounts;
  }

  // Builds the serpentine rows structure. Odd rows (index 1, 3, ...) are
  // flagged --reverse so they render right-to-left via flex row-reverse,
  // without needing to actually reverse the DOM/step order. Returns the
  // --flow-index assigned to each row transition, for the connector spark
  // animation to line up with the in-row arrow sparks.
  function buildSerpentineInto(rowsEl, steps, rowCounts) {
    var idx = 0;
    var flowIndex = 0;
    var connectorFlowIndices = [];

    rowCounts.forEach(function (count, rowIdx) {
      var rowEl = document.createElement("div");
      rowEl.className = "toolflow-row" + (rowIdx % 2 === 1 ? " toolflow-row--reverse" : "");

      for (var i = 0; i < count; i++) {
        rowEl.appendChild(buildNode(steps[idx], idx));
        idx++;
        if (i < count - 1) {
          rowEl.appendChild(buildArrow(flowIndex));
          flowIndex++;
        }
      }

      rowsEl.appendChild(rowEl);

      if (rowIdx < rowCounts.length - 1) {
        connectorFlowIndices.push(flowIndex);
        flowIndex++;
      }
    });

    return connectorFlowIndices;
  }

  // Draws a curved SVG connector (+ matching flow-spark) between the last
  // node of each row and the first node of the next, positioned from
  // actual measured coordinates so it lines up regardless of row length,
  // node count, or which side the row reads from.
  function drawConnectors(rowsEl, flowIndices) {
    var rows = Array.prototype.slice.call(rowsEl.querySelectorAll(".toolflow-row"));
    var wrapRect = rowsEl.getBoundingClientRect();
    var svgNS = "http://www.w3.org/2000/svg";

    for (var i = 0; i < rows.length - 1; i++) {
      var fromNodes = rows[i].querySelectorAll(".toolflow-node");
      var toNodes = rows[i + 1].querySelectorAll(".toolflow-node");
      var fromIcon = fromNodes[fromNodes.length - 1].querySelector(".toolflow-icon");
      var toIcon = toNodes[0].querySelector(".toolflow-icon");
      var fRect = fromIcon.getBoundingClientRect();
      var tRect = toIcon.getBoundingClientRect();

      var x1 = fRect.left + fRect.width / 2 - wrapRect.left;
      var y1 = fRect.bottom - wrapRect.top;
      var x2 = tRect.left + tRect.width / 2 - wrapRect.left;
      var y2 = tRect.top - wrapRect.top;

      // Bow the curve out to the side the flow is turning on (right after
      // an ltr row, left after a reversed/rtl row) rather than a bezier
      // interpolated straight between the two endpoints — otherwise
      // symmetric rows (equal length, same column) produce a degenerate
      // straight vertical line instead of a visible curve.
      var side = i % 2 === 0 ? 1 : -1;
      var bow = 40;
      var c1x = x1 + side * bow;
      var c1y = y1 + (y2 - y1) * 0.35;
      var c2x = x2 + side * bow;
      var c2y = y1 + (y2 - y1) * 0.65;

      var pad = 12;
      var minX = Math.min(x1, x2, c1x, c2x) - pad;
      var maxX = Math.max(x1, x2, c1x, c2x) + pad;
      var left = minX;
      var top = y1;
      var width = maxX - minX;
      var height = Math.max(y2 - y1, 1);
      var offsetX = x1 - left;

      var dLocal =
        "M " + offsetX + " 0" +
        " C " + (c1x - left) + " " + (c1y - top) +
        ", " + (c2x - left) + " " + (c2y - top) +
        ", " + (x2 - left) + " " + height;
      var dGlobal =
        "M " + x1 + " " + y1 +
        " C " + c1x + " " + c1y +
        ", " + c2x + " " + c2y +
        ", " + x2 + " " + y2;

      var svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("class", "toolflow-connector");
      svg.setAttribute("aria-hidden", "true");
      svg.style.left = left + "px";
      svg.style.top = top + "px";
      svg.style.width = width + "px";
      svg.style.height = height + "px";
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);

      var markerId = "toolflow-arrowhead-" + Math.random().toString(36).slice(2, 9);
      svg.innerHTML =
        '<defs><marker id="' +
        markerId +
        '" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 Z" fill="currentColor"></path></marker></defs>' +
        '<path class="toolflow-connector-path" d="' +
        dLocal +
        '" marker-end="url(#' +
        markerId +
        ')"></path>';
      rowsEl.appendChild(svg);

      var spark = document.createElement("span");
      spark.className = "toolflow-connector-spark";
      spark.style.setProperty("--flow-index", flowIndices[i]);
      spark.style.offsetPath = "path('" + dGlobal + "')";
      rowsEl.appendChild(spark);
    }
  }

  function layout(instance) {
    var container = instance.container;
    var steps = instance.steps;
    container.innerHTML = "";

    var flowEl = document.createElement("div");
    flowEl.className = "toolflow-flow";
    buildFlatInto(flowEl, steps);
    container.appendChild(flowEl);

    if (!isRowMode() || steps.length < 2) return;

    var rowCounts = measureRowCounts(flowEl);
    if (rowCounts.length <= 1) return;

    // Needs a serpentine layout: rebuild into row groups. Everything below
    // runs synchronously (before the browser paints), so there's no
    // flat-then-serpentine flash.
    container.innerHTML = "";
    var rowsEl = document.createElement("div");
    rowsEl.className = "toolflow-rows";
    var connectorFlowIndices = buildSerpentineInto(rowsEl, steps, rowCounts);
    container.appendChild(rowsEl);
    drawConnectors(rowsEl, connectorFlowIndices);
  }

  // ------------------------------------------------------------------
  // Shared resize handling (debounced) across every toolflow instance.
  // ------------------------------------------------------------------
  var layoutInstances = [];
  var resizeTimer = null;

  function relayoutAll() {
    layoutInstances.forEach(layout);
  }

  function scheduleRelayout() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayoutAll, 150);
  }

  // ------------------------------------------------------------------
  // One-time "data flows through the pipe" spark animation, played once
  // when the diagram first scrolls into view. Skipped entirely under
  // prefers-reduced-motion.
  // ------------------------------------------------------------------
  function setupFlowPlay(container) {
    if (reducedMotion || !("IntersectionObserver" in window)) return;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            container.classList.add("toolflow--flow-play");
            observer.unobserve(container);
          }
        });
      },
      { threshold: 0.3 }
    );
    observer.observe(container);
  }

  // ------------------------------------------------------------------
  // Subtle scroll parallax: the whole node/arrow group (not individual
  // nodes, so row/connector alignment never drifts) shifts a few px
  // against scroll speed. Disabled under prefers-reduced-motion.
  // ------------------------------------------------------------------
  var parallaxInstances = [];
  var parallaxTicking = false;

  function updateParallax() {
    parallaxTicking = false;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    parallaxInstances.forEach(function (container) {
      var rect = container.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > vh + 200) return;
      var centerDelta = rect.top + rect.height / 2 - vh / 2;
      var shift = Math.max(-8, Math.min(8, centerDelta * -0.03));
      container.style.setProperty("--toolflow-parallax", shift.toFixed(2) + "px");
    });
  }

  function requestParallaxUpdate() {
    if (parallaxTicking) return;
    parallaxTicking = true;
    requestAnimationFrame(updateParallax);
  }

  function setupParallax(container) {
    if (reducedMotion) return;
    if (!parallaxInstances.length) {
      window.addEventListener("scroll", requestParallaxUpdate, { passive: true });
    }
    parallaxInstances.push(container);
    requestParallaxUpdate();
  }

  window.renderToolflow = function renderToolflow(elementId, steps) {
    var container = document.getElementById(elementId);
    if (!container || !Array.isArray(steps) || !steps.length) return;

    container.classList.add("toolflow");
    container.setAttribute(
      "aria-label",
      "Volledige flow: " + steps.map(function (step) { return step.name; }).join(" → ")
    );

    var instance = { container: container, steps: steps };
    if (!layoutInstances.length) window.addEventListener("resize", scheduleRelayout);
    layoutInstances.push(instance);
    layout(instance);

    setupFlowPlay(container);
    setupParallax(container);
  };

  // ------------------------------------------------------------------
  // Numbered text-step list, rendered from the same steps array (needs
  // a step.text). Kept deliberately simple/data-driven so step copy can
  // be edited in the page's own script without touching this file.
  // ------------------------------------------------------------------
  function buildStepItem(step, index) {
    var li = document.createElement("li");
    li.className = "toolflow-step";
    li.dataset.step = String(index + 1);
    li.tabIndex = 0;

    var num = document.createElement("span");
    num.className = "toolflow-step-num";
    num.setAttribute("aria-hidden", "true");
    num.textContent = pad2(index + 1);

    var body = document.createElement("span");
    body.className = "toolflow-step-body";

    var name = document.createElement("span");
    name.className = "toolflow-step-name";
    name.textContent = step.name || "";

    var text = document.createElement("p");
    text.className = "toolflow-step-text";
    text.textContent = step.text || "";

    body.appendChild(name);
    body.appendChild(text);
    li.appendChild(num);
    li.appendChild(body);

    if (step.name) li.setAttribute("aria-label", index + 1 + ". " + step.name);

    return li;
  }

  window.renderToolflowSteps = function renderToolflowSteps(elementId, steps) {
    var container = document.getElementById(elementId);
    if (!container || !Array.isArray(steps) || !steps.length) return;

    container.classList.add("toolflow-steps");
    container.innerHTML = "";
    steps.forEach(function (step, index) {
      container.appendChild(buildStepItem(step, index));
    });
  };

  // ------------------------------------------------------------------
  // Bidirectional hover/focus sync between diagram nodes and step-list
  // items sharing the same data-step. Delegated on the two root
  // containers (which persist across diagram resize/rebuilds) via
  // mouseover/mouseout + focusin/focusout, so it never needs to be
  // re-bound after a serpentine relayout replaces the node elements.
  // ------------------------------------------------------------------
  window.initToolflowSync = function initToolflowSync(diagramId, listId) {
    var diagram = document.getElementById(diagramId);
    var list = document.getElementById(listId);
    if (!diagram || !list) return;

    function setActive(step, active) {
      if (!step) return;
      var selector = '[data-step="' + step + '"]';
      var node = diagram.querySelector(".toolflow-node" + selector);
      var item = list.querySelector(".toolflow-step" + selector);
      if (node) node.classList.toggle("toolflow-node--linked", active);
      if (item) item.classList.toggle("toolflow-step--linked", active);
    }

    function stepFromTarget(target) {
      if (!target || !target.closest) return null;
      var el = target.closest("[data-step]");
      return el ? el.getAttribute("data-step") : null;
    }

    [diagram, list].forEach(function (root) {
      root.addEventListener("mouseover", function (e) {
        setActive(stepFromTarget(e.target), true);
      });
      root.addEventListener("mouseout", function (e) {
        var step = stepFromTarget(e.target);
        if (!step) return;
        var stepEl = e.target.closest('[data-step="' + step + '"]');
        if (stepEl && e.relatedTarget && stepEl.contains(e.relatedTarget)) return;
        setActive(step, false);
      });
      root.addEventListener("focusin", function (e) {
        setActive(stepFromTarget(e.target), true);
      });
      root.addEventListener("focusout", function (e) {
        setActive(stepFromTarget(e.target), false);
      });
    });
  };
})();
