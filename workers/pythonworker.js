importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

let pyodide;

async function init() {
    pyodide = await loadPyodide();
    pyodide.setStdout({ batched: s => postMessage({ type: "out", text: s + "\n" }) });
    pyodide.setStderr({ batched: s => postMessage({ type: "out", text: s + "\n" }) });
    postMessage({ type: "ready" });
}

const ready = init().catch(e => postMessage({ type: "initError", error: String(e) }));

onmessage = async (e) => {
    if (e.data.type !== "run") return;
    await ready;
    try {
        const result = await pyodide.runPythonAsync(e.data.code);
        postMessage({ type: "done", result: result !== undefined ? String(result) : null });
    } catch (err) {
        postMessage({ type: "done", error: String(err) });
    }
};