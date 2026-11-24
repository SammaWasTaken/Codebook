const container = document.getElementById("container");

const params = new URLSearchParams(window.location.search);
const track = params.get("track") ?? "python";

const trackurl = isHttpUrl(track)
    ? track
    : `tracks/${track}/`;

let saved = parseInt(localStorage.getItem(track) ?? "-1");

async function init() {
    let json = await loadJson(trackurl + "track.json");

    const exercises = await Promise.all(
        json.exercises.map(ex => loadJson(`${trackurl}/${ex}`))
    );

    json.exercises.map((_, i) => {
        const x = exercises[i];
        
        let btn = document.createElement("button");
        btn.classList.add("quitz-btn", "skip-btn");
        btn.textContent = `${i + 1}) ${x.title}`;

        btn.onclick = () => {
            if (i - 1 > saved) localStorage.setItem(track, i - 1);

            window.navigation.navigate(`notebook.html?track=${track}&ex=${i}`);
        };

        container.appendChild(btn);
    })
}

init();