const API_URL = "https://api.tvmaze.com";
const API_KEY = "VUqlkNdRXXNofKzvZma55dVo7f3yUn74";

async function fetchTVmaze(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`);

    if (!response.ok) {
        throw new Error(`TVmaze request failed: ${response.status}`);
    }

    return response.json();
}

async function searchShows(query) {
    const results = await fetchTVmaze(
        `/search/shows?q=${encodeURIComponent(query)}`
    );

    const container = document.getElementById("shows-container");

    // Clear previous results
    container.innerHTML = "";

    results.forEach(result => {
        console.log(result.show.name + "\n" + result.show.summary);
        const show = result.show;

        // Create a container for this show
        const showElement = document.createElement("div");

        // Show name
        const title = document.createElement("h2");
        title.textContent = show.name;
        showElement.appendChild(title);

        // Show image (if available)
        if (show.image) {
            const image = document.createElement("img");
            image.src = show.image.medium;
            image.alt = show.name;
            showElement.appendChild(image);
        }

        // Show rating
        const rating = document.createElement("p");
        rating.textContent = `Rating: ${show.rating.average ?? "N/A"}`;
        showElement.appendChild(rating);

        // Show summary
        const summary = document.createElement("div");
        summary.innerHTML = show.summary ?? "No summary available.";
        showElement.appendChild(summary);

        // Add this show to the webpage
        container.appendChild(showElement);
    });
}

async function handleSearch() {
    console.log("Search button clicked!");

    const query = document.getElementById("search-input").value.trim();
    console.log(query);

    if (!query) return;

    try {
        await searchShows(query);
    } catch (error) {
        console.error("Error searching for shows:", error);
    }
}

const HOUR_WIDTH = 300; // pixels per hour
const WINDOW_MINUTES = 360;
const MINUTE_WIDTH = HOUR_WIDTH / 60;

function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getChannel(show) {
    const channel = show.network || show.webChannel;

    if (!channel) {
        return {
            id: "unknown",
            name: "Other / Unknown",
            image: null
        };
    }

    return {
        id: `${show.network ? "network" : "web"}-${channel.id}`,
        name: channel.name,
        image: channel.image?.medium || null
    };
}

async function loadTVGuide() {
    const guide = document.getElementById("tv-guide");
    const status = document.getElementById("guide-status");

    status.textContent = "Loading schedule...";

    try {
        const now = new Date();
        const end = new Date(
            now.getTime() + WINDOW_MINUTES * 60_000
        );

        // Fetch today and tomorrow so the timeline works
        // when the three-hour window crosses midnight.
        const today = localDateString(now);
        const tomorrow = localDateString(
            new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        );

        const [todayEpisodes, tomorrowEpisodes] = await Promise.all([
            fetchTVmaze(`/schedule?country=US&date=${today}`),
            fetchTVmaze(`/schedule?country=US&date=${tomorrow}`)
        ]);

        const episodes = [
            ...todayEpisodes,
            ...tomorrowEpisodes
        ];

        const seen = new Set();

        const programs = episodes
            .filter(ep => ep.airstamp)
            .filter(ep => {
                if (seen.has(ep.id)) return false;
                seen.add(ep.id);
                return true;
            })
            .map(ep => {
                const start = new Date(ep.airstamp);
                const duration =
                    ep.runtime || ep.show?.averageRuntime ||
                    ep.show?.runtime || 30;

                return {
                    ...ep,
                    start,
                    end: new Date(start.getTime() + duration * 60_000),
                    channel: getChannel(ep.show)
                };
            })
            // Include programs already airing at the current time.
            .filter(ep => ep.start < end && ep.end > now)
            .sort((a, b) => a.start - b.start);

        renderTVGuide(programs, now, end);

        status.textContent =
            `Updated ${now.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit"
            })}`;
    } catch (error) {
        console.error("Could not load TV guide:", error);
        status.textContent = "Could not load schedule. Try refreshing.";
    }
}

function renderTVGuide(programs, now, end) {
    const guide = document.getElementById("tv-guide");
    guide.replaceChildren();

    const timelineWidth = HOUR_WIDTH * 6;

    // Build the time ruler.
    const header = document.createElement("div");
    header.className = "guide-row guide-header";

    const corner = document.createElement("div");
    corner.className = "channel-cell channel-corner";
    corner.textContent = "CHANNEL";
    header.appendChild(corner);

    const ruler = document.createElement("div");
    ruler.className = "time-ruler";
    ruler.style.width = `${timelineWidth}px`;

    for (let minute = 0; minute < WINDOW_MINUTES; minute += 30) {
        const tick = document.createElement("div");
        tick.className = "time-tick";
        tick.style.left = `${minute * MINUTE_WIDTH}px`;

        const tickTime = new Date(now.getTime() + minute * 60_000);

        tick.textContent = tickTime.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit"
        });

        ruler.appendChild(tick);
    }

    header.appendChild(ruler);
    guide.appendChild(header);

    // Group programs by channel.
    const channels = new Map();

    for (const ep of programs) {
        if (!channels.has(ep.channel.id)) {
            channels.set(ep.channel.id, {
                channel: ep.channel,
                programs: []
            });
        }

        channels.get(ep.channel.id).programs.push(ep);
    }

    // Sort channels alphabetically.
    const sortedChannels = [...channels.values()].sort(
        (a, b) => a.channel.name.localeCompare(b.channel.name)
    );

    for (const group of sortedChannels) {
        const row = document.createElement("div");
        row.className = "guide-row";

        // Fixed channel column.
        const channelCell = document.createElement("div");
        channelCell.className = "channel-cell";

        if (group.channel.image) {
            const logo = document.createElement("img");
            logo.className = "channel-logo";
            logo.src = group.channel.image;
            logo.alt = "";
            logo.loading = "lazy";
            channelCell.appendChild(logo);
        }

        const channelName = document.createElement("span");
        channelName.textContent = group.channel.name;
        channelCell.appendChild(channelName);

        row.appendChild(channelCell);

        // Timeline for this channel.
        const track = document.createElement("div");
        track.className = "program-track";
        track.style.width = `${timelineWidth}px`;

        // Vertical grid lines every 30 minutes.
        for (let minute = 0; minute <= WINDOW_MINUTES; minute += 30) {
            const line = document.createElement("div");
            line.className = "grid-line";
            line.style.left = `${minute * MINUTE_WIDTH}px`;
            track.appendChild(line);
        }

        for (const ep of group.programs) {
            // Clip each program to the three-hour window.
            const visibleStart = Math.max(ep.start.getTime(), now.getTime());
            const visibleEnd = Math.min(ep.end.getTime(), end.getTime());

            const left =
                (visibleStart - now.getTime()) / 60_000 * MINUTE_WIDTH;
            const width =
                (visibleEnd - visibleStart) / 60_000 * MINUTE_WIDTH;

            const block = document.createElement("div");
            block.className = "program";

            block.tabIndex = 0;
            block.setAttribute("role", "button");
            block.setAttribute(
                "aria-label",
                `View details for ${ep.show.name}: ${ep.name}`
            );

            block.addEventListener("click", () => {
                openShowModal(ep);
            });

            block.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openShowModal(ep);
                }
            });

            block.style.left = `${left}px`;
            block.style.width = `${Math.max(0, width - 3)}px`;

            const title = document.createElement("strong");
            title.textContent = ep.show.name;
            block.appendChild(title);

            const episodeTitle = document.createElement("span");
            episodeTitle.textContent = ep.name;
            block.appendChild(episodeTitle);

            const time = document.createElement("small");
            time.textContent = (ep.start.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit"
            }) + " - " + ep.end.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit"
            }));
            block.appendChild(time);

            block.title =
                `${ep.show.name}: ${ep.name}\n` +
                `${time.textContent}`;

            track.appendChild(block);
        }

        row.appendChild(track);
        guide.appendChild(row);
    }

    if (sortedChannels.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-message";
        empty.textContent =
            "No scheduled episodes found for the next three hours.";
        guide.appendChild(empty);
    }
}

const showModal = document.getElementById("show-modal");
const closeModalButton = document.getElementById("close-modal");

function openShowModal(ep) {
    const show = ep.show;

    const image = document.getElementById("modal-image");
    const title = document.getElementById("modal-title");
    const runtime = document.getElementById("modal-runtime");
    const description = document.getElementById("modal-description");

    // Use the episode image first, then the show's cover art.
    image.src =
        ep.image?.original ||
        ep.image?.medium ||
        show.image?.original ||
        show.image?.medium ||
        "";

    image.alt = `${show.name} cover art`;
    image.hidden = !image.src;

    title.textContent = show.name;

    const minutes = ep.runtime || show.averageRuntime || show.runtime;

    runtime.textContent = minutes
        ? `Runtime: ${ep.start.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit"
            }) + " - " + ep.end.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit"
            })}`
        : "Runtime unavailable";

    // TVmaze summaries contain HTML, so parse them into a safe text display.
    description.replaceChildren();

    const summaryText = show.summary || "No description available.";
    const parsed = new DOMParser().parseFromString(
        summaryText,
        "text/html"
    );

    description.textContent =
        parsed.body.textContent.trim() || "No description available.";

    showModal.hidden = false;
    closeModalButton.focus();
}

function closeShowModal() {
    showModal.hidden = true;
}

closeModalButton.addEventListener("click", closeShowModal);

showModal.addEventListener("click", event => {
    if (event.target === showModal) {
        closeShowModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !showModal.hidden) {
        closeShowModal();
    }
});

document.getElementById("refresh-guide")
    .addEventListener("click", loadTVGuide);

loadTVGuide();

// Refresh every minute so the timeline follows the current time.
setInterval(loadTVGuide, 60_000);