const statusElement = document.getElementById("ratings-status");
const container = document.getElementById("rated-episodes");

const API_URL = "https://api.tvmaze.com";

async function loadRatedEpisodes() {
    try {
        statusElement.textContent = "Loading your ratings...";

        const response = await fetch("/api/users/me/ratings", {
            credentials: "same-origin"
        });

        const data = await response.json();

        if (response.status === 401) {
            window.location.replace("/");
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || "Could not load ratings.");
        }

        const ratings = data.ratings || [];

        statusElement.textContent =
            `You've rated ${ratings.length} episode(s).`;

        // Fetch TVmaze details for each rated episode.
        const episodes = await Promise.all(
            ratings.map(async rating => {
                try {
                    const tvmazeResponse = await fetch(
                        `${API_URL}/episodes/${encodeURIComponent(
                            rating.tvmaze_episode_id
                        )}`
                    );

                    if (!tvmazeResponse.ok) {
                        throw new Error("Episode details unavailable.");
                    }

                    const episode = await tvmazeResponse.json();

                    return {
                        id: rating.tvmaze_episode_id,
                        rating: Number(rating.rating),
                        name: episode.name,
                        image:
                            episode.image?.medium ||
                            episode.image?.original ||
                            null,
                        showName: episode._embedded?.show?.name ||
                            "TV Show",
                        season: episode.season,
                        number: episode.number
                    };
                } catch (error) {
                    console.error(
                        `Could not load episode ${rating.tvmaze_episode_id}:`,
                        error
                    );

                    // Still display the rating if TVmaze is unavailable.
                    return {
                        id: rating.tvmaze_episode_id,
                        rating: Number(rating.rating),
                        name: `Episode ${rating.tvmaze_episode_id}`,
                        image: null,
                        showName: "TV Show"
                    };
                }
            })
        );

        renderRatedEpisodes(episodes);

    } catch (error) {
        console.error("Could not load rated episodes:", error);
        statusElement.textContent = error.message;
    }
}

function renderRatedEpisodes(episodes) {
    container.replaceChildren();

    if (episodes.length === 0) {
        statusElement.textContent =
            "You haven't rated any episodes yet.";
        return;
    }

    episodes.forEach(episode => {
        const card = document.createElement("article");
        card.className = "rated-episode-card";

        // Episode image.
        const image = document.createElement("img");
        image.className = "rated-episode-image";
        image.alt = `${episode.name} episode image`;
        image.loading = "lazy";

        if (episode.image) {
            image.src = episode.image;
        } else {
            image.hidden = true;
        }

        // Episode information.
        const details = document.createElement("div");
        details.className = "rated-episode-details";

        const showName = document.createElement("h3");
        showName.textContent = episode.showName;

        const episodeName = document.createElement("p");
        episodeName.className = "rated-episode-name";

        const episodeNumber =
            episode.season != null && episode.number != null
                ? `S${episode.season} E${episode.number} — `
                : "";

        episodeName.textContent =
            `${episodeNumber}${episode.name}`;

        // User's rating.
        const rating = document.createElement("p");
        rating.className = "rated-episode-rating";
        rating.textContent =
            `Your rating: ${"★".repeat(episode.rating)}${"☆".repeat(5 - episode.rating)} (${episode.rating}/5)`;

        details.append(showName, episodeName, rating);
        card.append(image, details);
        container.appendChild(card);
    });
}

loadRatedEpisodes();
