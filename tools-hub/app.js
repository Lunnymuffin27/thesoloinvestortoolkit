// ====== CONFIG: Add tools here ======
// IMPORTANT: Update URLs to match your repo structure.
// If this is a GitHub Project Page, paths usually look like:
//   "../tools/my-tool/index.html" (if tools folder is sibling to tool-hub)
// or "/REPO/tools/my-tool/" (absolute within repo)
const TOOLS = [
  {
    group: "Calculators",
    items: [
      {
        id: "compound",
        name: "Compound Interest",
        desc: "Growth over time + export",
        url: "../tools/compound-interest/index.html"
      }
    ]
  },
  {
    group: "Trackers",
    items: [
      {
        id: "networth",
        name: "Net Worth Tracker",
        desc: "Assets & liabilities snapshot",
        url: "../tools/net-worth/index.html"
      }
    ]
  }
];

const flatTools = TOOLS.flatMap(g => g.items.map(t => ({ ...t, group: g.group })));

const els = {
  // desktop
  toolListDesktop: document.getElementById("toolListDesktop"),
  toolSearchDesktop: document.getElementById("toolSearchDesktop"),

  // mobile
  toolListMobile: document.getElementById("toolListMobile"),
  toolSearchMobile: document.getElementById("toolSearchMobile"),
  drawer: document.getElementById("drawer"),
  backdrop: document.getElementById("backdrop"),
  openMenuBtn: document.getElementById("openMenuBtn"),
  closeMenuBtn: document.getElementById("closeMenuBtn"),

  // viewer
  toolTitle: document.getElementById("toolTitle"),
  toolDesc: document.getElementById("toolDesc"),
  toolFrame: document.getElementById("toolFrame"),
  openNewTabBtn: document.getElementById("openNewTabBtn"),
};

const STORAGE_KEY = "toolhub:lastToolId";

function openDrawer(){
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
  els.backdrop.hidden = false;
}

function closeDrawer(){
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
  els.backdrop.hidden = true;
}

function isMobile(){
  return window.matchMedia("(max-width: 900px)").matches;
}

function renderToolList(containerEl, filterText = ""){
  const q = filterText.trim().toLowerCase();
  containerEl.innerHTML = "";

  TOOLS.forEach(group => {
    const filtered = group.items.filter(t => {
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q);
    });

    if (filtered.length === 0) return;

    const label = document.createElement("div");
    label.className = "tool-group";
    label.textContent = group.group;
    containerEl.appendChild(label);

    filtered.forEach(tool => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tool-btn";
      btn.dataset.toolId = tool.id;
      btn.innerHTML = `<div>${tool.name}</div><small>${tool.desc}</small>`;
      btn.addEventListener("click", () => {
        selectTool(tool.id);
        if (isMobile()) closeDrawer();
      });
      containerEl.appendChild(btn);
    });
  });

  highlightActive();
}

function highlightActive(){
  const activeId = localStorage.getItem(STORAGE_KEY);
  document.querySelectorAll(".tool-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.toolId === activeId);
  });
}

function selectTool(id){
  const tool = flatTools.find(t => t.id === id);
  if (!tool) return;

  els.toolTitle.textContent = tool.name;
  els.toolDesc.textContent = tool.desc;

  // Load tool in place
  els.toolFrame.src = tool.url;

  // Remember selection
  localStorage.setItem(STORAGE_KEY, id);

  // Enable open in new tab
  els.openNewTabBtn.disabled = false;
  els.openNewTabBtn.onclick = () => window.open(tool.url, "_blank", "noopener,noreferrer");

  highlightActive();
}

function initSearch(){
  // Desktop search
  els.toolSearchDesktop.addEventListener("input", (e) => {
    renderToolList(els.toolListDesktop, e.target.value);
  });

  // Mobile search
  els.toolSearchMobile.addEventListener("input", (e) => {
    renderToolList(els.toolListMobile, e.target.value);
  });
}

function initDrawer(){
  els.openMenuBtn.addEventListener("click", () => {
    // On desktop, menu button is optional, but we can still open drawer if you want.
    // Most likely used on mobile.
    openDrawer();
  });

  els.closeMenuBtn.addEventListener("click", closeDrawer);
  els.backdrop.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  // If resizing from mobile -> desktop, ensure backdrop is closed
  window.addEventListener("resize", () => {
    if (!isMobile()) {
      els.backdrop.hidden = true;
      els.drawer.classList.remove("open");
      els.drawer.setAttribute("aria-hidden", "true");
    }
  });
}

function init(){
  renderToolList(els.toolListDesktop, "");
  renderToolList(els.toolListMobile, "");
  initSearch();
  initDrawer();

  const last = localStorage.getItem(STORAGE_KEY);
  if (last && flatTools.some(t => t.id === last)) {
    selectTool(last);
  }
}

init();
