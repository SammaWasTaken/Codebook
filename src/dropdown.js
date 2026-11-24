const openList = new Set();

function getControlled(toggle) {
    return (toggle.getAttribute("aria-controls") || "")
        .split(/\s+/)
        .filter(Boolean)
        .map(id => document.getElementById(id))
        .filter(Boolean);
}

function closeAll() {
    openList.forEach(({ menu, toggle }) => {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
    });
    openList.clear();
}

function toggleOpen(toggle) {
    getControlled(toggle).forEach(menu => {
        const isOpen = menu.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(isOpen));

        if (isOpen) {
            openList.add({ menu, toggle });
        } else {
            [...openList].forEach(item => {
                if (item.menu === menu) openList.delete(item);
            });
        }
    });
}

document.addEventListener("click", (e) => {
    const insideToggle = e.target.closest(".dropdown-toggle");
    if (!insideToggle) closeAll();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
});