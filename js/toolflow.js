// ==========================================================================
// Toolflow component — a sequence of tool nodes connected by arrows, framed
// in a card, for the "02 · Aanpak" section of portfolio case pages. Each
// node shows a logo + tool name, always in full colour. See css/style.css
// for the .toolflow* rules.
//
// Layout: on desktop (>=768px) all nodes sit on a single horizontal row,
// straight arrows in between. Node/icon size is fluid (CSS flexbox +
// clamp()), so the whole row always fits without wrapping or horizontal
// scroll, from the smallest supported desktop width up. No JS measuring or
// resize handling is needed for this — it's pure CSS. On mobile the nodes
// stack in the existing vertical column.
//
// Three functions work together, all driven by the same steps array so
// content only needs to be edited in one place:
//   - renderToolflow(elementId, steps)       → the visual diagram
//   - renderToolflowSteps(elementId, steps)  → the numbered text list
//                                               (needs a step.text)
//   - initToolflowSync(diagramId, listId)    → hooks up:
//       - hover/focus on a node → a scroll-free "preview" highlight on the
//         matching step text (and vice versa), via data-step matching
//       - click (or Enter/Space) on a node → smooth-scrolls to the
//         matching step text and gives it a stronger, longer-lasting
//         "active" highlight so it's obvious which step was just opened
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
  var reducedMotion = !!(
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // How long the stronger "just clicked" highlight stays on the step text
  // before fading back to normal.
  var ACTIVE_HIGHLIGHT_MS = 2200;

  // Delay (ms) between the pulse of one connector dot and the next, so the
  // whole diagram's dots light up as a single continuous left-to-right (or
  // top-to-bottom on mobile) sequence rather than per-connector groups.
  var DOT_STAGGER_MS = 80;

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

  function applyFallback(icon, step) {
    icon.innerHTML = "";
    icon.classList.add("toolflow-icon--fallback");
    icon.textContent = initials(step.name);
  }

  // Nodes are real <button> elements (not divs) so click + native
  // Enter/Space keyboard activation both come for free and are properly
  // accessible, since clicking a node is a real navigation action (it
  // scrolls the page to the matching step).
  function buildNode(step, index) {
    var node = document.createElement("button");
    node.type = "button";
    node.className = "toolflow-node";
    node.dataset.step = String(index + 1);

    var icon = document.createElement("span");
    icon.className = "toolflow-icon";

    if (step.logo) {
      var img = document.createElement("img");
      img.src = step.logo;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", function () {
        applyFallback(icon, step);
      });
      icon.appendChild(img);
    } else {
      applyFallback(icon, step);
    }

    var name = document.createElement("span");
    name.className = "toolflow-name";
    name.textContent = step.name || "";

    node.appendChild(icon);
    node.appendChild(name);

    if (step.name) {
      node.setAttribute("aria-label", "Bekijk stap " + (index + 1) + ": " + step.name);
    }

    return node;
  }

  // Connector between two consecutive nodes: 3 small dots (the site's
  // ".wordmark-dot" visual language, reused here as a recurring brand
  // detail) instead of an arrow. `dotStartIndex` is the running dot count
  // across the *whole* diagram so far, used purely to compute each dot's
  // animation-delay — this is what makes the scroll-in pulse read as one
  // continuous sequence across all connectors rather than 3 independent
  // per-connector groups.
  function buildDots(dotStartIndex) {
    var dots = document.createElement("span");
    dots.className = "toolflow-dots";
    dots.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 3; i++) {
      var dot = document.createElement("span");
      dot.className = "toolflow-dot";
      dot.style.setProperty("--dot-delay", (dotStartIndex + i) * DOT_STAGGER_MS + "ms");
      dots.appendChild(dot);
    }
    return dots;
  }

  // Plays the dot-pulse sequence exactly once, the first time the diagram
  // scrolls into view — never again on scroll-out/scroll-back-in. Adding a
  // persistent class (rather than toggling it) plus unobserving right away
  // is what guarantees the "only once" behaviour.
  function setupToolflowPlay(container, flowEl) {
    if (reducedMotion) return; // rest-state dots already show the end state.

    if (!("IntersectionObserver" in window)) {
      // No IO support: just show the played state immediately rather than
      // leaving the dots permanently un-animated.
      flowEl.classList.add("toolflow-flow--play");
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          flowEl.classList.add("toolflow-flow--play");
          observer.unobserve(container);
        });
      },
      { threshold: 0.2 }
    );
    observer.observe(container);
  }

  window.renderToolflow = function renderToolflow(elementId, steps) {
    var container = document.getElementById(elementId);
    if (!container || !Array.isArray(steps) || !steps.length) return;

    container.classList.add("toolflow");
    container.setAttribute(
      "aria-label",
      "Volledige flow: " + steps.map(function (step) { return step.name; }).join(" → ")
    );

    var flowEl = document.createElement("div");
    flowEl.className = "toolflow-flow";
    var dotIndex = 0;
    steps.forEach(function (step, index) {
      flowEl.appendChild(buildNode(step, index));
      if (index < steps.length - 1) {
        flowEl.appendChild(buildDots(dotIndex));
        dotIndex += 3;
      }
    });

    container.innerHTML = "";
    container.appendChild(flowEl);

    setupToolflowPlay(container, flowEl);
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
    num.textContent = "Stap " + (index + 1);

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
  // Diagram ↔ step-list coupling, delegated on the two root containers
  // (stable across re-renders) so nothing needs re-binding:
  //
  //   - hover / keyboard focus on either side → scroll-free "preview"
  //     highlight (.toolflow-node--linked / .toolflow-step--linked) on
  //     both sides at once, matched via data-step.
  //   - click (or Enter/Space) on a diagram node → smooth-scrolls the
  //     page to the matching step text and marks it with a stronger,
  //     longer-lived .toolflow-step--active highlight so it's obvious
  //     which step was just opened, distinct from the subtler hover
  //     preview above.
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

    var activeTimer = null;

    function goToStep(step) {
      if (!step) return;
      var item = list.querySelector('.toolflow-step[data-step="' + step + '"]');
      if (!item) return;

      var prevActive = list.querySelector(".toolflow-step--active");
      if (prevActive && prevActive !== item) prevActive.classList.remove("toolflow-step--active");
      if (activeTimer) clearTimeout(activeTimer);

      item.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      item.classList.add("toolflow-step--active");
      activeTimer = setTimeout(function () {
        item.classList.remove("toolflow-step--active");
        activeTimer = null;
      }, ACTIVE_HIGHLIGHT_MS);
    }

    diagram.addEventListener("click", function (e) {
      var node = e.target.closest(".toolflow-node");
      if (!node) return;
      goToStep(node.getAttribute("data-step"));
    });
  };
})();
