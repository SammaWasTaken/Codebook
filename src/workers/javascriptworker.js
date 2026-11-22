(() => {
    "use strict";

    const g = globalThis;

    const post = g.postMessage.bind(g);
    const addListener = g.addEventListener.bind(g);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const token = (() => {
        const a = new Uint32Array(4);
        crypto.getRandomValues(a);
        return Array.from(a, n => n.toString(16)).join("");
    })();

    const send = (msg) => post({ ...msg, token });

    const BLOCKED = [
        "fetch", "XMLHttpRequest", "WebSocket", "WebTransport", "EventSource",
        "Request", "Response", "Headers", "RTCPeerConnection",

        "importScripts", "Worker", "SharedWorker", "WebAssembly",

        "indexedDB", "IDBFactory", "caches", "CacheStorage", "BroadcastChannel",
        "MessageChannel", "MessagePort", "localStorage", "sessionStorage",
        "FileReaderSync", "webkitRequestFileSystem", "webkitRequestFileSystemSync",
        "navigator", "location", "close",

        "postMessage", "onmessage", "onmessageerror", "addEventListener",
        "removeEventListener", "dispatchEvent",
    ];

    function strip(name) {
        for (let o = g; o; o = Object.getPrototypeOf(o)) {
            if (Object.prototype.hasOwnProperty.call(o, name)) {
                try {
                    Object.defineProperty(o, name, {
                        value: undefined, writable: false, configurable: false,
                    });
                } catch (_) {
                    try { delete o[name]; } catch (_) { /* non-configurable */ }
                }
            }
        }
    }

    function fmt(v) {
        if (typeof v === "string") return v;
        if (v === undefined) return "undefined";
        if (typeof v === "function") return v.toString();
        if (typeof v === "bigint") return v + "n";
        if (v instanceof Error) return v.stack || String(v);
        try {
            const seen = new WeakSet();
            return JSON.stringify(v, (k, x) => {
                if (typeof x === "bigint") return x + "n";
                if (typeof x === "object" && x !== null) {
                    if (seen.has(x)) return "[Circular]";
                    seen.add(x);
                }
                return x;
            }, 2) ?? String(v);
        } catch (_) {
            return String(v);
        }
    }

    const out = (prefix) => (...args) =>
        send({ type: "out", text: prefix + args.map(fmt).join(" ") + "\n" });

    const sandboxConsole = Object.freeze({
        log: out(""), info: out(""), debug: out(""),
        warn: out("[warn] "), error: out("[error] "),
        table: out(""), dir: out(""), trace: out(""),
        assert: (c, ...a) => { if (!c) out("[assert] ")(...a); },
        clear() {}, group() {}, groupEnd() {}, time() {}, timeEnd() {},
    });

    async function run(code) {
        let fn;
        try {
            fn = new AsyncFunction("console", `"use strict"; return (\n${code}\n);`);
        } catch (_) {
            fn = new AsyncFunction("console", `"use strict";\n${code}`);
        }
        return fn(sandboxConsole);
    }

    let running = false;
    const onMessage = async (e) => {
        const data = e.data;
        if (!data || data.type !== "run" || typeof data.code !== "string") return;
        if (running) return send({ type: "done", error: "Worker is busy" });
        running = true;
        try {
            const result = await run(data.code);
            send({ type: "done", result: result !== undefined ? fmt(result) : null });
        } catch (err) {
            send({ type: "done", error: err && err.stack ? String(err.stack) : String(err) });
        } finally {
            running = false;
        }
    };

    addListener("message", onMessage);
    BLOCKED.forEach(strip);

    send({ type: "ready" });
})();