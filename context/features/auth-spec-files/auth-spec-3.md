# Auth UI - Register


## Requirements
- Change the Sign up text to "Register Here"
- Redirect "Register Here" to /register

### Sign In Page (`/sign-in`)

- Email and password input fields
- "Sign in with Google" button
- Link to register page
- Form validation and error display

### Register Page (`/register`)

- Name, email, password, confirm password fields
- Google register
- Form validation (passwords match, email format)
- Submit to `/api/auth/register`
- Redirect to sign-in on success




## Testing
1. Go to `/sign-in` - verify custom page renders
2. Sign in with GitHub - verify flow works
3. Sign in with email/password - verify flow works
4. Verify avatar shows in top bar (GitHub image or initials)
5. Click avatar - verify dropdown appears
6. Click "Sign out" - verify logout and redirect
7. Go to `/register` - create new account - verify redirect to sign-in