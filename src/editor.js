const renderer = new marked.Renderer();

const next = document.getElementById("next");
const prev = document.getElementById("back");

const out = document.getElementById("out");
const btn = document.getElementById("run");
const submit = document.getElementById("submit");

const container = document.getElementById("container");
const exname = document.getElementById("exname");
const divider = document.getElementById("divider");
const MIN_PANEL = 500;

const editorSection = document.getElementById("editor");
const quitzSection = document.getElementById("quitz");


const codebox = document.getElementById("code");
const ipad = document.getElementById("ipad");

const params = new URLSearchParams(window.location.search);
const track = params.get("track") ?? "python";
const trackurl = isHttpUrl(track)
    ? track
    : `tracks/${track}/`;

if (isHttpUrl(track)) {
    const host = new URL(track).hostname;
    const ok = confirm(
        `This track is hosted on ${host}.\n\nOnly load tracks from sources you trust. Load it?`
    );
    if (!ok)
        window.navigation.navigate("tracks.html");
}

let saved = parseInt(localStorage.getItem(track) ?? "-1");

const error = new Audio('error.ogg');
error.preload = 'auto';

const complete = new Audio('complete.ogg');
complete.preload = 'auto';

const VIDEO_EXT = /\.(mp4|webm|ogv|mov|m4v)(\?.*)?$/i;

function escapeAttr(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function resolveAsset(src) {
    return new URL(src, new URL(trackurl, window.location.href)).href;
}

function youtubeId(src) {
    try {
        const u = new URL(src);
        let id = null;
        if (u.hostname === "youtu.be") id = u.pathname.slice(1);
        else if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") {
            if (u.pathname === "/watch") id = u.searchParams.get("v");
            else {
                const m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/);
                if (m) id = m[1];
            }
        }
        return id && /^[\w-]{11}$/.test(id) ? id : null;
    } catch {
        return null;
    }
}

function mediaHtml(src, width, alt = "") {
    const w = parseInt(width);
    const wAttr = w > 0 ? ` width="${w}"` : "";

    const yt = youtubeId(src);
    if (yt) {
        return `<iframe class="embed-youtube"${wAttr} src="https://www.youtube-nocookie.com/embed/${yt}" allowfullscreen></iframe>`;
    }

    const url = resolveAsset(src);
    if (VIDEO_EXT.test(url)) {
        return `<video class="embed-video" controls preload="metadata"${wAttr} src="${escapeAttr(url)}"></video>`;
    }

    return `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}"${wAttr}>`;
}

const obsidianEmbed = {
    name: "obsidianEmbed",
    level: "inline",
    start(src) { return src.indexOf("![["); },
    tokenizer(src) {
        const m = /^!\[\[([^\]|]+)(?:\|(\d+))?\]\]/.exec(src);
        if (m) return { type: "obsidianEmbed", raw: m[0], src: m[1].trim(), width: m[2] };
    },
    renderer(token) {
        return mediaHtml(token.src, token.width);
    }
};

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "IFRAME") {
        const src = node.getAttribute("src") || "";
        if (!src.startsWith("https://www.youtube-nocookie.com/embed/")) {
            node.remove();
            return;
        }
        node.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
        node.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    }
});

renderer.codespan = function (text) {
    return `<code class="inline-code">${text}</code>`;
};

renderer.code = function (code, infostring) {
    const lang = (infostring || '').match(/\S*/)[0] || 'text';
    const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return `<pre class="code-block"><code class="language-${lang}">${escaped}</code></pre>`;
};

renderer.image = function (href, title, text) {
    return mediaHtml(href, null, text);
};

marked.use({ renderer, extensions: [obsidianEmbed] });

let ex = parseInt(params.get("ex"));

if (isNaN(ex)) ex = saved + 1;

let trackData = [];
let trackCompare = "";

let editor;

const editorReady = new Promise((resolve) => {
    require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs" } });
    require(["vs/editor/editor.main"], function () {
        editor = monaco.editor.create(codebox, {
            value: "loading your exercise",
            language: "",
            theme: "vs-dark",
            automaticLayout: true,
            padding: { top: 20, bottom: 20 },
            minimap: { enabled: false },
        });
        resolve(editor);
    });
});

let worker = null;
let workerReady = false;
let running = false;
let currentRun = null;

function startWorker() {
    workerReady = false;
    btn.disabled = true;
    btn.textContent = "Loading...";

    worker = new Worker(`workers/${trackData.language}worker.js`);

    worker.onerror = (e) => {
        btn.textContent = "Failed to load";
        const err = document.createElement("err");
        err.textContent = "Worker error: " + (e.message || "failed to load worker script");
        out.appendChild(err);
    };

    worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "ready") {
            workerReady = true;
            btn.disabled = false;
            btn.textContent = "Run";
        } else if (msg.type === "initError") {
            btn.textContent = "Failed to load";
            const err = document.createElement("err");
            err.textContent = "Init error: " + msg.error;
            out.appendChild(err);
        } else if (msg.type === "out") {
            out.textContent += msg.text;
        } else if (msg.type === "done") {
            if (msg.error) {
                const err = document.createElement("err");
                err.textContent = "Error: " + msg.error;
                out.appendChild(err);
            }
            else if (msg.result !== null) out.textContent += msg.result;
            finishRun(true);
        }
    };
}

function finishRun(completed) {
    running = false;
    btn.textContent = "Run";
    submit.disabled = false;
    if (currentRun) {
        currentRun.resolve(completed);
        currentRun = null;
    }
}

function run() {
    return new Promise((resolve) => {
        out.textContent = "";
        running = true;
        currentRun = { resolve };
        btn.textContent = "Stop";
        submit.disabled = true;
        worker.postMessage({ type: "run", code: editor.getValue() });
    });
}

function stop() {
    worker.terminate();
    out.textContent += "\n[stopped]";
    startWorker();
    finishRun(false);
}

async function init() {
    const [data] = await Promise.all([
        loadJson(trackurl + "track.json"),
        editorReady
    ]);
    trackData = data;

    monaco.editor.setModelLanguage(editor.getModel(), trackData.language);

    await reqExercise(ex);
    startWorker();
}

btn.onclick = () => {
    if (running) stop();
    else if (workerReady) run();
};

function unlockEx() {
    next.disabled = false;

    if (ex > saved) {
        saved = ex;
        localStorage.setItem(track, ex);
    }
}

submit.onclick = async () => {
    if (running || !workerReady) return;
    const completed = await run();
    if (!completed) return;

    const data = out.textContent.trim().toLowerCase();
    if (data === trackCompare) {
        unlockEx();
        
        complete.currentTime = 0;
        complete.play();
    } else {
        out.innerText = "";

        Diff.diffWords(data, trackCompare).forEach(part => {
            const span = document.createElement('span');
            span.textContent = part.value;
            if (part.added) span.className = 'added';
            if (part.removed) span.className = 'removed';
            out.appendChild(span);
        });

        error.currentTime = 0;
        error.play();
    }
};

function disablePanels() {
    editorSection.hidden = true;
    quitzSection.hidden = true;
}

async function reqExerciseUrl(url) {
    let json = await loadJson(url);

    ipad.innerHTML = DOMPurify.sanitize(marked.parse(json.text), {
        ADD_TAGS: ["iframe"],
        ADD_ATTR: ["allowfullscreen"],
    });

    disablePanels();

    switch (json.modal) {
        case "quiz":
            quitzSection.innerHTML = "";

            let lbl = document.createElement("h2");
            lbl.textContent = json.question;

            lbl.style.maxWidth = "60%";
            lbl.style.textAlign = "center";

            quitzSection.appendChild(lbl);

            for (const [key, value] of shuffle(Object.entries(json.options))) {
                let btn = document.createElement("button");
                btn.classList.add("quitz-btn");

                btn.textContent = key;

                btn.onclick = () => {
                    if (value) {
                        btn.classList.add("correct-btn");

                        for (const b of document.getElementsByClassName("quitz-btn")) b.disabled = true;

                        unlockEx();

                        complete.currentTime = 0;
                        complete.play();
                    } else {
                        btn.classList.add("wrong-btn");

                        btn.disabled = true;

                        error.currentTime = 0;
                        error.play();
                    }
                };

                quitzSection.appendChild(btn);
            }

            quitzSection.hidden = false;
            break;
        default:
            editor.setValue(json.code);
            trackCompare = json.result.trim().toLocaleLowerCase();

            editorSection.hidden = false;
            break;
    }

    

    exname.innerText = `${trackData.title}, Ex ${ex + 1}: ${json.title}`;
    document.title = "Codebook - " + exname.innerText;
}

next.onclick = () => {
    next.disabled = true;

    if (ex + 1 < trackData.exercises.length)
        reqExercise(ex + 1);
    else {
        document.body.innerHTML = `
            <div class="fullscreen">
                <div>
                    <h1>You completed the ${trackData.title} track, good job!</h1>
                    <br>

                    <div class="simplebar">
                        <a href="tracks.html" class="btn golden-btn">go back to tracks</a>
                    </div>
                </div>
            </div>
        `;
    }
};

prev.onclick = () => reqExercise(ex - 1);

function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function skipToExercise() {
    window.navigation.navigate(`exskip.html?track=${track}`);
}

function resetProgress() {
    if (confirm("do you want to reset progress?"))
    {
        saved = -1;
        localStorage.setItem(track, -1);
        reqExercise(0);
    }
}

function reqExercise(num) {
    ex = Math.max(Math.min(Math.min(num, trackData.exercises.length - 1), saved + 1), 0);

    if (saved >= ex)
        next.disabled = false;
    else next.disabled = true;

    if (ex + 1 >= trackData.exercises.length)
        next.innerText = "Finish track";
    else next.innerText = "Next";

    if (ex > 0) prev.disabled = false;
    else prev.disabled = true;

    params.set("track", track);
    params.set("ex", ex);
    history.replaceState(null, "", "?" + params.toString());

    out.innerText = "";

    reqExerciseUrl(trackurl + trackData.exercises[ex]);
}

divider.addEventListener("pointerdown", (e) => {
    divider.setPointerCapture(e.pointerId);
    divider.classList.add("dragging");
    document.body.classList.add("dragging");
});

divider.addEventListener("pointermove", (e) => {
    if (!divider.hasPointerCapture(e.pointerId)) return;
    const rect = container.getBoundingClientRect();
    let x = e.clientX - rect.left;
    x = Math.max(MIN_PANEL, Math.min(x, rect.width - MIN_PANEL - divider.offsetWidth));
    ipad.style.width = (x / rect.width * 100) + "%";
});

divider.addEventListener("pointerup", (e) => {
    divider.releasePointerCapture(e.pointerId);
    divider.classList.remove("dragging");
    document.body.classList.remove("dragging");
});

init();