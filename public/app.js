const API_URL = "https://api.tvmaze.com";
const API_KEY = "VUqlkNdRXXNofKzvZma55dVo7f3yUn74";

let loggedInUser = null;

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
                openShowPopup(ep);
            });

            block.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openShowPopup(ep);
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

const showPopup = document.getElementById("show-popup");
const closePopupButton = document.getElementById("close-popup");

function openShowPopup(ep) {
    const show = ep.show;

    const image = document.getElementById("popup-image");
    const title = document.getElementById("popup-title");
    const runtime = document.getElementById("popup-runtime");
    const description = document.getElementById("popup-description");

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

    showPopup.hidden = false;
    closePopupButton.focus();

    loadEpisodeRating(ep);
}

function closeShowPopup() {
    showPopup.hidden = true;
}

closePopupButton.addEventListener("click", closeShowPopup);

showPopup.addEventListener("click", event => {
    if (event.target === showPopup) {
        closeShowPopup();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !showPopup.hidden) {
        closeShowPopup();
    }
});


async function loadEpisodeRating(ep) {
    const section = document.getElementById("episode-rating");

    if (!section) return;

    section.replaceChildren();

    // Ratings are visible only to logged-in users.
    if (!loggedInUser) {
        section.hidden = true;
        return;
    }

    section.hidden = false;

    const heading = document.createElement("h3");
    heading.textContent = "Episode Rating";

    const communityRating = document.createElement("p");
    communityRating.id = "community-rating";
    communityRating.textContent = "Loading ratings...";

    const controls = document.createElement("div");
    controls.id = "rating-controls";

    const prompt = document.createElement("p");
    prompt.textContent = "Rate this episode:";

    const stars = document.createElement("div");
    stars.className = "rating-stars";
    stars.setAttribute("role", "group");
    stars.setAttribute("aria-label", "Choose a rating from one to five stars");

    const message = document.createElement("p");
    message.id = "rating-message";
    message.setAttribute("aria-live", "polite");

    let selectedRating = 0;

    const starButtons = [];

    for (let value = 1; value <= 5; value++) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "★";
        button.setAttribute("aria-label", `${value} star${value > 1 ? "s" : ""}`);
        button.setAttribute("aria-pressed", "false");

        button.addEventListener("click", () => {
            selectedRating = value;

            starButtons.forEach((star, index) => {
                const selected = index < selectedRating;
                star.classList.toggle("selected", selected);
                star.setAttribute("aria-pressed", String(selected));
            });

            message.textContent = `Selected ${value} out of 5 stars.`;
        });

        starButtons.push(button);
        stars.appendChild(button);
    }

    const submit = document.createElement("button");
    submit.id = "submit-rating";
    submit.type = "button";
    submit.textContent = "Submit rating";
    submit.disabled = true;

    // Enable submission after a star is selected.
    stars.addEventListener("click", () => {
        submit.disabled = selectedRating === 0;
    });

    submit.addEventListener("click", async () => {
        if (!selectedRating) return;

        submit.disabled = true;
        message.textContent = "Saving rating...";

        try {
            const response = await fetch(
                `/api/episodes/${encodeURIComponent(ep.id)}/rating`,
                {
                    method: "PUT",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ rating: selectedRating })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Could not save rating.");
            }

            message.textContent = "Your rating has been saved.";

            await loadEpisodeRating(ep);
        } catch (error) {
            message.textContent = error.message;
            submit.disabled = false;
        }
    });

    controls.append(prompt, stars, submit);
    section.append(heading, communityRating, controls, message);

    try {
        const response = await fetch(
            `/api/episodes/${encodeURIComponent(ep.id)}/rating`,
            { credentials: "same-origin" }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Could not load ratings.");
        }

        communityRating.textContent = data.count > 0
            ? `Community rating: ${Number(data.average).toFixed(1)}/5 (${data.count} ratings)`
            : "No ratings yet.";

        if (data.myRating) {
            selectedRating = data.myRating;

            starButtons.forEach((star, index) => {
                const selected = index < selectedRating;
                star.classList.toggle("selected", selected);
                star.setAttribute("aria-pressed", String(selected));
            });

            submit.disabled = false;
            message.textContent = `Your current rating: ${selectedRating}/5.`;
        }
    } catch (error) {
        communityRating.textContent = "Ratings are temporarily unavailable.";
        console.error("Could not load episode ratings:", error);
    }
}


document.getElementById("refresh-guide")
    .addEventListener("click", loadTVGuide);

loadTVGuide();

// Refresh every minute so the timeline follows the current time.
setInterval(loadTVGuide, 60_000);

// Login Front End System
/*const authModal = document.getElementById("auth-modal");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const authSubmit = document.getElementById("auth-submit");
const authSwitch = document.getElementById("auth-switch");
const authMessage = document.getElementById("auth-message");*/

async function restoreLogin() {
    const area = document.getElementById("account-area");

    try {
        const response = await fetch("/api/auth/me", {
            credentials: "same-origin"
        });

        if (!response.ok) {
            throw new Error("Could not check login status.");
        }

        const data = await response.json();

        if (data.user) {
            renderAccount(data.user);
        } else {
            renderLoggedOut();
        }
    } catch (error) {
        console.error(error);
        renderLoggedOut();
    }
}

function renderLoggedOut() {
    loggedInUser = null;

    const area = document.getElementById("account-area");
    area.replaceChildren();

    const login = document.createElement("a");
    login.href = "login.html";
    login.className = "account-button";
    login.textContent = "Log In";

    const signup = document.createElement("a");
    signup.href = "signup.html";
    signup.className = "signup-button";
    signup.textContent = "Sign Up";

    area.append(login, signup);
}


function renderAccount(user) {
    loggedInUser = user;

    const area = document.getElementById("account-area");
    area.replaceChildren();

    const menu = document.createElement("div");
    menu.className = "account-dropdown";

    const trigger = document.createElement("button");
    trigger.className = "account-trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-expanded", "false");

    const avatar = document.createElement("span");
    avatar.className = "user-avatar";
    avatar.textContent = (user.username || "U").charAt(0).toUpperCase();

    const username = document.createElement("span");
    username.className = "account-trigger-name";
    username.textContent = user.username;

    const arrow = document.createElement("span");
    arrow.textContent = "▾";
    arrow.setAttribute("aria-hidden", "true");

    trigger.append(avatar, username, arrow);

    const dropdown = document.createElement("div");
    dropdown.className = "account-dropdown-menu";
    dropdown.hidden = true;

    function addMenuItem(label, action, className = "") {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;

        if (className) button.className = className;

        button.addEventListener("click", () => {
            dropdown.hidden = true;
            trigger.setAttribute("aria-expanded", "false");
            action();
        });

        dropdown.appendChild(button);
    }

    addMenuItem("★  My Rated Episodes", () => {
        window.location.href = "/rated-episodes.html";
    });

    addMenuItem("⚙  My Profile", () => {
        window.location.href = "/profile.html";
    });

    addMenuItem("Log Out", async () => {
        try {
            const response = await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "same-origin"
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Could not log out.");
            }

            window.location.href = "/";
        } catch (error) {
            alert(error.message);
        }
    }, "dropdown-logout");

    trigger.addEventListener("click", () => {
        const isOpening = dropdown.hidden;
        dropdown.hidden = !isOpening;
        trigger.setAttribute("aria-expanded", String(isOpening));
    });

    document.addEventListener("click", event => {
        if (!menu.contains(event.target)) {
            dropdown.hidden = true;
            trigger.setAttribute("aria-expanded", "false");
        }
    });

    menu.append(trigger, dropdown);
    area.appendChild(menu);
}


restoreLogin();

// Password visibility toggle.
// Only runs on pages containing the password toggle elements.

const passwordInput = document.getElementById("auth-password");
const passwordToggle = document.getElementById("toggle-password");
const eyeIcon = document.getElementById("eye-icon");

if (passwordInput && passwordToggle && eyeIcon) {
    passwordToggle.addEventListener("click", () => {
        const showPassword = passwordInput.type === "password";

        passwordInput.type = showPassword ? "text" : "password";

        passwordToggle.setAttribute(
            "aria-label",
            showPassword ? "Hide password" : "Show password"
        );

        passwordToggle.setAttribute(
            "aria-pressed",
            String(showPassword)
        );

        eyeIcon.innerHTML = showPassword
            ? `
                <path d="M3 3l18 18"/>
                <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/>
                <path d="M9.9 5.2A11 11 0 0 1 12 5
                         c6.5 0 10 7 10 7a16 16 0 0 1-4 4.7"/>
                <path d="M6.2 6.2C3.5 8 2 12 2 12
                         s3.5 7 10 7a10 10 0 0 0 3-.5"/>
            `
            : `
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
                <circle cx="12" cy="12" r="3"/>
            `;
    });
}