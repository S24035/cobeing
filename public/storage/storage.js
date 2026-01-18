(function () {
  "use strict";

  function safeParse(json) {
    try {
      return JSON.parse(json);
    } catch (err) {
      return null;
    }
  }

  function deepClone(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
  }

  function createStore(options) {
    const key = options && options.key ? String(options.key) : "";
    const version = Number(options && options.version) || 1;
    const defaultData = options && options.defaultData ? options.defaultData : {};
    const migrate = options && typeof options.migrate === "function" ? options.migrate : null;

    function load() {
      if (!key) {
        return { schemaVersion: version, data: deepClone(defaultData) };
      }
      const raw = (() => {
        try {
          return localStorage.getItem(key);
        } catch (err) {
          return null;
        }
      })();
      if (!raw) {
        return { schemaVersion: version, data: deepClone(defaultData) };
      }
      const parsed = safeParse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { schemaVersion: version, data: deepClone(defaultData) };
      }

      const currentVersion = Number(parsed.schemaVersion || 0) || 0;
      let data = parsed.data;
      if (!data || typeof data !== "object") data = deepClone(defaultData);

      if (currentVersion !== version) {
        if (migrate) {
          const migrated = migrate(deepClone(data), currentVersion, version);
          if (migrated && typeof migrated === "object" && migrated.data) {
            data = migrated.data;
          } else if (migrated && typeof migrated === "object") {
            data = migrated;
          }
        }
        save(data);
        return { schemaVersion: version, data };
      }

      return { schemaVersion: currentVersion, data };
    }

    function save(nextData) {
      if (!key) return;
      const payload = {
        schemaVersion: version,
        data: deepClone(nextData || defaultData),
      };
      try {
        localStorage.setItem(key, JSON.stringify(payload));
      } catch (err) {
        console.warn("[storage] save failed", err);
      }
    }

    return { load, save, key, version };
  }

  window.CobeingStorage = window.CobeingStorage || {
    createStore,
  };
})();
