const TOOL_GROUPS = [
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
        desc: "Assets & liabilities in one place",
        url: "../tools/net-worth/index.html"
      }
    ]
  }
];

const els = {
  drawer: document.getElementById("drawer"),
  backdrop: document.getElementById("backdrop"),
  openMenuBtn: document.getElementById("openMenuBtn"),
  closeMenuBtn: document.getElementById("closeMenuBtn"),
  toolSearch: document.getElementById("toolSearch"),
  toolList: document.getElementById("toolList"),
  toolTitle: document.getElementById("toolTitle"),
  toolDesc: document.getElementById("toolDesc"),
  toolFrame: document.getElementById("toolFrame"),
  openNewTabBtn: document.getElementById("openNewTabBtn"),
};

const flatTools = TOOL_GROUPS.flatMap(g => g.items.map(t => ({...t, group: g.group})));

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

els.openMenuBtn.addEventListener("click", openDrawer);
els.closeMenuBtn.addEventListener("click", closeDrawer);
els.backdrop.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDrawer();
});

function renderToolList(filterText=""){
  const q = filterText.trim().toLowerCase();
  els.toolList.innerHTML = "";

  TOOL_GROUPS.forEach(group => {
    const filtered = group.items.filter(t => {
      if(!q) return true;
      return (t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q));
    });
    if(filtered.length === 0) return;

    const label = document.createElement("div");
    label.className = "tool-group";
    label.textContent = group.group;
    els.toolList.appendChild(label);

    filtered.forEach(tool => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tool-btn";
      btn.dataset.toolId = tool.id;
      btn.innerHTML = `<div>${tool.name}</div><small>${tool.desc}</small>`;
      btn.addEventListener("click", () => {
        selectTool(tool.id);
        closeDrawer();
      });
      els.toolList.appendChild(btn);
    });
  });

  highlightActive();
}

function highlightActive(){
  const activeId = localStorage.getItem("toolhub:lastToolId");
  document.querySelectorAll(".tool-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.toolId === activeId);
  });
}

function selectTool(id){
  const tool = flatTools.find(t => t.id === id);
  if(!tool) return;

  els.toolTitle.textContent = tool.name;
  els.toolDesc.textContent = tool.desc;
  els.toolFrame.src = tool.url;

  document.body.classList.add("tool-active");

  localStorage.setItem("toolhub:lastToolId", id);
  els.openNewTabBtn.disabled = false;
  els.openNewTabBtn.onclick = () =>
    window.open(tool.url, "_blank", "noopener,noreferrer");

  highlightActive();
}


els.toolSearch.addEventListener("input", (e) => renderToolList(e.target.value));

(function init(){
  renderToolList("");

  const last = localStorage.getItem("toolhub:lastToolId");
  if(last && flatTools.some(t => t.id === last)){
    selectTool(last);
  }
})();
