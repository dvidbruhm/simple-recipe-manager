(function () {
  const STORAGE_PREFIX = "rm-cook-";

  class CookMode {
    constructor(root) {
      this.root = root;
      this.id = root.getAttribute("data-recipe-id");
      this.toggleBtn = root.querySelector("[data-cook-toggle]");
      this.progressEl = root.querySelector("[data-cook-progress]");
      this.currentEl = root.querySelector("[data-cook-current]");
      this.prevBtn = root.querySelector("[data-cook-prev]");
      this.nextBtn = root.querySelector("[data-cook-next]");
      this.list = root.querySelector("[data-cook-list]");
      this.steps = this.list ? Array.from(this.list.querySelectorAll(".cook-step")) : [];
      this.active = false;
      this.current = 0;
      this.completed = new Set();
      this.wakeLock = null;

      if (!this.toggleBtn || this.steps.length === 0) return;

      this.restore();
      this.bind();
      if (this.active) this.applyActive();
      this.render();
    }

    bind() {
      this.toggleBtn.addEventListener("click", () => this.toggle());
      if (this.prevBtn) this.prevBtn.addEventListener("click", () => this.go(-1));
      if (this.nextBtn) this.nextBtn.addEventListener("click", () => this.go(1));
      this.steps.forEach((step, i) => {
        step.addEventListener("click", (e) => {
          if (e.target.closest("a")) return;
          this.activate(i);
        });
        const text = step.querySelector(".cook-step__text");
        if (text) {
          text.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleComplete(i);
          });
        }
      });
      document.addEventListener("visibilitychange", () => {
        if (this.active && document.visibilityState === "visible") this.acquireWakeLock();
      });
    }

    toggle() {
      this.active = !this.active;
      if (this.active) {
        this.current = 0;
        this.applyActive();
        this.acquireWakeLock();
      } else {
        this.releaseWakeLock();
        this.applyInactive();
      }
      this.render();
      this.persist();
    }

    applyActive() {
      document.body.classList.add("is-cooking");
      this.toggleBtn.setAttribute("aria-pressed", "true");
      this.toggleBtn.textContent = "Stop cooking";
    }

    applyInactive() {
      document.body.classList.remove("is-cooking");
      this.toggleBtn.setAttribute("aria-pressed", "false");
      this.toggleBtn.textContent = "Start cooking";
    }

    activate(i) {
      if (!this.active) {
        this.active = true;
        this.applyActive();
        this.acquireWakeLock();
      }
      this.current = Math.max(0, Math.min(this.steps.length - 1, i));
      this.render();
      this.persist();
      this.scrollToCurrent();
    }

    go(delta) {
      const next = this.current + delta;
      if (next < 0) return;
      if (next >= this.steps.length) {
        this.finish();
        return;
      }
      if (delta > 0) {
        this.completed.add(this.current);
      } else {
        this.completed.delete(next);
      }
      this.current = next;
      this.render();
      this.persist();
      this.scrollToCurrent();
    }

    finish() {
      this.completed.clear();
      this.active = false;
      this.current = 0;
      this.releaseWakeLock();
      this.applyInactive();
      this.render();
      this.persist();
    }

    toggleComplete(i) {
      if (this.completed.has(i)) this.completed.delete(i);
      else this.completed.add(i);
      this.render();
      this.persist();
    }

    render() {
      this.steps.forEach((step, i) => {
        step.classList.toggle("is-current", this.active && i === this.current);
        step.classList.toggle("is-done", this.completed.has(i));
      });
      if (this.progressEl) {
        this.progressEl.classList.toggle("is-visible", this.active);
      }
      if (this.currentEl) {
        this.currentEl.textContent = String(this.current + 1);
      }
      if (this.nextBtn) {
        const isLast = this.current >= this.steps.length - 1;
        this.nextBtn.textContent = isLast ? "Finish" : "Next";
      }
      if (this.prevBtn) {
        this.prevBtn.disabled = this.current === 0;
      }
    }

    scrollToCurrent() {
      const step = this.steps[this.current];
      if (!step) return;
      step.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    async acquireWakeLock() {
      if (!("wakeLock" in navigator)) return;
      try {
        if (this.wakeLock) await this.wakeLock.release().catch(() => {});
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => {
          this.wakeLock = null;
        });
      } catch {
        this.wakeLock = null;
      }
    }

    async releaseWakeLock() {
      if (this.wakeLock) {
        try {
          await this.wakeLock.release();
        } catch {
          // ignore
        }
        this.wakeLock = null;
      }
    }

    persist() {
      try {
        const key = STORAGE_PREFIX + this.id;
        if (!this.active && this.completed.size === 0) {
          localStorage.removeItem(key);
          return;
        }
        localStorage.setItem(
          key,
          JSON.stringify({
            active: this.active,
            current: this.current,
            completed: Array.from(this.completed),
          }),
        );
      } catch {
        // localStorage may be unavailable
      }
    }

    restore() {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + this.id);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (typeof data?.active === "boolean") this.active = data.active;
        if (typeof data?.current === "number") this.current = data.current;
        if (Array.isArray(data?.completed)) {
          this.completed = new Set(data.completed.filter((n) => typeof n === "number"));
        }
      } catch {
        // ignore
      }
    }
  }

  function initAll() {
    document.querySelectorAll("[data-recipe-id]").forEach((root) => {
      if (root.dataset.cookInitialized) return;
      if (!root.querySelector("[data-cook-toggle]")) return;
      new CookMode(root);
      root.dataset.cookInitialized = "true";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
