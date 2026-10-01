(() => {
  const root = document.documentElement;
  const stored = localStorage.getItem("seametry-theme");

  if (stored === "light" || stored === "dark") root.dataset.theme = stored;

  window.addEventListener("DOMContentLoaded", () => {
    const control = document.getElementById("theme-control");
    const render = () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      control.setAttribute("aria-label", `Use ${next} mode`);
    };

    control.addEventListener("click", () => {
      root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem("seametry-theme", root.dataset.theme);
      render();
    });

    render();
  });
})();
