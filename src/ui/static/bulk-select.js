(function () {
  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD = 10;
  const LEAVE_MS = 150;
  const FLIP_MS = 280;

  class BulkSelect {
    constructor(root) {
      this.root = root;
      this.form = document.getElementById("bulk-delete-form");
      this.countEl = root.querySelector("[data-bulk-count]");
      this.deleteBtn = root.querySelector("[data-bulk-delete]");
      this.selectAllBtn = root.querySelector("[data-bulk-select-all]");
      this.clearBtn = root.querySelector("[data-bulk-clear]");
      this.cancelBtn = root.querySelector("[data-bulk-cancel]");
      this.selected = new Set();
      this.mode = false;
      this._timer = null;
      this._press = null;
      this._suppressClick = false;
      this._flipFirst = null;
      this._deleting = false;

      this.bindCards();
      this.bindControls();
      this.bindGlobal();
      this.wireToasts();
    }

    cards() {
      return this.root.querySelectorAll("[data-recipe-id]");
    }

    bindCards() {
      this.cards().forEach((card) => this.bindCard(card));
    }

    bindCard(card) {
      const id = Number(card.getAttribute("data-recipe-id"));
      card.addEventListener("click", (e) => this.onCardClick(e, id));
      card.addEventListener("pointerdown", (e) => this.onPointerDown(e, id));
      card.addEventListener("pointermove", (e) => this.onPointerMove(e));
      card.addEventListener("pointerup", () => this.cancelPress());
      card.addEventListener("pointerleave", () => this.cancelPress());
      card.addEventListener("pointercancel", () => this.cancelPress());
      card.addEventListener("contextmenu", (e) => {
        if (this.mode) e.preventDefault();
      });
      const check = card.querySelector(".check");
      if (check) check.addEventListener("click", (e) => this.onCheckClick(e, id));
    }

    bindControls() {
      if (this.selectAllBtn) this.selectAllBtn.addEventListener("click", () => this.selectAll());
      if (this.clearBtn) this.clearBtn.addEventListener("click", () => this.clear());
      if (this.cancelBtn) this.cancelBtn.addEventListener("click", () => this.exit());
      if (this.deleteBtn) {
        this.deleteBtn.addEventListener("htmx:confirm", (e) => {
          e.preventDefault();
          this.animateDelete(() => e.detail.issueRequest(true));
        });
        this.deleteBtn.addEventListener("htmx:afterRequest", (e) => {
          if (e.detail && e.detail.successful) this.onDeleted();
          else this.cancelDeleteAnim();
        });
      }
    }

    bindGlobal() {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.mode) this.exit();
      });
      document.body.addEventListener("htmx:afterSwap", (e) => {
        const t = e.detail && e.detail.target;
        if (t && t.id === "grid") {
          if (this._flipFirst) {
            const first = this._flipFirst;
            this._flipFirst = null;
            this.bindCards();
            this.flipPlay(first);
            this.applySelection();
          } else {
            this.bindCards();
            this.applySelection();
            this.gridFade();
          }
        }
        this.wireToasts();
      });
    }

    enter(id) {
      this.mode = true;
      this.root.classList.add("is-selecting");
      if (id != null) this.toggle(id, true);
    }

    exit() {
      this.mode = false;
      this.root.classList.remove("is-selecting");
      this.selected.clear();
      this.applySelection();
      this.renderCount();
      this.syncForm();
    }

    toggle(id, force) {
      const on = force !== undefined ? force : !this.selected.has(id);
      if (on) this.selected.add(id);
      else this.selected.delete(id);
      this.markCard(id, on);
      this.renderCount();
      this.syncForm();
    }

    markCard(id, on) {
      const card = this.root.querySelector('[data-recipe-id="' + id + '"]');
      if (!card) return;
      card.classList.toggle("is-selected", on);
      const check = card.querySelector(".check");
      if (check) {
        check.classList.toggle("on", on);
        check.setAttribute("aria-pressed", String(on));
      }
    }

    applySelection() {
      this.cards().forEach((card) => {
        const id = Number(card.getAttribute("data-recipe-id"));
        const on = this.selected.has(id);
        card.classList.toggle("is-selected", on);
        const check = card.querySelector(".check");
        if (check) {
          check.classList.toggle("on", on);
          check.setAttribute("aria-pressed", String(on));
        }
      });
    }

    selectAll() {
      this.cards().forEach((card) => {
        this.selected.add(Number(card.getAttribute("data-recipe-id")));
      });
      this.applySelection();
      this.renderCount();
      this.syncForm();
    }

    clear() {
      this.selected.clear();
      this.applySelection();
      this.renderCount();
      this.syncForm();
    }

    renderCount() {
      if (this.countEl) this.countEl.textContent = String(this.selected.size);
      if (this.deleteBtn) {
        if (this.selected.size === 0) this.deleteBtn.setAttribute("disabled", "");
        else this.deleteBtn.removeAttribute("disabled");
      }
    }

    syncForm() {
      if (!this.form) return;
      this.form.querySelectorAll('input[name="ids"]').forEach((el) => el.remove());
      for (const id of this.selected) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "ids";
        input.value = String(id);
        this.form.appendChild(input);
      }
    }

    onDeleted() {
      this._deleting = false;
      this.selected.clear();
      this.exit();
    }

    animateDelete(issueRequest) {
      if (this._deleting) return;
      this._deleting = true;
      const leaving = [];
      this.selected.forEach((id) => {
        const card = this.root.querySelector('[data-recipe-id="' + id + '"]');
        if (card) {
          card.classList.add("bulk-leaving");
          leaving.push(card);
        }
      });
      const first = this.captureFirst();
      const wait = leaving.length ? LEAVE_MS : 0;
      setTimeout(() => {
        this._flipFirst = first;
        issueRequest();
      }, wait);
    }

    captureFirst() {
      const map = {};
      this.cards().forEach((card) => {
        const id = card.getAttribute("data-recipe-id");
        const r = card.getBoundingClientRect();
        map[id] = { x: r.left, y: r.top };
      });
      return map;
    }

    flipPlay(first) {
      const movers = [];
      this.cards().forEach((card) => {
        const id = card.getAttribute("data-recipe-id");
        const old = first[id];
        if (!old) return;
        const r = card.getBoundingClientRect();
        const dx = old.x - r.left;
        const dy = old.y - r.top;
        if (!dx && !dy) return;
        card.style.transition = "none";
        card.style.transform = "translate(" + dx + "px," + dy + "px)";
        movers.push(card);
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          movers.forEach((card) => {
            card.style.transition = "transform " + FLIP_MS + "ms ease-out";
            card.style.transform = "";
          });
        });
      });
      setTimeout(() => {
        movers.forEach((card) => {
          card.style.transition = "";
          card.style.transform = "";
        });
      }, FLIP_MS + 80);
    }

    gridFade() {
      const grid = document.getElementById("grid");
      if (!grid) return;
      grid.classList.remove("is-swapping");
      void grid.offsetWidth;
      grid.classList.add("is-swapping");
      setTimeout(() => grid.classList.remove("is-swapping"), 280);
    }

    cancelDeleteAnim() {
      this._deleting = false;
      this._flipFirst = null;
      this.cards().forEach((card) => card.classList.remove("bulk-leaving"));
    }

    onCardClick(e, id) {
      if (this._suppressClick) {
        this._suppressClick = false;
        return;
      }
      if (!this.mode) return;
      if (e.target.closest(".fav-btn") || e.target.closest(".check")) return;
      e.preventDefault();
      this.toggle(id);
    }

    onCheckClick(e, id) {
      if (this._suppressClick) {
        this._suppressClick = false;
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (!this.mode) this.enter(null);
      this.toggle(id);
    }

    onPointerDown(e, id) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest(".fav-btn")) return;
      this._press = { x: e.clientX, y: e.clientY };
      this._timer = setTimeout(() => {
        this._timer = null;
        if (this._press) {
          this._suppressClick = true;
          this.enter(id);
        }
      }, LONG_PRESS_MS);
    }

    onPointerMove(e) {
      if (!this._press) return;
      const dx = e.clientX - this._press.x;
      const dy = e.clientY - this._press.y;
      if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) this.cancelPress();
    }

    cancelPress() {
      if (this._timer) clearTimeout(this._timer);
      this._timer = null;
      this._press = null;
    }

    wireToasts() {
      document.querySelectorAll("[data-toast]").forEach((t) => {
        if (t.dataset.toastWired) return;
        t.dataset.toastWired = "true";
        setTimeout(() => {
          if (t.parentNode) t.remove();
        }, 10000);
      });
    }
  }

  function initAll() {
    document.querySelectorAll("[data-bulk-select]").forEach((el) => {
      if (el.dataset.bulkSelectInitialized) return;
      new BulkSelect(el);
      el.dataset.bulkSelectInitialized = "true";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
