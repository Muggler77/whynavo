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
  const motionAllowed = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if ("IntersectionObserver" in window && "animate" in Element.prototype && motionAllowed) {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.animate([
          { opacity: 0, transform: "translateY(14px)" },
          { opacity: 1, transform: "translateY(0)" }
        ], {
          duration: 360,
          easing: "cubic-bezier(0.22, 0.8, 0.24, 1)",
          fill: "none"
        });
        currentObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -8% 0px" });
    revealItems.forEach((item) => observer.observe(item));
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
