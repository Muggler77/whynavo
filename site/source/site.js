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
      menuToggle.textContent = open ? menuToggle.dataset.closeLabel : menuToggle.dataset.openLabel;
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.textContent = menuToggle.dataset.openLabel;
      });
    });
  }

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -8% 0px" });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
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
