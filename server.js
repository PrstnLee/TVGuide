require("dotenv").config();

const express = require("express");
const session = require("express-session");
const MySQLStoreFactory = require("express-mysql-session");
const bcrypt = require("bcryptjs");
const db = require("./database");
const path = require("path");

const app = express();
const MySQLStore = MySQLStoreFactory(session);



(async () => {
    try {
        const connection = await db.getConnection();
        console.log("MySQL connection successful!");
        connection.release();
    } catch (error) {
        console.error("MySQL connection test failed:", error.code);
        console.error(error.message);
    }
})();



const sessionStore = new MySQLStore({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    createDatabaseTable: true,

    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 24 * 60 * 60 * 1000
});

app.use(express.json({ limit: "10kb" }));

app.use(session({
    name: "tvguide.sid",
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use(express.static(path.join(__dirname, "public")));

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            error: "Please log in first."
        });
    }

    next();
}

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

// Register a new user
app.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body;

    if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        !/^[a-zA-Z0-9_]{3,50}$/.test(username) ||
        password.length < 8 ||
        Buffer.byteLength(password, "utf8") > 72
    ) {
        return res.status(400).json({
            error: "Username must be 3–50 letters, numbers, or underscores. Password must be at least 8 characters."
        });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);

        const [result] = await db.execute(
            `INSERT INTO users (username, password_hash, role)
             VALUES (?, ?, 'user')`,
            [username, passwordHash]
        );

        await regenerateSession(req);

        req.session.user = {
            id: result.insertId,
            username,
            role: "user"
        };

        res.status(201).json({ user: req.session.user });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "That username is already taken."
            });
        }

        console.error("Registration failed:", error);
        res.status(500).json({ error: "Registration failed." });
    }
});

// Log in using username and password.
app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;

    if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        username.length > 50 ||
        password.length > 72
    ) {
        return res.status(400).json({
            error: "Invalid username or password."
        });
    }

    try {
        const [rows] = await db.execute(
            `SELECT id, username, password_hash, role
             FROM users
             WHERE username = ?`,
            [username]
        );

        const user = rows[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({
                error: "Incorrect username or password."
            });
        }

        await regenerateSession(req);

        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role
        };

        res.json({ user: req.session.user });
    } catch (error) {
        console.error("Login failed:", error);
        res.status(500).json({ error: "Login failed." });
    }
});

// Return the current login state.
app.get("/api/auth/me", (req, res) => {
    res.json({
        user: req.session.user || null
    });
});

// Log out.
app.post("/api/auth/logout", requireLogin, (req, res, next) => {
    req.session.destroy(error => {
        if (error) return next(error);

        res.clearCookie("tvguide.sid", {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/"
        });

        res.json({ message: "Logged out." });
    });
});

// Public community rating; personal rating is included when logged in.
app.get("/api/episodes/:id/rating", async (req, res) => {
    const episodeId = Number(req.params.id);

    if (!Number.isSafeInteger(episodeId) || episodeId <= 0) {
        return res.status(400).json({ error: "Invalid episode ID." });
    }

    try {
        const [rows] = await db.execute(
            `SELECT ROUND(AVG(rating), 1) AS average,
                    COUNT(*) AS count
             FROM ratings
             WHERE tvmaze_episode_id = ?`,
            [episodeId]
        );

        let myRating = null;

        if (req.session.user) {
            const [mine] = await db.execute(
                `SELECT rating FROM ratings
                 WHERE user_id = ? AND tvmaze_episode_id = ?`,
                [req.session.user.id, episodeId]
            );

            if (mine.length) myRating = mine[0].rating;
        }

        res.json({
            average: rows[0].average === null
                ? null
                : Number(rows[0].average),
            count: Number(rows[0].count),
            myRating
        });
    } catch (error) {
        console.error("Rating lookup failed:", error);
        res.status(500).json({
            error: "Could not load ratings."
        });
    }
});

// Create or update the logged-in user's rating.
app.put("/api/episodes/:id/rating", requireLogin, async (req, res) => {
    const episodeId = Number(req.params.id);
    const rating = req.body.rating;

    if (!Number.isSafeInteger(episodeId) || episodeId <= 0) {
        return res.status(400).json({ error: "Invalid episode ID." });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({
            error: "Rating must be a whole number from 1 to 5."
        });
    }

    try {
        await db.execute(
            `INSERT INTO ratings (user_id, tvmaze_episode_id, rating)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating)`,
            [req.session.user.id, episodeId, rating]
        );

        res.json({ message: "Rating saved.", myRating: rating });
    } catch (error) {
        console.error("Rating submission failed:", error);
        res.status(500).json({
            error: "Could not save rating."
        });
    }
});



app.get("/api/users/me/ratings", requireLogin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT tvmaze_episode_id, rating
             FROM ratings
             WHERE user_id = ?
             ORDER BY tvmaze_episode_id DESC`,
            [req.session.user.id]
        );

        const ratings = await Promise.all(
            rows.map(async (row) => {
                try {
                    const response = await fetch(
                        `https://api.tvmaze.com/episodes/${row.tvmaze_episode_id}`
                    );

                    if (!response.ok) {
                        throw new Error("Episode not found");
                    }

                    const episode = await response.json();

                    // TVmaze's episode endpoint does not include
                    // the show's details, so fetch the show separately.
                    const showResponse = await fetch(
                        `https://api.tvmaze.com/shows/${episode._links.show.href.split("/").pop()}`
                    );

                    const show = showResponse.ok
                        ? await showResponse.json()
                        : null;

                    return {
                        tvmaze_episode_id: row.tvmaze_episode_id,
                        rating: row.rating,
                        name: episode.name,
                        showName: show?.name || "Unknown show",
                        image: episode.image?.medium
                            || show?.image?.medium
                            || null
                    };
                } catch (error) {
                    console.error(
                        `Could not load episode ${row.tvmaze_episode_id}:`,
                        error.message
                    );

                    return {
                        tvmaze_episode_id: row.tvmaze_episode_id,
                        rating: row.rating,
                        name: "Episode details unavailable",
                        showName: "Unknown show",
                        image: null
                    };
                }
            })
        );

        res.json({ ratings });
    } catch (error) {
        console.error("Could not load user ratings:", error);
        res.status(500).json({
            error: "Could not load your ratings."
        });
    }
});


// Delete a rating
app.delete("/api/episodes/:id/rating", requireLogin, async (req, res) => {
    const episodeId = Number(req.params.id);

    if (!Number.isSafeInteger(episodeId) || episodeId <= 0) {
        return res.status(400).json({ error: "Invalid episode ID." });
    }

    try {
        await db.execute(
            `DELETE FROM ratings
             WHERE user_id = ? AND tvmaze_episode_id = ?`,
            [req.session.user.id, episodeId]
        );

        res.json({ message: "Rating removed." });
    } catch (error) {
        console.error("Rating removal failed:", error);
        res.status(500).json({
            error: "Could not remove rating."
        });
    }
});


// Changes user's username
app.put("/api/users/me/username", requireLogin, async (req, res) => {
    const username = req.body.username;

    if (
        typeof username !== "string" ||
        !/^[a-zA-Z0-9_]{3,50}$/.test(username)
    ) {
        return res.status(400).json({
            error: "Username must be 3–50 letters, numbers, or underscores."
        });
    }

    try {
        await db.execute(
            "UPDATE users SET username = ? WHERE id = ?",
            [username, req.session.user.id]
        );

        req.session.user.username = username;

        req.session.save(error => {
            if (error) {
                console.error("Could not save updated session:", error);
                return res.status(500).json({
                    error: "Username changed, but the session could not be updated. Refresh the page."
                });
            }

            res.json({
                message: "Username updated successfully.",
                user: req.session.user
            });
        });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "That username is already taken."
            });
        }

        console.error("Username update failed:", error);
        res.status(500).json({ error: "Could not update username." });
    }
});

// Delete user's account
app.delete("/api/users/me", requireLogin, async (req, res) => {
    const userId = req.session.user.id;

    try {
        // Delete ratings explicitly so this works even if the
        // ratings table does not have ON DELETE CASCADE.
        await db.execute(
            "DELETE FROM ratings WHERE user_id = ?",
            [userId]
        );

        const [result] = await db.execute(
            "DELETE FROM users WHERE id = ?",
            [userId]
        );

        if (result.affectedRows !== 1) {
            return res.status(404).json({ error: "Account not found." });
        }

        req.session.destroy(error => {
            if (error) {
                console.error("Session destruction failed:", error);
                return res.status(500).json({
                    error: "Account deleted, but logout could not be completed. Please clear your session and log in again."
                });
            }

            res.clearCookie("tvguide.sid", {
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/"
            });

            res.json({ message: "Account deleted successfully." });
        });
    } catch (error) {
        console.error("Account deletion failed:", error);
        res.status(500).json({ error: "Could not delete your account." });
    }
});

// Generic error handler.
app.use((error, req, res, next) => {
    console.error("Server error:", error);
    if (res.headersSent) return next(error);
    res.status(500).json({ error: "An unexpected error occurred." });
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
    console.log(`TV Guide running at http://localhost:${port}`);
});