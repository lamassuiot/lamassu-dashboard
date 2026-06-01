// public/config.js
window.lamassuConfig = {
    // --- Core API Endpoint ---
    // Routes through the local Next.js proxy to avoid CORS in dev
    LAMASSU_API: "/api/lamassu",

    // --- Authentication (OIDC / Cognito) ---
    LAMASSU_AUTH_ENABLED: true,
    LAMASSU_AUTH_AUTHORITY: "https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_d2VFzoHA2",
    LAMASSU_AUTH_CLIENT_ID: "2sskv9h3clq7ctls2sg7u4grlk",

    // --- UI Customization ---
    LAMASSU_FOOTER_ENABLED: false,
    TOAST_POSITION: "top-center",
    DISPLAY_DATE_FORMAT: "dd/MM/yyyy HH:mm",
    DISPLAY_DATE_AND_TIME_FORMAT: "dd/MM/yyyy HH:mm:ss",

    // Mattin AI config is server-side only (.env.local) — not needed here
};
