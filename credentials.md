Admin
admin@store.com
admin123



Customer
john@example.com
customer123










Google OAuth credentials you need
Step 1 — Google Cloud Console
Go to Google Cloud Console
Create a project (or pick an existing one)
Open APIs & Services → OAuth consent screen
User type: External (for testing)
App name, support email, developer email
Add scopes: email, profile, openid
Add your email as a Test user (while in testing mode)
Open APIs & Services → Credentials → Create Credentials → OAuth client ID
Application type: Web application
Authorized redirect URIs (required):
http://localhost:5000/api/auth/oauth/google/callback
Copy the Client ID and Client Secret
Step 2 — Add to backend/.env
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
API_URL=http://localhost:5000
CLIENT_URL=http://localhost:5173
Step 3 — Restart backend
cd backend
npm run dev
Step 4 — Test
Open http://localhost:5173/login
Click Continue with Google
Complete Google sign-in
You should land back in the store, logged in
Full env checklist for OAuth
Variable	Example	Purpose
GOOGLE_CLIENT_ID
123...apps.googleusercontent.com
From Google Cloud
GOOGLE_CLIENT_SECRET
GOCSPX-...
From Google Cloud
API_URL
http://localhost:5000
Backend URL (OAuth callback)
CLIENT_URL
http://localhost:5173
Frontend URL (redirect after login)
Production redirect URI
When you deploy, add this in Google Cloud Console:

https://your-api-domain.com/api/auth/oauth/google/callback
And update .env:

API_URL=https://your-api-domain.com
CLIENT_URL=https://your-store-domain.com
After you add the Google credentials and restart the backend, share your Client ID prefix (first few characters only) if the button still doesn't redirect correctly.