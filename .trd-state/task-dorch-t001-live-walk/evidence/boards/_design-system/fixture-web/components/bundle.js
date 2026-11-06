var FixtureWeb = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // react-shim:react
  var require_react = __commonJS({
    "react-shim:react"(exports, module) {
      module.exports = window.React;
    }
  });

  // react-shim:react/jsx-runtime
  var require_jsx_runtime = __commonJS({
    "react-shim:react/jsx-runtime"(exports, module) {
      var R = window.React;
      function jsx2(type, props, key) {
        const p = Object.assign({}, props);
        if (key !== void 0) p.key = key;
        return R.createElement(type, p);
      }
      module.exports = { jsx: jsx2, jsxs: jsx2, jsxDEV: jsx2, Fragment: R.Fragment };
    }
  });

  // components/index.jsx
  var index_exports = {};
  __export(index_exports, {
    Button: () => Button,
    Card: () => Card,
    Chip: () => Chip,
    Toggle: () => Toggle
  });
  var import_react = __toESM(require_react());
  var import_jsx_runtime = __toESM(require_jsx_runtime());
  function Button({ children, onClick, variant = "primary" }) {
    const look = variant === "primary" ? "bg-brand text-white" : "bg-white text-brand border border-brand";
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick, className: `min-h-[44px] rounded-md px-4 py-2 font-medium ${look}`, children });
  }
  function Card({ title, children }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "rounded-lg border border-slate-200 bg-white p-4 shadow-sm", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "mb-2 text-lg font-semibold text-ink", children: title }),
      children
    ] });
  }
  function Chip({ children }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rounded-full bg-slate-100 px-3 py-1 text-sm text-ink", children });
  }
  function Toggle({ label, checked, onChange }) {
    const labelId = import_react.default.useId();
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "border-y border-slate-200", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        role: "switch",
        "aria-checked": !!checked,
        "aria-labelledby": labelId,
        onClick: () => onChange == null ? void 0 : onChange(!checked),
        className: "flex min-h-[44px] w-full items-center justify-between gap-4 rounded-md py-2 text-left text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-ink focus-visible:outline-offset-2",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { id: labelId, className: "min-w-0 flex-1 [overflow-wrap:anywhere]", children: label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", className: "min-w-[24px] shrink-0 text-right text-sm", children: checked ? "On" : "Off" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              "aria-hidden": "true",
              className: `relative h-6 w-11 shrink-0 rounded-full transition-colors duration-[120ms] motion-reduce:transition-none ${checked ? "bg-brand" : "bg-slate-500"}`,
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "span",
                {
                  className: `absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-[120ms] motion-reduce:transition-none ${checked ? "translate-x-5" : ""}`
                }
              )
            }
          )
        ]
      }
    ) });
  }
  return __toCommonJS(index_exports);
})();
