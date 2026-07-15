(function () {
  const DEBOUNCE_MS = 150;
  let instanceSeq = 0;

  class TagsInput {
    constructor(root, { suggestionsUrl }) {
      this.root = root;
      this.suggestionsUrl = suggestionsUrl;
      this.field = root.querySelector("[data-tags-field]");
      this.chipsList = root.querySelector("[data-tags-chips]");
      this.suggestionsEl = root.querySelector("[data-tags-suggestions]");
      this.selected = new Map();
      this.highlightIndex = -1;
      this._timer = null;
      this._abort = null;
      this.optIdPrefix = `tag-opt-${++instanceSeq}-`;
      this.field.setAttribute("aria-autocomplete", "list");

      root
        .querySelectorAll('input[type="hidden"][name="tags"]')
        .forEach((input) => {
          const name = input.value.trim();
          if (name) this.selected.set(name.toLowerCase(), name);
        });
      this.renderChips();
      this.syncHidden();

      this.field.addEventListener("input", () => this.onInput());
      this.field.addEventListener("keydown", (e) => this.onKeyDown(e));
      this.field.addEventListener("blur", () => this.closeSuggestions(true));
      this.chipsList.addEventListener("click", (e) => this.onChipClick(e));
      this.suggestionsEl.addEventListener("mousedown", (e) => e.preventDefault());
      this.suggestionsEl.addEventListener("click", (e) => this.onSuggestionClick(e));
    }

    onChipClick(e) {
      const btn = e.target.closest("[data-remove]");
      if (!btn) return;
      this.remove(btn.getAttribute("data-remove"));
    }

    onSuggestionClick(e) {
      const li = e.target.closest("li[data-name]");
      if (!li) return;
      this.add(li.getAttribute("data-name"));
    }

    onInput() {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.fetchSuggestions(), DEBOUNCE_MS);
    }

    async fetchSuggestions() {
      const q = this.field.value.trim();
      if (!q) {
        this.closeSuggestions(false);
        return;
      }
      if (this._abort) this._abort.abort();
      this._abort = new AbortController();
      let names = [];
      try {
        const res = await fetch(
          `${this.suggestionsUrl}?q=${encodeURIComponent(q)}`,
          { signal: this._abort.signal },
        );
        if (res.ok) names = await res.json();
      } catch (e) {
        if (e && e.name === "AbortError") return;
        names = [];
      }
      this.renderSuggestions(names);
    }

    renderSuggestions(names) {
      const available = (names || []).filter(
        (n) => !this.selected.has(n.toLowerCase()),
      );
      this.suggestionsEl.innerHTML = "";
      if (available.length === 0) {
        this.closeSuggestions(false);
        return;
      }
      for (let i = 0; i < available.length; i++) {
        const name = available[i];
        const li = document.createElement("li");
        li.id = this.optIdPrefix + i;
        li.setAttribute("role", "option");
        li.setAttribute("data-name", name);
        li.textContent = name;
        this.suggestionsEl.appendChild(li);
      }
      this.highlightIndex = -1;
      this.openSuggestions();
    }

    openSuggestions() {
      this.suggestionsEl.hidden = false;
      this.field.setAttribute("aria-expanded", "true");
    }

    closeSuggestions(clearField) {
      this.suggestionsEl.hidden = true;
      this.suggestionsEl.innerHTML = "";
      this.highlightIndex = -1;
      this.field.setAttribute("aria-expanded", "false");
      this.field.removeAttribute("aria-activedescendant");
      if (clearField) this.field.value = "";
    }

    highlight(delta) {
      const items = this.suggestionsEl.querySelectorAll("li[data-name]");
      if (items.length === 0) return;
      let idx = this.highlightIndex + delta;
      if (idx < 0) idx = items.length - 1;
      if (idx >= items.length) idx = 0;
      this.highlightIndex = idx;
      items.forEach((li, i) =>
        li.setAttribute("aria-selected", i === idx ? "true" : "false"),
      );
      const el = items[idx];
      if (el) {
        this.field.setAttribute("aria-activedescendant", el.id);
        if (el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
      }
    }

    highlightedName() {
      const items = this.suggestionsEl.querySelectorAll("li[data-name]");
      const el = items[this.highlightIndex];
      return el ? el.getAttribute("data-name") : null;
    }

    onKeyDown(e) {
      if (e.key === "Enter") {
        const picked = this.highlightedName();
        const typed = this.field.value.trim();
        if (picked) {
          e.preventDefault();
          this.add(picked);
        } else if (typed) {
          e.preventDefault();
          this.add(typed);
        }
      } else if (
        e.key === "Backspace" &&
        this.field.value === "" &&
        this.selected.size > 0
      ) {
        const lastKey = Array.from(this.selected.keys()).pop();
        if (lastKey) this.remove(this.selected.get(lastKey));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (this.suggestionsEl.hidden) this.fetchSuggestions();
        else this.highlight(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.highlight(-1);
      } else if (e.key === "Escape") {
        this.closeSuggestions(true);
      }
    }

    add(rawName) {
      const name = (rawName || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (this.selected.has(key)) {
        this.closeSuggestions(true);
        return;
      }
      this.selected.set(key, name);
      this.appendChip(name);
      this.appendHidden(name);
      this.closeSuggestions(true);
    }

    remove(rawName) {
      const name = (rawName || "").trim();
      const key = name.toLowerCase();
      const original = this.selected.get(key);
      if (!original) return;
      this.selected.delete(key);
      this.chipsList.querySelectorAll("[data-chip]").forEach((li) => {
        if (li.getAttribute("data-chip") === original) li.remove();
      });
      this.root
        .querySelectorAll('input[type="hidden"][name="tags"]')
        .forEach((input) => {
          if (input.value === original) input.remove();
        });
    }

    appendChip(name) {
      const li = document.createElement("li");
      li.className = "tags-input__chip";
      li.setAttribute("data-chip", name);
      const span = document.createElement("span");
      span.textContent = name;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tags-input__remove";
      btn.setAttribute("data-remove", name);
      btn.setAttribute("aria-label", `Remove ${name}`);
      btn.textContent = "\u00d7";
      li.appendChild(span);
      li.appendChild(btn);
      this.chipsList.appendChild(li);
    }

    appendHidden(name) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "tags";
      input.value = name;
      this.root.appendChild(input);
    }

    renderChips() {
      this.chipsList.innerHTML = "";
      for (const name of this.selected.values()) this.appendChip(name);
    }

    syncHidden() {
      this.root
        .querySelectorAll('input[type="hidden"][name="tags"]')
        .forEach((el) => el.remove());
      for (const name of this.selected.values()) this.appendHidden(name);
    }
  }

  function initAll() {
    document.querySelectorAll("[data-tags-input]").forEach((el) => {
      if (el.dataset.tagsInitialized) return;
      const url = el.getAttribute("data-suggestions-url") || "/tags/autocomplete";
      new TagsInput(el, { suggestionsUrl: url });
      el.dataset.tagsInitialized = "true";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
