// ==========================================================================
// Toolflow component — reusable horizontal (desktop) / vertical (mobile)
// sequence of tool nodes connected by arrows, framed in a card, for the
// "02 · Aanpak" section of portfolio case pages. Each node shows only a
// logo + tool name (no caption line). See css/style.css for the .toolflow*
// rules.
//
// Usage:
//   <div id="my-toolflow"></div>
//   <script src="/js/toolflow.js"></script>
//   <script>
//     renderToolflow('my-toolflow', [
//       { name: "Odoo", logo: "/images/tools/odoo.png" },
//       ...
//     ]);
//   </script>
// ==========================================================================
(function () {
  var ARROW_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<line x1="5" y1="12" x2="19" y2="12"></line>' +
    '<polyline points="13 6 19 12 13 18"></polyline>' +
    "</svg>";

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

  function buildNode(step) {
    var node = document.createElement("div");
    node.className = "toolflow-node";

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

  function buildArrow() {
    var arrow = document.createElement("span");
    arrow.className = "toolflow-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.innerHTML = ARROW_SVG;
    return arrow;
  }

  window.renderToolflow = function renderToolflow(elementId, steps) {
    var container = document.getElementById(elementId);
    if (!container || !Array.isArray(steps) || !steps.length) return;

    container.classList.add("toolflow");
    container.setAttribute(
      "aria-label",
      "Volledige flow: " + steps.map(function (step) { return step.name; }).join(" → ")
    );
    container.innerHTML = "";

    steps.forEach(function (step, index) {
      container.appendChild(buildNode(step));
      if (index < steps.length - 1) container.appendChild(buildArrow());
    });
  };
})();
