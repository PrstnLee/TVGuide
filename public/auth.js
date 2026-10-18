
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const authForm = loginForm || signupForm;
const authMessage = document.getElementById("auth-message");

document.querySelectorAll("[data-password-toggle]").forEach(button => {
    button.addEventListener("click", () => {
        const input = document.getElementById(
            button.dataset.passwordToggle
        );

        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Hide" : "Show";
        button.setAttribute(
            "aria-label",
            show ? "Hide password" : "Show password"
        );
        button.setAttribute("aria-pressed", String(show));
    });
});

if (signupForm) {
    signupForm.addEventListener("submit", async event => {
        event.preventDefault();

        const password = document.getElementById("password").value;
        const confirmation =
            document.getElementById("confirm-password").value;

        if (password !== confirmation) {
            authMessage.textContent = "Passwords do not match.";
            return;
        }

        await submitAuth("/api/auth/register", {
            username: document.getElementById("username").value.trim(),
            password
        }, signupForm);
    });
}

if (loginForm) {
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        await submitAuth("/api/auth/login", {
            username: document.getElementById("username").value.trim(),
            password: document.getElementById("password").value
        }, loginForm);
    });
}

async function submitAuth(endpoint, payload, form) {
    const submitButton = form.querySelector('button[type="submit"]');

    submitButton.disabled = true;
    authMessage.textContent = "Please wait...";

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Something went wrong.");
        }

        authMessage.textContent = "Success! Redirecting...";

        window.location.assign("/");
    } catch (error) {
        authMessage.textContent = error.message;
    } finally {
        submitButton.disabled = false;
    }
}
