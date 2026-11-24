async function loadJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
}

function isHttpUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}