const THEME_KEY = "calculard_theme";

export function initializeTheme() {
  const button = document.querySelector("[data-theme-toggle]");
  const savedTheme = localStorage.getItem(THEME_KEY);
  const preferredTheme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";

  applyTheme(savedTheme || preferredTheme);

  button?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(nextTheme);
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector("[data-theme-toggle]")?.setAttribute(
    "aria-label",
    theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"
  );

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    // Theme persistence is optional.
  }

  document.dispatchEvent(new CustomEvent("calculard:themechange", { detail: { theme } }));
}
