document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegisterLink = document.getElementById('showRegister');
    const showLoginLink = document.getElementById('showLogin');
    const loginFormContainer = document.getElementById('login-form-container');
    const registerFormContainer = document.getElementById('register-form-container');
    const loginErrorEl = document.getElementById('loginError');
    const registerMessageEl = document.getElementById('registerMessage');

    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginFormContainer.style.display = 'none';
        registerFormContainer.style.display = 'block';
        loginErrorEl.textContent = '';
        registerMessageEl.textContent = '';
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerFormContainer.style.display = 'none';
        loginFormContainer.style.display = 'block';
        loginErrorEl.textContent = '';
        registerMessageEl.textContent = '';
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginErrorEl.textContent = '';
        const username = loginForm.username.value;
        const password = loginForm.password.value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                // Login successful
                window.location.href = '/chat.html'; // Redirect to chat page
            } else {
                // Login failed
                loginErrorEl.textContent = data.message || 'Login failed. Please check your credentials.';
            }
        } catch (error) {
            console.error('Login error:', error);
            loginErrorEl.textContent = 'An error occurred. Please try again.';
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerMessageEl.textContent = '';
        registerMessageEl.classList.remove('error-message'); // Remove error class if present
        const username = registerForm.username.value;
        const password = registerForm.password.value;

        if (password.length < 6) {
            registerMessageEl.textContent = 'Password must be at least 6 characters long.';
            registerMessageEl.classList.add('error-message');
            return;
        }

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.status === 201) {
                // Registration successful
                registerMessageEl.textContent = 'Registration successful! Please login.';
                registerMessageEl.classList.remove('error-message');
                registerForm.reset();
                // Optionally, switch to login form
                setTimeout(() => {
                    showLoginLink.click();
                }, 2000);
            } else {
                // Registration failed
                registerMessageEl.textContent = data.message || 'Registration failed. Please try again.';
                registerMessageEl.classList.add('error-message');
            }
        } catch (error) {
            console.error('Registration error:', error);
            registerMessageEl.textContent = 'An error occurred during registration. Please try again.';
            registerMessageEl.classList.add('error-message');
        }
    });
});
