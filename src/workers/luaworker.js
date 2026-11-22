importScripts("https://cdn.jsdelivr.net/npm/wasmoon@1.16.0/dist/index.js");

let factory;

const PRELUDE = `
local out = __out
__out = nil

local function join(sep, ...)
    local n = select("#", ...)
    local t = {}
    for i = 1, n do t[i] = tostring((select(i, ...))) end
    return table.concat(t, sep)
end

function print(...)
    out(join("\\t", ...) .. "\\n")
end

local function write(...)
    out(join("", ...))
end

io.write = write
io.stdout = { write = function(_, ...) write(...) return io.stdout end }
`;

async function init() {
    factory = new wasmoon.LuaFactory(
        "https://cdn.jsdelivr.net/npm/wasmoon@1.16.0/dist/glue.wasm"
    );

    const lua = await factory.createEngine();
    lua.global.close();
    postMessage({ type: "ready" });
}

const ready = init().catch(e => postMessage({ type: "initError", error: String(e) }));

onmessage = async (e) => {
    if (e.data.type !== "run") return;
    await ready;

    let lua;
    try {
        lua = await factory.createEngine();
        lua.global.set("__out", (s) => postMessage({ type: "out", text: String(s) }));
        await lua.doString(PRELUDE);

        const result = await lua.doString(e.data.code);
        postMessage({
            type: "done",
            result: result !== undefined && result !== null ? String(result) : null,
        });
    } catch (err) {
        postMessage({ type: "done", error: String(err && err.message ? err.message : err) });
    } finally {
        if (lua) lua.global.close();
    }
};