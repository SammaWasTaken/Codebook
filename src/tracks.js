const container = document.getElementById("container");

function openTrack(track) {
    if (typeof track != "string") return;
    window.navigation.navigate("notebook.html?track=" + track);
}

async function init(params) {
    try {
        const json = await loadJson("tracks/tracks.json")

        const tracks = await Promise.all(
            json.tracks.map(track => loadJson(`tracks/${track}/track.json`))
        );

        container.innerHTML += json.tracks.map((track, i) => {
            const x = tracks[i];
            return `
                <div class="cardContainer">
                    <button onClick="openTrack('${track}')" class="card" ${x.exercises.length > 0 ? "" : "disabled title='coming soon'"}>
                        <img src="tracks/${track}/icon.svg">
                        <h2>${x.title}</h2>
                    </button>
                </div>
            `;
        }).join("");
    } catch (error) {
        console.error(error);
    }

    container.innerHTML +=  `
        <div class="cardContainer">
            <button onClick="openTrack(prompt('track url'))" class="card">
                <img src="custom.svg">
                <h2>Custom</h2>
            </button>
        </div>
    `;
}

init()