(() => {
  const header = document.querySelector(".site-header");
  const menuToggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");

  const setHeaderState = () => {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 18);
  };

  setHeaderState();
  window.addEventListener("scroll", setHeaderState, { passive: true });

  if (menuToggle && nav) {
    menuToggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      menuToggle.setAttribute("aria-expanded", String(open));
      menuToggle.setAttribute("aria-label", open ? menuToggle.dataset.closeLabel : menuToggle.dataset.openLabel);
      menuToggle.classList.toggle("is-open", open);
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", menuToggle.dataset.openLabel);
        menuToggle.classList.remove("is-open");
      });
    });
  }

  const downloadLinks = document.querySelectorAll("[data-download-link]");
  const chromeStoreUrl = document.body.dataset.chromeStoreUrl || "";
  const chromeApproved = document.body.dataset.chromeApproved === "true" && chromeStoreUrl;
  downloadLinks.forEach((link) => {
    if (chromeApproved) {
      link.href = chromeStoreUrl;
      link.textContent = link.dataset.approvedLabel || link.textContent;
      link.removeAttribute("data-download-link");
    }
  });
})();
