
const usernameForm = document.getElementById("username-form");
const usernameInput = document.getElementById("new-username");
const message = document.getElementById("profile-message");
const deleteButton = document.getElementById("delete-account");

async function checkLogin() {
    const response = await fetch("/api/auth/me", {
        credentials: "same-origin"
    });

    const data = await response.json();

    if (!data.user) {
        window.location.replace("/");
        return null;
    }

    usernameInput.value = data.user.username;
    return data.user;
}

usernameForm.addEventListener("submit", async event => {
    event.preventDefault();

    const username = usernameInput.value.trim();

    try {
        const response = await fetch("/api/users/me/username", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Could not update username.");
        }

        message.textContent = data.message;
    } catch (error) {
        message.textContent = error.message;
    }
});

deleteButton.addEventListener("click", async () => {
    const confirmed = confirm(
        "Are you sure you want to permanently delete your account and all your ratings? This cannot be undone."
    );

    if (!confirmed) return;

    const username = prompt(
        "For confirmation, type DELETE to permanently delete your account."
    );

    if (username !== "DELETE") {
        message.textContent = "Account deletion cancelled.";
        return;
    }

    deleteButton.disabled = true;

    try {
        const response = await fetch("/api/users/me", {
            method: "DELETE",
            credentials: "same-origin"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Could not delete account.");
        }

        alert("Your account has been deleted.");
        window.location.replace("/");
    } catch (error) {
        message.textContent = error.message;
        deleteButton.disabled = false;
    }
});

checkLogin().catch(error => {
    console.error(error);
    message.textContent = "Could not verify your login. Please try again.";
});
